import type { DiffRow } from "../diff/document";
export interface RemovedLines {
  before: number;
  lines: { text: string; oldLine: number | null }[];
}
export interface CodeChanges {
  added: number[];
  removed: RemovedLines[];
}
export function wholeFileChanges(rows: DiffRow[]) {
  const lines: string[] = [],
    added: number[] = [],
    removed: RemovedLines[] = [];
  for (const row of rows) {
    if (row.kind === "removed") {
      const before = lines.length + 1;
      let block = removed.at(-1);
      if (!block || block.before !== before) {
        block = { before, lines: [] };
        removed.push(block);
      }
      block.lines.push({ text: row.text, oldLine: row.oldLine });
    } else if (row.kind === "added" || row.kind === "context") {
      lines.push(row.text);
      if (row.kind === "added") added.push(lines.length);
    }
  }
  const last = rows
    .filter((r) => r.kind === "added" || r.kind === "context")
    .at(-1);
  return {
    text: lines.join("\n") + (lines.length && !last?.noNewline ? "\n" : ""),
    changes: { added, removed },
  };
}
export interface FoldRange {
  from: number;
  to: number;
}
export function unchangedRanges(
  ranges: FoldRange[],
  changedPositions: number[],
) {
  const sorted = [...ranges].sort((a, b) => a.from - b.from || b.to - a.to);
  // Only top-level ranges are considered; changed parents never fold their children automatically.
  return sorted
    .filter(
      (range, i) =>
        !sorted
          .slice(0, i)
          .some((parent) => parent.from <= range.from && parent.to >= range.to),
    )
    .filter(
      (range) =>
        !changedPositions.some((pos) => pos >= range.from && pos <= range.to),
    );
}
