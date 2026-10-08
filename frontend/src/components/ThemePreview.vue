<template>
  <section
    class="theme-preview"
    :style="variables"
    :aria-label="$t('previewTitle')"
  >
    <div class="preview-toolbar">
      <span>⑂ main · ↑2 ↓1</span><button>{{ $t("push") }} 2</button>
    </div>
    <div
      v-for="(kind, index) in ['local', 'current', 'remote', 'tag']"
      :key="kind"
      class="preview-history"
    >
      <span
        class="lane"
        :style="{ color: 'var(--graph-lane-' + (index + 1) + ')' }"
        >│●│</span
      ><code>ab12cd{{ index }}</code
      ><span class="ref-label" :class="kind">{{
        ["feature", "main", "☁ origin/main", "# v1.0"][index]
      }}</span
      ><span>{{ $t("preview") }} {{ index + 1 }}</span>
    </div>
    <div class="preview-diff context"><code> const value = 1;</code></div>
    <div class="preview-diff added"><code>+ const ocean = true;</code></div>
    <div class="preview-diff removed"><code>− const old = false;</code></div>
    <div class="preview-diff hunk"><code>@@ −1,2 +1,2 @@</code></div>
    <div class="preview-code">
      <CodeViewer
        text='class Ocean {
  greeting = "hello"; // preview
  count = 42;
}'
        file-name="preview.ts"
      />
    </div>
    <p class="font-preview">Aa / 0123 / -&gt;</p>
    <code>Aa / 0123 / -&gt;</code>
  </section>
</template>
<script lang="ts">
import { Component, Prop, Vue, toNative } from "vue-facing-decorator";
import CodeViewer from "./CodeViewer.vue";
import type { Colors } from "../theme/presets";
@Component({ components: { CodeViewer } })
class ThemePreview extends Vue {
  @Prop({ required: true }) colors!: Colors;
  get variables() {
    return Object.fromEntries(
      Object.entries(this.colors).map(([key, value]) => ["--" + key, value]),
    );
  }
}
export default toNative(ThemePreview);
</script>
<style lang="scss" scoped>
.preview-code {
  height: 140px;
  display: flex;
}
.theme-preview {
  background: var(--color-level-200);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 8px;
  font-size: var(--text-xs);
  position: sticky;
  top: 0;
  overflow: hidden;
  code {
    font-family: var(--font-code);
    font-size: var(--font-size-code);
  }
}
.preview-toolbar {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--color-border);
  button {
    background: var(--color-accent);
    color: var(--color-level-200);
    border: 0;
    border-radius: var(--radius-sm);
    padding: 4px 8px;
  }
}
.preview-history {
  display: flex;
  align-items: center;
  gap: 5px;
  height: var(--history-row-height);
  white-space: nowrap;
}
.lane {
  font-family: var(--font-code);
}
.ref-label {
  border: 1px solid currentColor;
  border-radius: var(--radius-sm);
  padding: 0 3px;
  color: var(--ref-local);
  background: color-mix(in srgb, currentColor 11%, transparent);
  &.current {
    background: var(--ref-current-background);
    font-weight: bold;
  }
  &.remote {
    color: var(--ref-remote);
  }
  &.tag {
    color: var(--ref-tag);
  }
}
.preview-diff {
  padding: 4px;
  &.added {
    background: var(--diff-added-background);
  }
  &.removed {
    background: var(--diff-removed-background);
  }
  &.hunk {
    background: var(--color-surface-subtle);
    color: var(--color-text-secondary);
  }
}
.font-preview {
  margin-top: 12px;
  font-size: var(--text-lg);
}
</style>
