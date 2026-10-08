<template>
  <div class="code-viewer" @keydown="viewerKey">
    <p v-if="tooLarge" class="syntax-note" role="status">
      {{ $t("syntaxLargeFile") }}
    </p>
    <div v-if="changes" class="change-actions">
      <Button
        :label="$t('previousChange')"
        icon="pi pi-arrow-up"
        text
        size="small"
        :disabled="!changePositions.length"
        @click="jump(-1)"
      />
      <Button
        :label="$t('nextChange')"
        icon="pi pi-arrow-down"
        text
        size="small"
        :disabled="!changePositions.length"
        @click="jump(1)"
      />
      <label
        ><input
          type="checkbox"
          v-model="foldRegions"
          :disabled="!preferences.foldingEnabled"
        />{{ $t("foldUnchanged") }}</label
      >
      <span v-if="!changePositions.length">{{ $t("noRevisionChanges") }}</span>
    </div>
    <div ref="editor" class="code-editor" />
  </div>
</template>
<script lang="ts">
import { Component, Vue, Prop, Watch, toNative } from "vue-facing-decorator";
import { markRaw, render, h } from "vue";
import Button from "primevue/button";
import AuthorAvatar from "./AuthorAvatar.vue";
import { EditorState, Compartment, type Extension } from "@codemirror/state";
import {
  EditorView,
  lineNumbers,
  gutter,
  GutterMarker,
  Decoration,
  keymap,
  highlightActiveLine,
  drawSelection,
} from "@codemirror/view";
import {
  syntaxHighlighting,
  bracketMatching,
  foldGutter,
  codeFolding,
  foldKeymap,
  foldEffect,
  unfoldEffect,
  foldedRanges,
  foldable,
  ensureSyntaxTree,
} from "@codemirror/language";
import {
  search,
  searchKeymap,
  highlightSelectionMatches,
  gotoLine,
} from "@codemirror/search";
import { selectAll } from "@codemirror/commands";
import { codeTheme, appHighlightStyle } from "../theme/code-theme";
import { loadLanguage, largeFile } from "../domain/syntax";
import { unchangedRanges, type CodeChanges } from "../domain/code-changes";
import { changeDecorations } from "../domain/code-decorations";
import { authorColor } from "../domain/author-color";
import { blameBlocks, compactDate } from "../domain/blame";
import type { BlameLine } from "../domain/models";
import { container } from "../store/container";
class BlameMarker extends GutterMarker {
  constructor(
    readonly line: BlameLine,
    readonly first: boolean,
    readonly alternate: boolean,
    readonly file: string,
    readonly commit: (hash: string) => void,
  ) {
    super();
  }
  toDOM() {
    const p = container.preferences,
      settings = p.blame,
      line = this.line;
    const button = document.createElement("button");
    button.className = "blame-gutter" + (this.alternate ? " alternate" : "");
    button.style.borderLeftColor = authorColor(line.email || line.author);
    button.title = `${container.i18n.date(line.date)} · ${line.summary} · ${line.author} <${line.email}> · ${line.hash}`;
    button.setAttribute("aria-label", button.title);
    button.onclick = () => this.commit(line.hash);
    if (this.first) {
      // Date and author are separate so the date never truncates and the
      // author name shrinks only after the original path.
      const date = settings.showDate
        ? compactDate(line.date, p.locale, true, settings.showTime)
        : "";
      const parts: [string, string][] = [];
      if (date) parts.push(["blame-date", date]);
      if (settings.showAuthor) parts.push(["blame-author", line.author]);
      if (settings.authorFirst) parts.reverse();
      const info = document.createElement("span");
      info.className = "blame-info";
      parts.forEach(([className, text], index) => {
        if (index) info.append(" - ");
        const span = document.createElement("span");
        span.className = className;
        span.textContent = text;
        if (className === "blame-author")
          span.style.color = authorColor(line.email || line.author);
        info.append(span);
      });
      button.append(info);
      if (settings.avatar) {
        const avatar = document.createElement("span");
        avatar.className = "blame-avatar";
        render(
          h(AuthorAvatar, { name: line.author, email: line.email }),
          avatar,
        );
        button.append(avatar);
      }
      if (
        settings.originalFilePath &&
        line.originalPath &&
        line.originalPath !== this.file
      ) {
        const path = document.createElement("span");
        path.className = "blame-path";
        path.textContent = line.originalPath;
        button.append(path);
      }
    }
    return button;
  }
  destroy(dom: HTMLElement) {
    const avatar = dom.querySelector(".blame-avatar");
    if (avatar) render(null, avatar);
  }
}
@Component({ components: { Button }, emits: ["commit"] })
class CodeViewer extends Vue {
  @Prop({ default: "" }) readonly text!: string;
  @Prop({ default: "" }) readonly fileName!: string;
  @Prop({ default: () => [] }) readonly blame!: BlameLine[];
  @Prop() readonly changes?: CodeChanges;
  @Prop({ default: 1 }) readonly firstLine!: number;
  @Prop({ default: false }) readonly foldUnchanged!: boolean;
  foldRegions = false;
  private view: EditorView | null = null;
  private language = markRaw(new Compartment());
  private appearance = markRaw(new Compartment());
  private options = markRaw(new Compartment());
  private generation = 0;
  private change = -1;
  get preferences() {
    return container.preferences;
  }
  get documentText() {
    return this.blame.length
      ? this.blame.map((line) => line.text).join("\n")
      : this.text;
  }
  get tooLarge() {
    return largeFile(this.documentText);
  }
  get configuration() {
    const p = this.preferences;
    return JSON.stringify([
      p.syntaxEnabled,
      p.foldingEnabled,
      p.blame,
      p.locale,
      p.themeRevision,
      this.firstLine,
    ]);
  }
  get changePositions() {
    const doc = this.view?.state.doc;
    if (!doc || !this.changes) return [];
    return [
      ...new Set([
        ...this.changes.added,
        ...this.changes.removed.map((block) => block.before),
      ]),
    ]
      .sort((a, b) => a - b)
      .map((line) => doc.line(Math.max(1, Math.min(doc.lines, line))).from);
  }
  get navigationPositions() {
    const doc = this.view?.state.doc;
    const positions = this.changePositions;
    return doc
      ? positions.filter(
          (pos, index) =>
            index === 0 ||
            doc.lineAt(pos).number >
              doc.lineAt(positions[index - 1]!).number + 1,
        )
      : [];
  }
  extensions(): Extension[] {
    const p = this.preferences;
    const phrases: Record<string, string> = {
      Find: container.i18n.t("cmFind"),
      Replace: container.i18n.t("cmReplace"),
      next: container.i18n.t("cmNext"),
      previous: container.i18n.t("cmPrevious"),
      all: container.i18n.t("cmAll"),
      "match case": container.i18n.t("cmMatchCase"),
      regexp: container.i18n.t("cmRegexp"),
      "by word": container.i18n.t("cmByWord"),
      close: container.i18n.t("cmClose"),
      "Go to line": container.i18n.t("cmGotoLine"),
    };
    const result: Extension[] = [
      EditorState.phrases.of(phrases),
      search({ top: true }),
      highlightSelectionMatches(),
      ...(p.syntaxEnabled ? [syntaxHighlighting(appHighlightStyle)] : []),
      keymap.of([
        { key: "Mod-g", run: gotoLine },
        ...searchKeymap,
        { key: "Mod-a", run: selectAll },
        ...(p.foldingEnabled ? foldKeymap : []),
        {
          key: "Alt-ArrowDown",
          run: () => {
            this.jump(1);
            return !!this.changes;
          },
        },
        {
          key: "Alt-ArrowUp",
          run: () => {
            this.jump(-1);
            return !!this.changes;
          },
        },
      ]),
    ];
    if (!this.blame.length || p.blame.lineNumbers)
      result.push(
        lineNumbers({ formatNumber: (n) => String(n + this.firstLine - 1) }),
      );
    if (p.foldingEnabled)
      result.push(
        foldGutter(),
        codeFolding({
          preparePlaceholder: (_state, range) => range,
          placeholderDOM: (view, _click, range) => {
            const chip = document.createElement("span");
            chip.className = "cm-foldPlaceholder";
            chip.textContent = "{ … }";
            chip.title = container.i18n.t("linesHidden", {
              n:
                view.state.doc.lineAt(range.to).number -
                view.state.doc.lineAt(range.from).number,
            });
            chip.onclick = _click;
            return chip;
          },
        }),
      );
    if (this.blame.length) {
      const blocks = blameBlocks(this.blame);
      const markers = this.blame.map(
        (line, i) =>
          new BlameMarker(
            line,
            blocks[i]!.first,
            blocks[i]!.alternate,
            this.fileName,
            (hash) => this.$emit("commit", hash),
          ),
      );
      if (this.view)
        result.push(
          EditorView.decorations.of(
            Decoration.set(
              blocks.flatMap((block, i) =>
                block.alternate
                  ? [
                      Decoration.line({ class: "cm-blame-alternate" }).range(
                        this.view!.state.doc.line(i + 1).from,
                      ),
                    ]
                  : [],
              ),
            ),
          ),
        );
      result.push(
        gutter({
          class: "cm-blame",
          lineMarker: (_view, line) =>
            markers[_view.state.doc.lineAt(line.from).number - 1] ?? null,
        }),
      );
    }
    if (this.changes && this.view)
      result.push(
        EditorView.decorations.of(
          changeDecorations(this.view.state.doc, this.changes),
        ),
      );
    return result;
  }
  viewerKey(event: KeyboardEvent) {
    if (event.defaultPrevented) event.stopPropagation();
  }
  mounted() {
    this.foldRegions = this.foldUnchanged;
    this.view = markRaw(
      new EditorView({
        parent: this.$refs.editor as HTMLElement,
        state: EditorState.create({
          doc: this.documentText,
          extensions: [
            EditorState.readOnly.of(true),
            EditorView.editable.of(false),
            EditorView.contentAttributes.of({
              tabindex: "0",
              "aria-label": this.blame.length ? "Blame lines" : "File contents",
            }),
            drawSelection(),
            highlightActiveLine(),
            bracketMatching(),
            this.language.of([]),
            this.appearance.of(codeTheme()),
            this.options.of([]),
          ],
        }),
      }),
    );
    void this.configure();
  }
  @Watch("documentText")
  @Watch("changes")
  reset() {
    if (!this.view) return;
    this.view.dispatch({
      changes: {
        from: 0,
        to: this.view.state.doc.length,
        insert: this.documentText,
      },
      selection: { anchor: 0 },
      effects: this.options.reconfigure([]),
    });
    this.view.scrollDOM.scrollTop = 0;
    this.change = -1;
    void this.configure();
  }
  @Watch("configuration")
  @Watch("fileName")
  async configure() {
    const view = this.view;
    if (!view) return;
    const token = ++this.generation;
    const previousFolds: { from: number; to: number }[] = [];
    foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
      previousFolds.push({ from, to });
    });
    view.dispatch({
      effects: [
        this.options.reconfigure(this.extensions()),
        this.appearance.reconfigure(codeTheme()),
        this.language.reconfigure([]),
      ],
    });
    const language =
      (this.preferences.syntaxEnabled || this.preferences.foldingEnabled) &&
      !this.tooLarge
        ? await loadLanguage(this.fileName)
        : null;
    if (token !== this.generation || this.view !== view) return;
    view.dispatch({ effects: this.language.reconfigure(language ?? []) });
    if (this.foldRegions) this.applyFolds();
    else if (this.preferences.foldingEnabled && previousFolds.length)
      view.dispatch({
        effects: previousFolds.map((range) => foldEffect.of(range)),
      });
    if (this.changes && this.change === -1) this.jump(1);
  }
  @Watch("foldUnchanged")
  foldPropChanged() {
    this.foldRegions = this.foldUnchanged;
  }
  @Watch("foldRegions")
  applyFolds() {
    const view = this.view;
    if (!view) return;
    const effects = [];
    foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
      effects.push(unfoldEffect.of({ from, to }));
    });
    if (this.foldRegions && this.preferences.foldingEnabled) {
      ensureSyntaxTree(view.state, view.state.doc.length, 1000);
      const ranges = [];
      for (let i = 1; i <= view.state.doc.lines; i++) {
        const line = view.state.doc.line(i),
          range = foldable(view.state, line.from, line.to);
        if (range) ranges.push(range);
      }
      // A changed line touching the opening/closing line also protects the fold.
      const positions = this.changePositions.flatMap((pos) => {
        const line = view.state.doc.lineAt(pos);
        return [line.from, line.to];
      });
      for (const range of unchangedRanges(ranges, positions))
        effects.push(foldEffect.of(range));
    }
    if (effects.length) view.dispatch({ effects });
  }
  jump(direction: number) {
    const view = this.view,
      positions = this.navigationPositions;
    if (!view || !positions.length) return;
    this.change =
      (this.change + direction + positions.length) % positions.length;
    const pos = positions[this.change]!;
    view.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: "center" }),
    });
  }
  beforeUnmount() {
    ++this.generation;
    this.view?.destroy();
    this.view = null;
  }
}
export default toNative(CodeViewer);
</script>
<style lang="scss">
.code-viewer {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
.code-editor {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.syntax-note {
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
}
.change-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  flex-wrap: wrap;
}
.code-viewer .cm-line.cm-added-line {
  background: var(--diff-added-background);
}
.cm-removed-block {
  background: var(--diff-removed-background);
  color: var(--color-text);
  user-select: none;
  pointer-events: none;
}
.cm-removed-line {
  display: flex;
  white-space: pre;
  code {
    font: inherit;
  }
}
.removed-number {
  width: 6ch;
  padding-right: 12px;
  text-align: right;
  color: var(--color-text-secondary);
  flex: none;
}
.code-viewer .cm-line.cm-blame-alternate:not(.cm-activeLine) {
  background: color-mix(in srgb, var(--color-text) 3%, var(--color-level-100));
}
.cm-blame .cm-gutterElement {
  padding: 0;
}
/* Compact gutter: info shrinks with an ellipsis, full details are in the tooltip. */
.blame-gutter {
  width: calc(var(--font-size-base) * 260 / 13);
  height: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  border: 0;
  border-left: 3px solid;
  padding: 0 6px;
  background: transparent;
  color: var(--color-text-secondary);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  &.alternate {
    background: color-mix(
      in srgb,
      var(--color-text) 3%,
      var(--color-level-100)
    );
  }
}
.blame-info {
  display: flex;
  flex: 0 1 auto;
  min-width: 0;
  white-space: pre;
}
.blame-date {
  flex: none;
  white-space: nowrap;
}
.blame-author,
.blame-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.blame-author {
  flex: 0 1 auto;
}
.blame-path {
  flex: 0 100 auto;
}
.blame-avatar {
  flex: none;
  display: flex;
}
.blame-path {
  color: var(--color-text-secondary);
}
</style>
