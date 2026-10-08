// SPDX-License-Identifier: GPL-3.0-only
// Fixtures and ASCII verifier adapted from Git Extensions RevisionGraphTests.cs.
// Linux/TypeScript adaptation modified 2026-10-08. See NOTICE.md for attribution.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { RevisionGraph, type GraphRow } from "../src/graph/layout";
import type { Commit } from "../src/domain/models";
function commits(spec: string): Commit[] {
  return spec
    .split(" ")
    .map((value) => {
      const [hash, parents] = value.split(":");
      return {
        hash: hash!,
        parents: parents?.split(",") ?? [],
        subject: hash!,
        authorEmail: "author@example.test",
        author: "",
        date: "",
        refs: "",
      };
    })
    .reverse();
}
function ascii(rows: GraphRow[]) {
  const result: string[] = [];
  rows.forEach((row, i) => {
    let line = Array(row.laneCount * 2 + 1).fill(" ");
    for (const segment of row.segments) line[row.lane(segment).index * 2] = "|";
    line[row.nodeLane * 2] = row.node.hash.length === 1 ? row.node.hash : "*";
    result.push(line.join("").trimEnd());
    const next = rows[i + 1];
    if (!next) return;
    line = Array(Math.max(row.laneCount, next.laneCount) * 2 + 1).fill(" ");
    const actions: Array<() => void> = [];
    for (const segment of row.segments) {
      const from = row.lane(segment).index * 2,
        to = next.lane(segment).index * 2;
      if (to === -2) continue;
      if (to === from)
        actions.push(() => {
          line[from] = "|";
        });
      else if (to === from + 2)
        actions.push(() => {
          line[from + 1] = line[from + 1] === "/" ? "X" : "\\";
        });
      else if (to === from - 2)
        actions.push(() => {
          line[from - 1] = line[from - 1] === "\\" ? "X" : "/";
        });
      else if (to > from) {
        line[from + 1] = "`";
        line[to] = "ˎ";
        for (let j = from + 2; j < to; j++) line[j] = "-";
      } else {
        line[from - 1] = "´";
        line[to] = ",";
        for (let j = to + 1; j < from - 1; j++) line[j] = "-";
      }
    }
    actions.forEach((a) => a());
    result.push(line.join("").trimEnd());
  });
  return result.join("\n");
}
const fixtures: Record<string, string> = {
  SegmentsAreStraightened: "1 2:1 3:1 4:1,3 5:4 6:5 7:5,6 8:7,2",
  SegmentsWithCommitsAreStraightened: "1 2:1 3:1 4:1,3 5:2 6:5 7:4 8:4,7 9:8,6",
  SegmentsWithOutgoingSecondaryMergesAreNotStraightened:
    "1 2:1 3:1 4:1,3 5:2 6:4,5 7:6 8:6,7 9:8,5",
  SegmentsWithIncomingMergesAreStraightened:
    "1 2:1 3:1 4:1,3 5:2,4 6:4 7:4,6 8:7,5",
  SegmentsAreStraightenedAlthoughThisCausesWidthIncrease:
    "1 2:1 3:1 4:1 5:1,4 6:2 7:2,6 8:5 9:5,8,3,7",
  SegmentsWithOutgoingPrimaryMergesAreStraightened:
    "1 2:1 3:1 6:1 7:1,6 8:3,2 9:7 10:7,9,8",
  SegmentsAreNotStraightenedIfThisCausesAShiftForPrimarySegment:
    "1 a:1 b:1 2:1 3:1 4:1 5:4,1 6:3 7:5,6 8:7,2,6 c:8 d:8 e:8 9:8,e,d,c,b,a",
};
describe("original Git Extensions lane rules", () => {
  for (const [name, spec] of Object.entries(fixtures))
    it(name, () => {
      const expected = readFileSync(
        `${process.cwd()}/tests/graph-fixtures/${name}.txt`,
        "utf8",
      )
        .replace(/^\uFEFF/, "")
        .trimEnd();
      expect(ascii(new RevisionGraph().buildRows(commits(spec), false))).toBe(
        expected,
      );
    });
  it("keeps isolated roots separate from passing edges", () => {
    expect(
      ascii(new RevisionGraph().buildRows(commits("3 2 1:3"), false)),
    ).toBe("1\n|\n| 2\n|\n3");
  });
  it("corrects a parent loaded before its child", () => {
    const input = commits("root child:root").reverse();
    expect(new RevisionGraph().layout(input).rows.map((r) => r.hash)).toEqual([
      "child",
      "root",
    ]);
  });
  it("retains unfinished parent tails at the history boundary", () => {
    const graph = new RevisionGraph().layout(commits("tip:missing"));
    expect(graph.rows[0]?.lines).toEqual([
      { from: 0, to: 0, color: expect.any(Number), tail: true },
    ]);
  });
  it("keeps every parent edge of an octopus merge", () => {
    const graph = new RevisionGraph().layout(
      commits("root a:root b:root c:root merge:a,b,c"),
    );
    expect(graph.rows[0]?.lines).toHaveLength(3);
  });
  it("lays out 50,000 linear commits without recursion or oversized Canvas allocation", () => {
    const input: Commit[] = Array.from({ length: 50000 }, (_, i) => ({
      hash: `c${i}`,
      parents: i < 49999 ? [`c${i + 1}`] : [],
      subject: "",
      authorEmail: "author@example.test",
      author: "",
      date: "",
      refs: "",
    }));
    const started = performance.now(),
      graph = new RevisionGraph().layout(input);
    expect(graph.rows).toHaveLength(50000);
    expect(graph.lanes).toBe(1);
    console.info(
      `50k linear graph: ${Math.round(performance.now() - started)} ms`,
    );
  });
});
