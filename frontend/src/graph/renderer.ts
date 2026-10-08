import type { Snapshot } from "../domain/models";
import type { GraphLayout } from "./layout";
import { historyRowHeight } from "./metrics";
export const LANE_WIDTH = 18;
// The first lane sits clear of the selected row's 3px accent bar, so the HEAD
// ring (radius 8) does not touch it; extra width keeps the right margin unchanged.
export const GRAPH_LEFT = 17;
export const GRAPH_EXTRA_WIDTH = GRAPH_LEFT + 12;
export const MAX_LANES = 40;
const fallbackPalette = [
  "#4385de",
  "#cb6b26",
  "#9a62d5",
  "#268b70",
  "#cf557e",
  "#779129",
  "#2b94ab",
  "#b68c22",
];
export class GraphPointers {
  readonly head: string;
  readonly branch: string;
  constructor(snapshot: Snapshot | null) {
    this.branch =
      snapshot?.branches.find((b) => b.current && !b.remote)?.hash ?? "";
    this.head =
      snapshot?.commits.find((c) => /(^|, )HEAD(?: ->|$|,)/.test(c.refs))
        ?.hash ?? (snapshot?.detached ? "" : this.branch);
  }
}
export class GraphRenderer {
  draw(
    canvas: HTMLCanvasElement,
    layout: GraphLayout,
    offset: number,
    height: number,
    pointers: GraphPointers,
    commits: Map<string, { refs: string }>,
  ) {
    const styles = getComputedStyle(canvas);
    const fontSize =
      parseFloat(styles.getPropertyValue("--font-size-base")) || 13;
    const fontScale = fontSize / 13;
    const rowHeight = historyRowHeight(fontSize) / fontScale;
    const palette = fallbackPalette.map(
      (fallback, i) =>
        styles.getPropertyValue(`--graph-lane-${i + 1}`).trim() || fallback,
    );
    const width =
      (Math.min(MAX_LANES, layout.lanes) * LANE_WIDTH + GRAPH_EXTRA_WIDTH) *
      fontScale;
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale * fontScale, scale * fontScale);
    offset /= fontScale;
    height /= fontScale;
    ctx.lineWidth = 2;
    const first = Math.max(0, Math.floor(offset / rowHeight) - 1);
    const last = Math.min(
      layout.rows.length - 1,
      Math.ceil((offset + height) / rowHeight),
    );
    const x = (lane: number) => GRAPH_LEFT + lane * LANE_WIDTH;
    for (let i = first; i <= last; i++) {
      const row = layout.rows[i]!,
        y = i * rowHeight + rowHeight / 2 - offset;
      for (const line of row.lines) {
        if (line.from >= MAX_LANES || line.to >= MAX_LANES) continue;
        ctx.strokeStyle = palette[line.color]!;
        ctx.setLineDash(line.tail ? [3, 4] : []);
        const end = y + (line.tail ? rowHeight / 2 : rowHeight);
        ctx.beginPath();
        ctx.moveTo(x(line.from), y);
        if (line.from === line.to) ctx.lineTo(x(line.to), end);
        else
          ctx.bezierCurveTo(
            x(line.from),
            y + rowHeight / 2,
            x(line.to),
            end - rowHeight / 2,
            x(line.to),
            end,
          );
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    const background =
      styles.getPropertyValue("--color-level-200").trim() || "#fff";
    const headColor =
      styles.getPropertyValue("--graph-head").trim() || "#c87517";
    const branchColor =
      styles.getPropertyValue("--ref-local").trim() || "#7138a8";
    for (let i = first; i <= last; i++) {
      const row = layout.rows[i]!,
        y = i * rowHeight + rowHeight / 2 - offset;
      if (row.lane >= MAX_LANES) continue;
      const refs = commits.get(row.hash)?.refs ?? "";
      ctx.fillStyle = palette[row.color]!;
      ctx.strokeStyle = background;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (refs) ctx.rect(x(row.lane) - 5, y - 5, 10, 10);
      else ctx.arc(x(row.lane), y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (row.hash === pointers.head) {
        ctx.strokeStyle = headColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(x(row.lane), y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (row.hash === pointers.branch) {
        ctx.fillStyle = branchColor;
        ctx.strokeStyle = background;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x(row.lane) + 7, y - 10);
        ctx.lineTo(x(row.lane) + 15, y - 10);
        ctx.lineTo(x(row.lane) + 11, y - 3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }
}
