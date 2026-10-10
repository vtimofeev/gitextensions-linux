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
