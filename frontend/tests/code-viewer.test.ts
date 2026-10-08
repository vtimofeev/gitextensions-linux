import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import {
  detectLanguage,
  extensions,
  loadLanguage,
  largeFile,
  syntaxLimit,
} from "../src/domain/syntax";
import { wholeFileChanges, unchangedRanges } from "../src/domain/code-changes";
import { WholeFileDocument, DiffDocument } from "../src/diff/document";
import { diffTokens } from "../src/domain/diff-syntax";
import {
  changeDecorations,
  RemovedWidget,
} from "../src/domain/code-decorations";
import { presets } from "../src/theme/presets";
import { contrast } from "../src/theme/theme-format";
describe("language detection", () => {
  it("detects every listed extension without guessing from content", () => {
    for (const [ext, name] of Object.entries(extensions))
      expect(detectLanguage(`src/FILE.${ext.toUpperCase()}`)).toBe(name);
    expect(detectLanguage("Dockerfile")).toBe("dockerfile");
    expect(detectLanguage("Makefile")).toBe("shell");
    expect(detectLanguage("folder/no-extension")).toBeNull();
    expect(detectLanguage("file.unknown")).toBeNull();
  });
  it("loads all lazy grammars", async () => {
    for (const ext of Object.keys(extensions)) {
      const grammar = await loadLanguage(`file.${ext}`);
      expect(grammar).toBeTruthy();
      expect(() =>
        EditorState.create({ doc: "sample", extensions: [grammar!] }),
      ).not.toThrow();
    }
    expect(await loadLanguage("Dockerfile")).toBeTruthy();
  });
  it("uses the UTF-8 byte size limit", () => {
    expect(largeFile("x".repeat(syntaxLimit))).toBe(false);
    expect(largeFile("я".repeat(syntaxLimit / 2 + 1))).toBe(true);
  });
});
it("keeps real new text and positions removals before their replacement and at EOF", () => {
  const doc = new WholeFileDocument(
    "@@ -1,4 +1,3 @@\n first\n-old\n+new\n last\n-tail\n",
  );
  const value = wholeFileChanges(doc.rows);
  expect(value.text).toBe("first\nnew\nlast\n");
  expect(value.changes.added).toEqual([2]);
  expect(value.changes.removed).toEqual([
    { before: 2, lines: [{ text: "old", oldLine: 2 }] },
    { before: 4, lines: [{ text: "tail", oldLine: 4 }] },
  ]);
});
it("folds only unchanged top-level ranges", () => {
  const ranges = [
    { from: 1, to: 30 },
    { from: 5, to: 10 },
    { from: 40, to: 80 },
    { from: 50, to: 60 },
    { from: 90, to: 100 },
  ];
  expect(unchangedRanges(ranges, [20, 90])).toEqual([{ from: 40, to: 80 }]);
});
it("parses multiline comments across hunk boundaries on old and new sides", async () => {
  const rows = new DiffDocument(
    "@@ -1,3 +1,3 @@\n /* comment\n-old comment\n+new comment\n middle\n@@ -10,2 +10,2 @@\n end */\n const value = 42;\n",
  ).rows;
  const tokens = diffTokens(rows, (await loadLanguage("file.ts"))!);
  for (const [i, row] of rows.entries()) {
    if (
      row.text.includes("comment") ||
      row.text === "middle" ||
      row.text === "end */"
    )
      expect(
        tokens[i]!.some((token) => token.className.includes("syntax-comment")),
      ).toBe(true);
  }
  expect(
    tokens.at(-1)!.some((token) => token.className.includes("syntax-keyword")),
  ).toBe(true);
  expect(tokens.map((parts) => parts.map((p) => p.text).join(""))).toEqual(
    rows.map((row) => row.text),
  );
});
it("keeps all syntax colors readable on every preset and diff background", () => {
  for (const preset of Object.values(presets))
    for (const mode of ["light", "dark"] as const) {
      const colors = preset[mode];
      for (const [key, color] of Object.entries(colors))
        if (key.startsWith("syntax-")) {
          expect(
            contrast(color, colors["color-level-200"]),
            key,
          ).toBeGreaterThanOrEqual(4.5);
          for (const bg of [
            "diff-added-background",
            "diff-removed-background",
          ] as const)
            expect(
              contrast(color, colors[bg]),
              `${mode} ${key} ${bg}`,
            ).toBeGreaterThanOrEqual(4.5);
        }
    }
});

it("places actual line decorations and removed block widgets outside the document", () => {
  const state = EditorState.create({ doc: "first\nnew\nlast\n" });
  const changes = {
    added: [2],
    removed: [
      { before: 2, lines: [{ text: "old", oldLine: 2 }] },
      { before: 4, lines: [{ text: "tail", oldLine: 4 }] },
    ],
  };
  const items: {
    from: number;
    className: string;
    widget: boolean;
    side: number;
  }[] = [];
  changeDecorations(state.doc, changes).between(
    0,
    state.doc.length,
    (from, _to, value) => {
      items.push({
        from,
        className: value.spec.class ?? "",
        widget: value.spec.widget instanceof RemovedWidget,
        side: value.spec.side ?? 0,
      });
    },
  );
  expect(items).toEqual([
    { from: 6, className: "", widget: true, side: -1 },
    { from: 6, className: "cm-added-line", widget: false, side: 0 },
    { from: 15, className: "", widget: true, side: 1 },
  ]);
  expect(state.doc.toString()).toBe("first\nnew\nlast\n");
});
