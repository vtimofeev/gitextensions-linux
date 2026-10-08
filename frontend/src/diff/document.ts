export type DiffKind = "context" | "added" | "removed" | "hunk" | "notice";
export interface DiffRow {
  kind: DiffKind;
  text: string;
  oldLine: number | null;
  newLine: number | null;
  oldCount?: number;
  newCount?: number;
  noNewline?: boolean;
}
// Parses Git's unified patch into presentation data without exposing metadata as code.
export class DiffDocument {
  readonly rows: DiffRow[] = [];
  maxColumns = 0;
  constructor(value: string, plain = false) {
    const lines = value.split("\n");
    if (lines.at(-1) === "") lines.pop();
    if (plain && value !== "Binary file") {
      lines.forEach((text, index) =>
        this.add({ kind: "added", text, oldLine: null, newLine: index + 1 }),
      );
      return;
    }
    let old = 0,
      next = 0,
      inHunk = false;
    for (const line of lines) {
      const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(
        line,
      );
      if (hunk) {
        old = Number(hunk[1]);
        next = Number(hunk[3]);
        inHunk = true;
        this.add({
          kind: "hunk",
          text: hunk[5]!.trim(),
          oldLine: old,
          newLine: next,
          oldCount: hunk[2] === undefined ? 1 : Number(hunk[2]),
          newCount: hunk[4] === undefined ? 1 : Number(hunk[4]),
        });
        continue;
      }
      if (line.startsWith("diff --git ")) {
        inHunk = false;
        continue;
      }
      if (line === "\\ No newline at end of file") {
        const previous = this.rows.at(-1);
        if (previous) previous.noNewline = true;
        continue;
      }
      if (line.startsWith("[Preview truncated")) {
        this.add({
          kind: "notice",
          text: line.replace(/^\[|\]$/g, ""),
          oldLine: null,
          newLine: null,
        });
        continue;
      }
      if (inHunk) {
        if (line.startsWith("+"))
          this.add({
            kind: "added",
            text: line.slice(1),
            oldLine: null,
            newLine: next++,
          });
        else if (line.startsWith("-"))
          this.add({
            kind: "removed",
            text: line.slice(1),
            oldLine: old++,
            newLine: null,
          });
        else if (line.startsWith(" "))
          this.add({
            kind: "context",
            text: line.slice(1),
            oldLine: old++,
            newLine: next++,
          });
        continue;
      }
      const metadata =
        /^(old mode|new mode|new file mode|deleted file mode|rename from|rename to) (.*)$/.exec(
          line,
        );
      if (metadata) {
        this.add({
          kind: "notice",
          text:
            metadata[1]!.replaceAll(" mode", " permissions") +
            ": " +
            metadata[2],
          oldLine: null,
          newLine: null,
        });
        continue;
      }
      if (
        line === "Binary file" ||
        line.startsWith("Binary files ") ||
        line.startsWith("Submodule ")
      )
        this.add({ kind: "notice", text: line, oldLine: null, newLine: null });
    }
  }
  private add(row: DiffRow) {
    this.rows.push(row);
    this.maxColumns = Math.max(this.maxColumns, row.text.length);
  }
}

// Full-context patches already contain the entire file, including removed lines.
export class WholeFileDocument extends DiffDocument {
  constructor(value: string) {
    super(value);
    let count = 0;
    for (const row of this.rows) {
      if (
        row.kind !== "hunk" &&
        (row.kind !== "notice" || row.text.startsWith("Preview truncated"))
      )
        this.rows[count++] = row;
    }
    this.rows.length = count;
  }
}
