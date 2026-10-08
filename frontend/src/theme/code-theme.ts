import "./syntax.scss";
import { EditorView } from "@codemirror/view";
import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
export const syntaxTags = {
  keyword: [tags.keyword, tags.bool, tags.null],
  string: [tags.string, tags.regexp],
  number: tags.number,
  comment: tags.comment,
  function: [
    tags.function(tags.variableName),
    tags.function(tags.propertyName),
  ],
  type: [tags.typeName, tags.className],
  variable: tags.variableName,
  property: tags.propertyName,
  tag: tags.tagName,
  attribute: tags.attributeName,
  meta: tags.meta,
  operator: tags.operator,
  punctuation: tags.punctuation,
};
export const appHighlightStyle = HighlightStyle.define(
  Object.entries(syntaxTags).map(([name, tag]) => ({
    tag,
    class: `syntax-${name}`,
    color: `var(--syntax-${name})`,
    ...(name === "comment" ? { fontStyle: "italic" } : {}),
  })),
);
export function codeTheme() {
  return EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: "var(--color-level-200)",
      color: "var(--color-text)",
      fontSize: "var(--font-size-code)",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "var(--font-code)",
      lineHeight: "1.85",
    },
    ".cm-content": { caretColor: "var(--color-text)" },
    ".cm-gutters": {
      backgroundColor: "var(--color-level-100)",
      color: "var(--color-text-secondary)",
      borderColor: "var(--color-border)",
    },
    ".cm-activeLine, .cm-activeLineGutter": {
      backgroundColor: "var(--color-surface-subtle)",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      { backgroundColor: "var(--color-selection)" },
    ".cm-selectionMatch, .cm-searchMatch": {
      backgroundColor: "var(--color-selection)",
    },
    ".cm-searchMatch-selected": { outline: "1px solid var(--color-accent)" },
    ".cm-foldPlaceholder": {
      backgroundColor: "var(--color-surface-subtle)",
      border: "1px solid var(--color-border)",
      color: "var(--color-text-secondary)",
      borderRadius: "var(--radius-sm)",
      padding: "0 4px",
    },
    ".cm-panels": {
      backgroundColor: "var(--color-level-100)",
      color: "var(--color-text)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
    },
    ".cm-textfield, .cm-button": {
      background: "var(--color-input)",
      color: "var(--color-text)",
      border: "1px solid var(--color-input-border)",
      font: "inherit",
    },
  });
}
