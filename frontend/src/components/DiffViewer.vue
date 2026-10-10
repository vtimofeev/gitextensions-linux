<template>
  <div class="diff-viewer" :style="{ '--diff-row-height': rowHeight + 'px' }">
    <div class="diff-columns">
      <span>{{ $t("beforeLines") }}</span
      ><span>{{ $t("afterLines") }}</span
      ><span>{{ $t("fileContent") }}</span>
    </div>
    <div
      ref="viewport"
      class="diff-scroll"
      tabindex="0"
      :aria-label="$t('diff')"
      @scroll="scroll"
    >
      <div
        v-if="document.rows.length"
        class="diff-spacer"
        :style="{
          height: `${document.rows.length * rowHeight}px`,
          minWidth: `${document.maxColumns + 16}ch`,
        }"
      >
        <div
          class="diff-window"
          :style="{ transform: `translateY(${start * rowHeight}px)` }"
        >
          <div
            v-for="(row, index) in visible"
            :key="start + index"
            class="diff-line"
            :class="row.kind"
            :data-row="start + index"
          >
            <template v-if="row.kind === 'hunk'"
              ><span class="hunk-label"
                >{{ range(row) }}
                <span v-if="row.text"> · {{ row.text }}</span></span
              ></template
            >
            <span v-else-if="row.kind === 'notice'" class="diff-notice">{{
              row.text
            }}</span>
            <template v-else
              ><span class="line-number old-line">{{ row.oldLine ?? "" }}</span
              ><span class="line-number new-line">{{ row.newLine ?? "" }}</span
              ><code
                ><span
                  v-for="(token, part) in tokens[
                    start + index - tokenStart
                  ] || [{ text: row.text, className: '' }]"
                  :key="part"
                  :class="token.className"
                  >{{ token.text }}</span
                ><span v-if="row.noNewline" class="newline-note">
                  {{ $t("noFinalNewline") }}</span
                ></code
              ></template
            >
          </div>
        </div>
      </div>
      <p v-else class="empty">{{ emptyMessage || $t("noDifferences") }}</p>
    </div>
  </div>
