import { it, expect } from "vitest";
import { DiffDocument } from "../src/diff/document";
it("strips metadata and counts old/new lines across hunks", () => {
  const doc = new DiffDocument(
    "diff --git a/file b/file\nindex 123..456 100644\n--- a/file\n+++ b/file\n@@ -3,3 +3,4 @@ function\n same\n-old\n+new\n+extra\n tail\n@@ -20 +21 @@\n-last\n+replacement\n\\ No newline at end of file\n",
  );
  expect(
    doc.rows
      .filter((r) => r.kind !== "hunk")
      .map((r) => [r.kind, r.oldLine, r.newLine, r.text]),
  ).toEqual([
    ["context", 3, 3, "same"],
    ["removed", 4, null, "old"],
    ["added", null, 4, "new"],
    ["added", null, 5, "extra"],
    ["context", 5, 6, "tail"],
    ["removed", 20, null, "last"],
    ["added", null, 21, "replacement"],
  ]);
  expect(doc.rows.at(-1)?.noNewline).toBe(true);
  expect(doc.rows.some((r) => r.text.startsWith("diff --git"))).toBe(false);
});
it("preserves plaintext prefixes and markup in untracked previews", () => {
  const doc = new DiffDocument(
    "--- text\n+++ text\n<script>alert(1)</script>\n",
    true,
  );
  expect(doc.rows.map((r) => r.text)).toEqual([
    "--- text",
    "+++ text",
    "<script>alert(1)</script>",
  ]);
  expect(doc.rows.map((r) => r.newLine)).toEqual([1, 2, 3]);
});
it("handles additions, deleted files, empty previews and binary summaries", () => {
  expect(
    new DiffDocument("@@ -0,0 +1,2 @@\n+one\n+two\n").rows.map(
      (r) => r.oldLine,
    ),
  ).toEqual([0, null, null]);
  expect(
    new DiffDocument("@@ -1,2 +0,0 @@\n-one\n-two\n").rows
      .filter((r) => r.kind === "removed")
      .map((r) => r.oldLine),
  ).toEqual([1, 2]);
  expect(new DiffDocument("").rows).toEqual([]);
  expect(new DiffDocument("Binary file", true).rows[0]?.kind).toBe("notice");
});

it("builds whole-file rows with both gutters and EOF markers from full context", async () => {
  const { WholeFileDocument } = await import("../src/diff/document");
  const doc = new WholeFileDocument(
    "diff --git a/file b/file\n@@ -1,3 +1,4 @@\n first\n-old\n+new\n+extra\n last\n\\ No newline at end of file\n",
  );
  expect(
    doc.rows.map((row) => [
      row.kind,
      row.oldLine,
      row.newLine,
      row.text,
      !!row.noNewline,
    ]),
  ).toEqual([
    ["context", 1, 1, "first", false],
    ["removed", 2, null, "old", false],
    ["added", null, 2, "new", false],
    ["added", null, 3, "extra", false],
    ["context", 3, 4, "last", true],
  ]);
});
