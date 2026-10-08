// SPDX-License-Identifier: GPL-3.0-only
// Lane assignment and straightening adapted from Git Extensions RevisionGraph.cs
// and RevisionGraphRow.cs. See docs/commit-graph.md for provenance and differences.
// Linux/TypeScript adaptation modified 2026-10-08. See NOTICE.md for attribution.
import type { Commit } from "../domain/models";
export enum Sharing {
  Primary,
  Entire,
  DifferentStart,
  DifferentEnd,
}
interface Lane {
  index: number;
  sharing: Sharing;
}
class Node {
  starts: Segment[] = [];
  commit?: Commit;
  constructor(
    readonly hash: string,
    public score: number,
  ) {}
}
class Segment {
  secondarySince = Infinity;
  color = 0;
  colorScore = Infinity;
  constructor(
    readonly child: Node,
    readonly parent: Node,
  ) {}
}
export class GraphRow {
  lanes = new Map<Segment, Lane>();
  gaps = new Set<number>();
  nodeLane = -1;
  laneCount = 0;
  constructor(
    readonly node: Node,
    readonly segments: Segment[],
  ) {
    let hasStart = false,
      hasEnd = false;
    // Map parent -> shared crossing lane avoids the original quadratic scan.
    const shared = new Map<Node, number>();
    for (const segment of segments) {
      let lane: Lane;
      if (segment.child === node || segment.parent === node) {
        if (this.nodeLane < 0) this.nodeLane = this.laneCount++;
        if (segment.child === node) {
          segment.secondarySince = Infinity;
          lane = {
            index: this.nodeLane,
            sharing: hasStart ? Sharing.DifferentEnd : Sharing.Primary,
          };
          hasStart = true;
        } else {
          lane = {
            index: this.nodeLane,
            sharing: hasEnd ? this.secondary(segment) : Sharing.Primary,
          };
          if (!hasEnd) segment.secondarySince = Infinity;
          hasEnd = true;
        }
      } else {
        const existing = shared.get(segment.parent);
        if (existing !== undefined && existing !== this.nodeLane) {
          lane = { index: existing, sharing: this.secondary(segment) };
        } else {
          segment.secondarySince = Infinity;
          lane = { index: this.laneCount++, sharing: Sharing.Primary };
        }
      }
      this.lanes.set(segment, lane);
      // The original searches earlier segments, including endpoints, excluding nodeLane.
      if (lane.index !== this.nodeLane && !shared.has(segment.parent))
        shared.set(segment.parent, lane.index);
    }
    if (this.nodeLane < 0) this.nodeLane = this.laneCount++;
  }
  private secondary(segment: Segment) {
    if (this.node.score > segment.secondarySince) return Sharing.Entire;
    segment.secondarySince = Math.min(segment.secondarySince, this.node.score);
    return Sharing.DifferentStart;
  }
  lane(segment: Segment): Lane {
    return this.lanes.get(segment) ?? { index: -1, sharing: Sharing.Primary };
  }
  firstParent(segment: Segment) {
    return segment.parent === this.node &&
      this.lane(segment).sharing === Sharing.Primary
      ? (this.segments.find((s) => s.child === this.node) ?? segment)
      : segment;
  }
  moveRight(from: number, by = 1) {
    for (; by > 0; by--, from++) {
      let gap = Infinity;
      for (const value of this.gaps)
        if (value > from) gap = Math.min(gap, value);
      if (this.nodeLane >= from && this.nodeLane < gap) this.nodeLane++;
      const moves = [...this.lanes.values()].filter(
        (l) => l.index >= from && l.index < gap,
      );
      if (!moves.length) return;
      this.gaps.add(from);
      if (gap < Infinity) this.gaps.delete(gap);
      else this.laneCount++;
      for (const lane of moves) lane.index++;
    }
  }
}
export interface GraphLine {
  from: number;
  to: number;
  color: number;
  tail?: boolean;
}
export interface LayoutRow {
  hash: string;
  lane: number;
  color: number;
  lines: GraphLine[];
}
export interface GraphLayout {
  rows: LayoutRow[];
  lanes: number;
}
export class RevisionGraph {
  buildRows(commits: Commit[], diagonals = true): GraphRow[] {
    const nodes = new Map<string, Node>();
    let score = 0;
    const ensureAbove = (node: Node, minimum: number) => {
      if (node.score >= minimum) return;
      node.score = minimum;
      const stack = [node];
      while (stack.length) {
        const child = stack.pop()!;
        score = Math.max(score, child.score);
        for (const segment of child.starts)
          if (segment.parent.score <= child.score) {
            segment.parent.score = child.score + 1;
            stack.push(segment.parent);
          }
      }
    };
    for (const commit of commits) {
      const node = nodes.get(commit.hash) ?? new Node(commit.hash, 0);
      node.score = ++score;
      node.commit = commit;
      nodes.set(commit.hash, node);
      for (const hash of commit.parents) {
        let parent = nodes.get(hash);
        if (!parent) {
          parent = new Node(hash, ++score);
          nodes.set(hash, parent);
        } else if (!parent.commit) parent.score = ++score;
        else ensureAbove(parent, ++score);
        node.starts.push(new Segment(node, parent));
      }
    }
    const ordered = [...nodes.values()]
      .filter((n) => n.commit)
      .sort((a, b) => a.score - b.score);
    const rows: GraphRow[] = [];
    for (const node of ordered) {
      const previous = rows.at(-1);
      const segments: Segment[] = [];
      let added = false;
      if (previous)
        for (const segment of previous.segments) {
          if (segment.parent === previous.node) continue;
          segments.push(segment);
          if (segment.parent !== node) continue;
          if (!added) {
            segments.push(...node.starts);
            added = true;
          }
          let neighbor = segment.color;
          for (let i = 0; i < node.starts.length; i++) {
            const start = node.starts[i]!;
            if (i === 0) {
              if (start.colorScore > segment.colorScore) {
                start.color = segment.color;
                start.colorScore = segment.colorScore;
              }
            } else if (start.colorScore === Infinity) {
              start.color = this.color(start, neighbor);
              start.colorScore = node.score;
            }
            neighbor = start.color;
          }
        }
      if (!added) {
        let neighbor = segments.at(-1)?.color ?? -1;
        for (const start of node.starts) {
          start.color = this.color(start, neighbor);
          start.colorScore = node.score;
          neighbor = start.color;
        }
        segments.push(...node.starts);
      }
      rows.push(new GraphRow(node, segments));
    }
    this.straighten(rows);
    if (diagonals) this.diagonals(rows);
    return rows;
  }
  layout(commits: Commit[]): GraphLayout {
    const rows = this.buildRows(commits);
    return {
      lanes: rows.reduce((max, row) => Math.max(max, row.laneCount), 1),
      rows: rows.map((row, index) => ({
        hash: row.node.hash,
        lane: row.nodeLane,
        color:
          row.segments.find(
            (s) => s.child === row.node || s.parent === row.node,
          )?.color ?? 0,
        lines: row.segments.flatMap((s) => {
          const lane = row.lane(s);
          if (
            lane.sharing === Sharing.Entire ||
            lane.sharing === Sharing.DifferentStart
          )
            return [];
          const next = rows[index + 1]?.lane(s).index ?? -1;
          if (next >= 0)
            return [{ from: lane.index, to: next, color: s.color }];
          if (index === rows.length - 1 && s.parent !== row.node)
            return [
              { from: lane.index, to: lane.index, color: s.color, tail: true },
            ];
          return [];
        }),
      })),
    };
  }
  private color(segment: Segment, neighbor: number) {
    let hash = 0;
    for (const c of segment.child.hash + segment.parent.hash)
      hash = (Math.imul(hash, 31) + c.charCodeAt(0)) | 0;
    let color = (hash >>> 0) % 8;
    if (color === neighbor) color = (color + 1) % 8;
    return color;
  }
  private straighten(rows: GraphRow[]) {
    let floor = 1;
    for (let i = 1; i < rows.length - 1;) {
      floor = Math.max(floor, i - 20);
      const row = rows[i]!;
      let moved = false;
      if (row.segments.length <= 80)
        for (const segment of row.segments.slice(0, 40)) {
          const lane = { ...row.lane(segment) },
            prev = rows[i - 1]!.lane(segment).index;
          if (lane.sharing !== Sharing.Primary || prev <= lane.index) continue;
          let ancestor = row.firstParent(segment),
            ahead = lane.index;
          for (
            let j = i + 1;
            ahead === lane.index && j <= Math.min(i + 20, rows.length - 1);
            j++
          ) {
            const next = rows[j]!;
            ahead = next.lane(ancestor).index;
            if (
              ahead === lane.index + 1 ||
              (ahead > lane.index + 1 && prev === lane.index + 1)
            ) {
              for (let k = i; k < j; k++) rows[k]!.moveRight(lane.index);
              moved = true;
              break;
            }
            ancestor = next.firstParent(ancestor);
          }
          if (moved) break;
        }
      i = moved ? Math.max(i - 20, floor) : i + 1;
    }
  }
  private diagonals(rows: GraphRow[]) {
    let floor = 1;
    for (let i = 1; i < rows.length - 1;) {
      floor = Math.max(floor, i - 10);
      const row = rows[i]!,
        end = Math.min(i + 10, rows.length - 1);
      let moved = false;
      if (row.segments.length <= 80)
        for (const segment of row.segments.slice(0, 40)) {
          const lane = { ...row.lane(segment) },
            current = lane.index,
            previous = rows[i - 1]!.lane(segment).index;
          if (lane.sharing !== Sharing.Primary) continue;
          const prevDiagonal = (delta = 1) =>
            i >= 2 &&
            rows[i - 2]!.lane(segment).index >= 0 &&
            rows[i - 2]!.lane(segment).index === previous + delta;
          let ancestor = row.firstParent(segment);
          const next = rows[i + 1]!,
            nextLane = next.lane(ancestor).index;
          if (
            current === previous - 1 &&
            i + 2 <= end &&
            nextLane === current
          ) {
            const endLane = rows[i + 2]!.lane(next.firstParent(ancestor)).index;
            if (endLane >= 0 && endLane === nextLane - 1 && !prevDiagonal()) {
              row.moveRight(current);
              moved = true;
              break;
            }
          }
          const turn = (delta: number) => {
            const moves: Array<{ row: GraphRow; lane: number; by: number }> =
              [];
            let segmentOrAncestor = segment,
              diagonal = previous >= 0 ? previous : current;
            const apply = (list: typeof moves) => {
              for (const m of list) m.row.moveRight(m.lane, m.by);
              return true;
            };
            for (let j = i; j <= end; j++) {
              diagonal += delta;
              const r = rows[j]!,
                l = r.lane(segmentOrAncestor),
                by = diagonal - l.index,
                last = l.sharing === Sharing.DifferentStart;
              if (
                by < 0 ||
                l.index < 0 ||
                (l.sharing !== Sharing.Primary && !last)
              )
                return false;
              if (
                by >= 2 &&
                moves.length === 2 &&
                j === i + 3 &&
                moves[1]!.by === 1
              )
                return apply(moves.slice(0, 1));
              if (by === 0 && moves.length) return apply(moves);
              if (last) return false;
              if (by > 0) moves.push({ row: r, lane: l.index, by });
              segmentOrAncestor = r.firstParent(segmentOrAncestor);
            }
            return false;
          };
          if (turn(1) || turn(-1)) {
            moved = true;
            break;
          }
          const deltaPrev = previous - current,
            deltaNext = current - nextLane;
          ancestor = next.firstParent(ancestor);
          const nextNextLane =
            i + 2 <= end ? rows[i + 2]!.lane(ancestor).index : -1;
          const nextDiagonal =
            nextNextLane >= 0 &&
            nextNextLane === nextLane - Math.sign(deltaNext);
          if (
            previous >= 0 &&
            Math.abs(deltaPrev) >= 1 &&
            nextLane >= 0 &&
            Math.sign(deltaNext) === Math.sign(deltaPrev) &&
            Math.abs(deltaNext + deltaPrev) >= 3 &&
            !prevDiagonal(Math.sign(deltaPrev)) &&
            !nextDiagonal
          ) {
            row.moveRight(current, deltaNext < 0 ? -deltaNext : deltaPrev);
            moved = true;
            break;
          }
        }
      i = moved ? Math.max(i - 10, floor) : i + 1;
    }
  }
}
