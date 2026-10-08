import { Decoration, WidgetType } from "@codemirror/view";
import type { Text } from "@codemirror/state";
import type { CodeChanges } from "./code-changes";
export class RemovedWidget extends WidgetType {
  constructor(readonly lines: { text: string; oldLine: number | null }[]) {
    super();
  }
  toDOM() {
    const block = document.createElement("div");
    block.className = "cm-removed-block";
    block.setAttribute("aria-label", "Removed lines");
    for (const line of this.lines) {
      const row = document.createElement("div");
      row.className = "cm-removed-line";
      const number = document.createElement("span");
      number.className = "removed-number";
      number.textContent = String(line.oldLine ?? "");
      const code = document.createElement("code");
      code.textContent = line.text;
      row.append(number, code);
      block.append(row);
    }
    return block;
  }
  ignoreEvent() {
    return true;
  }
}
export function changeDecorations(doc: Text, changes: CodeChanges) {
  const decorations = changes.added
    .filter((line) => line > 0 && line <= doc.lines)
    .map((line) =>
      Decoration.line({ class: "cm-added-line" }).range(doc.line(line).from),
    );
  for (const block of changes.removed) {
    const atEnd =
      block.before > doc.lines ||
      (block.before === doc.lines && doc.line(doc.lines).length === 0);
    const pos = atEnd ? doc.length : doc.line(Math.max(1, block.before)).from;
    decorations.push(
      Decoration.widget({
        widget: new RemovedWidget(block.lines),
        block: true,
        side: atEnd ? 1 : -1,
      }).range(pos),
    );
  }
  return Decoration.set(decorations, true);
}