</template>
<script lang="ts">
import { Component, Vue, Prop, Watch, toNative } from "vue-facing-decorator";
import { markRaw } from "vue";
import { DiffDocument, type DiffRow } from "../diff/document";
import type { CodeToken } from "../domain/diff-syntax";
import { DiffHighlighter } from "../domain/diff-highlighter";
import "../theme/syntax.scss";
import { container } from "../store/container";
@Component
class DiffViewer extends Vue {
  @Prop({ type: String, required: true }) value!: string;
  @Prop({ default: "" }) fileName!: string;
  tokens: CodeToken[][] = [];
  tokenStart = 0;
  private syntaxGeneration = 0;
  private highlightedGeneration = 0;
  private highlighter = markRaw(new DiffHighlighter());
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;
  get syntaxConfiguration() {
    return [this.fileName, container.preferences.syntaxEnabled];
  }
  @Watch("value")
  @Watch("syntaxConfiguration")
  @Watch("plain")
  highlight() {
    const token = ++this.syntaxGeneration;
    if (this.highlightTimer !== null) clearTimeout(this.highlightTimer);
    this.highlighter.cancel();
    this.tokens = [];
    if (!container.preferences.syntaxEnabled || !this.value) return;
    this.highlightTimer = setTimeout(async () => {
      this.highlightTimer = null;
      this.highlightedGeneration = token;
      const range = await this.highlighter.highlight(
        this.value,
        this.fileName,
        this.plain,
        this.start,
        this.end,
      );
      if (token === this.syntaxGeneration) {
        this.tokenStart = range.start;
        this.tokens = markRaw(range.tokens);
      }
    }, 80);
  }
  @Prop({ type: Boolean, default: false }) plain!: boolean;
  @Prop({ type: String, default: "" }) emptyMessage!: string;
  offset = 0;
  height = 320;
  get rowHeight() {
    const p = container.preferences;
    return Math.round(
      (Math.max(p.fontSize, Number(p.codeSize) || p.fontSize) * 20) / 13,
    );
  }
  private observer: ResizeObserver | null = null;
  get document() {
    return markRaw(new DiffDocument(this.value, this.plain));
  }
  get start() {
    return Math.max(0, Math.floor(this.offset / this.rowHeight) - 5);
  }
  get visible() {
    return this.document.rows.slice(this.start, this.end);
  }
  get end() {
    return this.start + Math.ceil(this.height / this.rowHeight) + 11;
  }
  get tokenWindow() {
    return `${this.start}:${this.end}`;
  }
  @Watch("tokenWindow")
  highlightWindow() {
    const token = this.syntaxGeneration;
    if (token !== this.highlightedGeneration) return;
    this.highlighter.range(this.start, this.end, (range) => {
      if (token !== this.syntaxGeneration || range.start !== this.start) return;
      this.tokenStart = range.start;
      this.tokens = markRaw(range.tokens);
    });
  }
  mounted() {
    const viewport = this.$refs.viewport as HTMLElement;
    this.observer = markRaw(
      new ResizeObserver(() => {
        this.height = viewport.clientHeight;
      }),
    );
    this.observer.observe(viewport);
    this.reset();
    void this.highlight();
  }
  beforeUnmount() {
    ++this.syntaxGeneration;
    if (this.highlightTimer !== null) clearTimeout(this.highlightTimer);
    this.highlighter.dispose();
    this.observer?.disconnect();
  }
  @Watch("value")
  @Watch("fileName")
  @Watch("plain")
  reset() {
    this.offset = 0;
    const viewport = this.$refs.viewport as HTMLElement;
    if (viewport) {
      viewport.scrollTop = 0;
      viewport.scrollLeft = 0;
    }
  }
  scroll(event: Event) {
    this.offset = (event.target as HTMLElement).scrollTop;
  }
  range(row: DiffRow) {
    const last = (start: number | null, count: number | undefined) =>
      Math.max(start ?? 0, (start ?? 0) + (count ?? 1) - 1);
    return container.i18n.t("diffRange", {
      old: `${row.oldLine}–${last(row.oldLine, row.oldCount)}`,
      new: `${row.newLine}–${last(row.newLine, row.newCount)}`,
    });
  }
}
export default toNative(DiffViewer);
</script>
<style lang="scss" scoped>
.diff-viewer {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.diff-columns {
  flex-shrink: 0;
}
.diff-columns,
.diff-line {
  display: grid;
  grid-template-columns: 52px 52px minmax(0, 1fr);
}
.diff-columns {
  font-size: calc(var(--font-size-base) * 10 / 13);
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border);
  padding: 2px 0;
  span {
    text-align: right;
    padding-right: 6px;
  }
  span:last-child {
    text-align: left;
    padding-left: 8px;
  }
}
.diff-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  font: var(--font-size-code)/var(--diff-row-height) var(--font-code);
  tab-size: 4;
}
.diff-spacer {
  position: relative;
  width: 100%;
}
.diff-window {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
}
.diff-line {
  height: var(--diff-row-height);
  box-sizing: border-box;
  code {
    font: inherit;
    white-space: pre;
    padding: 0 8px;
  }
  .line-number {
    text-align: right;
    padding: 0 6px;
    color: var(--color-text-secondary);
    user-select: none;
    border-right: 1px solid var(--color-border-subtle);
  }
  .hunk-label,
  .diff-notice {
    grid-column: 1 / -1;
    white-space: pre;
    padding: 0 8px;
    color: var(--color-text-secondary);
  }
  .newline-note {
    font-size: calc(var(--font-size-base) * 10 / 13);
    color: var(--color-text-secondary);
  }
  &.added {
    background: var(--diff-added-background);
    code {
      color: var(--color-positive);
    }
  }
  &.removed {
    background: var(--diff-removed-background);
    code {
      color: var(--color-negative);
    }
  }
  &.hunk {
    background: var(--color-surface-subtle);
  }
}
</style>
