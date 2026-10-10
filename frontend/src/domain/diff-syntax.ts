import { EditorState } from "@codemirror/state";
import {
  ensureSyntaxTree,
  type Language,
  type LanguageSupport,
} from "@codemirror/language";
import { highlightTree } from "@lezer/highlight";
import { appHighlightStyle } from "../theme/syntax-style";
import type { DiffRow } from "../diff/document";
export interface CodeToken {
  text: string;
  className: string;
}
export function diffTokens(
  rows: DiffRow[],
  language: LanguageSupport | Language,
): CodeToken[][] {
  const result: CodeToken[][] = rows.map((row) => [
    { text: row.text, className: "" },
  ]);
  for (const side of ["oldLine", "newLine"] as const) {
    const code = rows.flatMap((row, index) =>
      row[side] !== null && !["hunk", "notice"].includes(row.kind)
        ? [{ row, index }]
        : [],
    );
    let text = "";
    const offsets = code.map(({ row }) => {
      const start = text.length;
      text += row.text + "\n";
      return start;
    });
    const state = EditorState.create({ doc: text, extensions: [language] });
    const tree = ensureSyntaxTree(state, text.length, 1000);
    if (!tree) continue;
    const spans: { from: number; to: number; className: string }[] = [];
    highlightTree(tree, appHighlightStyle, (from, to, className) =>
      spans.push({ from, to, className }),
    );
    let cursor = 0;
    code.forEach(({ row, index }, i) => {
      if (side === "oldLine" && row.kind === "context") return;
      const start = offsets[i]!,
        end = start + row.text.length;
      while (cursor < spans.length && spans[cursor]!.to <= start) cursor++;
      const tokens: CodeToken[] = [];
      let position = start;
      for (let j = cursor; j < spans.length && spans[j]!.from < end; j++) {
        const span = spans[j]!,
          from = Math.max(start, span.from),
          to = Math.min(end, span.to);
        if (from > position)
          tokens.push({ text: text.slice(position, from), className: "" });
        tokens.push({ text: text.slice(from, to), className: span.className });
        position = to;
      }
      if (position < end)
        tokens.push({ text: text.slice(position, end), className: "" });
      result[index] = tokens;
    });
  }
  return result;
}
