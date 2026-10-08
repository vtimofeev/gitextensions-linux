<template>
  <div class="appearance-layout">
    <div class="theme-editor">
      <h3>{{ $t("preset") }}</h3>
      <div class="preset-cards">
        <button
          v-for="name in presetNames"
          :key="name"
          :aria-pressed="preferences.preset === name"
          @click="choosePreset(name)"
        >
          <b>{{ name[0]!.toUpperCase() + name.slice(1) }}</b
          ><span class="swatches"
            ><i
              v-for="key in swatchKeys"
              :key="key"
              :style="{ background: presets[name][editMode][key] }"
          /></span>
        </button>
      </div>
      <p v-if="preferences.preset === 'custom'">
        {{ $t("customTheme", { base: preferences.custom.base }) }}
      </p>
      <label
        >{{ $t("themeMode")
        }}<select v-model="preferences.mode" @change="apply">
          <option v-for="mode in modes" :key="mode" :value="mode">
            {{ $t(mode) }}
          </option>
        </select></label
      >
      <label
        >{{ $t("editFor")
        }}<select v-model="editMode">
          <option value="light">{{ $t("light") }}</option>
          <option value="dark">{{ $t("dark") }}</option>
        </select></label
      >
      <label v-if="preferences.preset === 'custom'"
        >{{ $t("themeName") }}<input v-model="preferences.custom.name"
      /></label>
      <fieldset v-for="group in groups" :key="group.label">
        <legend>{{ $t(group.label) }}</legend>
        <div v-for="key in group.keys" :key="key" class="token-row">
          <label :for="'hex-' + key" :title="key">{{
            key.replace(/^color-|^graph-/, "")
          }}</label
          ><input
            type="color"
            :aria-label="$t('themeToken') + ': ' + key"
            :value="colors[key]"
            @input="setToken(key, ($event.target as HTMLInputElement).value)"
          /><input
            :id="'hex-' + key"
            :value="colors[key]"
            :aria-label="key + ' hex'"
            pattern="#[a-fA-F0-9]{6}"
            maxlength="7"
            @change="hexChange(key, $event)"
          /><button
            v-if="isChanged(key)"
            :aria-label="$t('resetToken') + ': ' + key"
            :title="$t('resetToken')"
            @click="resetToken(key)"
          >
            ↺</button
          ><span
            v-if="warning(key)"
            class="contrast-warning"
            :title="$t('contrastWarning', { ratio: warning(key) })"
            >⚠ {{ warning(key) }}:1</span
          >
        </div>
      </fieldset>
      <Button :label="$t('resetAll')" severity="secondary" @click="resetAll" />
      <h3>{{ $t("fonts") }}</h3>
      <label class="font-setting"
        ><b>{{ $t("fontSize") }}</b
        ><small class="muted">{{ $t("fontSizeHint") }}</small>
        <div class="font-number">
          <Button
            icon="pi pi-minus"
            text
            :title="$t('decreaseFont')"
            :aria-label="$t('decreaseFont')"
            @click="fontStep(-1)"
          /><input
            type="number"
            min="10"
            max="20"
            step="1"
            v-model.number="preferences.fontSize"
            :aria-label="$t('fontSize')"
            @input="apply"
          /><Button
            icon="pi pi-plus"
            text
            :title="$t('increaseFont')"
            :aria-label="$t('increaseFont')"
            @click="fontStep(1)"
          /></div
      ></label>
      <label class="font-setting"
        ><b>{{ $t("fontFamily") }}</b
        ><small class="muted">{{ $t("fontFamilyHint") }}</small
        ><input
          v-model="preferences.uiFont"
          :aria-label="$t('fontFamily')"
          @input="apply"
        /><span :style="{ fontFamily: preferences.uiFont }"
          >Aa / 0123 / -&gt;</span
        ></label
      >
      <label class="font-setting"
        ><b>{{ $t("codeFontFamily") }}</b
        ><small class="muted">{{ $t("fontFamilyHint") }}</small
        ><input
          v-model="preferences.codeFont"
          :aria-label="$t('codeFontFamily')"
          @input="apply"
        /><span :style="{ fontFamily: preferences.codeFont }"
          >Aa / 0123 / -&gt;</span
        ></label
      >
      <label class="font-setting"
        ><b>{{ $t("codeFontSize") }}</b
        ><small class="muted">{{ $t("codeFontSizeHint") }}</small
        ><input
          type="number"
          min="10"
          max="24"
          step="1"
          v-model="preferences.codeSize"
          :aria-label="$t('codeFontSize')"
          @input="apply" /></label
      ><Button
        :label="$t('resetDefaults')"
        severity="secondary"
        @click="preferences.resetFonts()"
      />
      <div class="actions">
        <Button
          :label="$t('exportTheme')"
          severity="secondary"
          @click="exportJSON"
        /><label
          >{{ $t("importFile")
          }}<input
            type="file"
            accept="application/json,.json"
            :aria-label="$t('importFile')"
            @change="importFile"
        /></label>
      </div>
      <label
        >{{ $t("pasteTheme")
        }}<textarea
          v-model="json"
          rows="3"
          :aria-label="$t('pasteTheme')"
        /></label
      ><Button
        :label="$t('importTheme')"
        severity="secondary"
        @click="importJSON"
      />
      <p v-if="message" role="status">{{ message }}</p>
    </div>
    <div class="preview-column">
      <h3>{{ $t("previewTitle") }}</h3>
      <ThemePreview :colors="colors" />
    </div>
  </div>
</template>
<script lang="ts">
import { Component, Vue, toNative } from "vue-facing-decorator";
import Button from "primevue/button";
import ThemePreview from "./ThemePreview.vue";
import { container } from "../store/container";
import { presets, type Colors, type PresetName } from "../theme/presets";
import { ThemeService } from "../theme/theme-service";
import { contrast, isHex, importTheme } from "../theme/theme-format";
import type { MessageKey } from "../i18n/en";
@Component({ components: { Button, ThemePreview } })
class AppearanceSettings extends Vue {
  presets: Record<PresetName, { light: Colors; dark: Colors }> = presets;
  presetNames: PresetName[] = ["ocean", "classic", "neutral"];
  modes = ["light", "dark", "system"] as const;
  editMode: "light" | "dark" = container.preferences.dark ? "dark" : "light";
  swatchKeys = [
    "color-level-100",
    "color-level-200",
    "color-accent",
    "color-accent-2",
    "color-accent-3",
  ];
  json = "";
  message = "";
  private timer: ReturnType<typeof setTimeout> | undefined;
  groups: { label: MessageKey; keys: string[] }[] = [
    {
      label: "syntax",
      keys: Object.keys(presets.ocean.light).filter((key) =>
        key.startsWith("syntax-"),
      ),
    },
    {
      label: "authors",
      keys: [
        ...Array.from({ length: 12 }, (_, i) => `author-${i + 1}`),
        "author-ink-light",
        "author-ink-dark",
      ],
    },
    {
      label: "accents",
      keys: ["color-accent", "color-accent-2", "color-accent-3"],
    },
    {
      label: "surfaces",
      keys: [
        "color-level-100",
        "color-level-200",
        "color-level-300",
        "color-surface-subtle",
        "color-border",
        "color-border-subtle",
        "color-selection",
        "color-input",
        "color-input-border",
      ],
    },
    { label: "textColors", keys: ["color-text", "color-text-secondary"] },
    {
      label: "statuses",
      keys: ["color-positive", "color-warning", "color-negative"],
    },
    {
      label: "refColors",
      keys: [
        "ref-local",
        "ref-remote",
        "ref-tag",
        "ref-other",
        "ref-current-background",
        "graph-head",
      ],
    },
    {
      label: "diffColors",
      keys: ["diff-added-background", "diff-removed-background"],
    },
    {
      label: "graphColors",
      keys: Array.from({ length: 8 }, (_, i) => `graph-lane-${i + 1}`),
    },
  ];
  get preferences() {
    return container.preferences;
  }
  get colors() {
    return new ThemeService().colors(
      this.preferences.preset,
      this.preferences.custom,
      this.editMode === "dark",
    );
  }
  apply() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.preferences.applyTheme(), 50);
  }
  beforeUnmount() {
    clearTimeout(this.timer);
  }
  choosePreset(name: PresetName) {
    this.preferences.preset = name;
    this.preferences.custom = { base: name, light: {}, dark: {} };
    this.apply();
  }
  setToken(key: string, value: string) {
    if (!isHex(value)) {
      this.message = this.$t("invalidColor");
      return;
    }
    if (this.preferences.preset !== "custom") {
      this.preferences.custom = {
        base: this.preferences.preset,
        light: {},
        dark: {},
      };
      this.preferences.preset = "custom";
    }
    this.preferences.custom[this.editMode][key] = value;
    this.message = "";
    this.apply();
  }
  hexChange(key: string, event: Event) {
    const input = event.target as HTMLInputElement;
    this.setToken(key, input.value);
    if (!isHex(input.value)) input.value = this.colors[key]!;
  }
  isChanged(key: string) {
    return (
      this.preferences.preset === "custom" &&
      key in this.preferences.custom[this.editMode]
    );
  }
  resetToken(key: string) {
    delete this.preferences.custom[this.editMode][key];
    this.apply();
  }
  resetAll() {
    this.choosePreset(
      this.preferences.preset === "custom"
        ? this.preferences.custom.base
        : this.preferences.preset,
    );
  }
  warning(key: string) {
    const c = this.colors;
    let pairs: string[] = [];
    if (
      [
        "color-text",
        "color-text-secondary",
        "color-accent",
        "ref-local",
        "ref-remote",
        "ref-tag",
        "ref-other",
      ].includes(key)
    )
      pairs = ["color-level-200"];
    if (key.startsWith("author-") && !key.startsWith("author-ink-"))
      pairs = ["color-level-200"];
    if (key === "color-text")
      pairs.push("diff-added-background", "diff-removed-background");
    const ratios = pairs.map((background) => contrast(c[key]!, c[background]!));
    if (key.startsWith("diff-"))
      ratios.push(contrast(c["color-text"]!, c[key]!));
    const ratio = Math.min(...ratios);
    return ratio <
      (key === "color-text-secondary" || key.startsWith("author-") ? 3 : 4.5)
      ? ratio.toFixed(2)
      : "";
  }
  fontStep(delta: number) {
    this.preferences.fontSize = Math.max(
      10,
      Math.min(20, this.preferences.fontSize + delta),
    );
    this.apply();
  }
  exportJSON() {
    const theme = new ThemeService();
    const data = {
      version: 1,
      name:
        this.preferences.preset === "custom"
          ? this.preferences.custom.name ||
            `Custom (${this.preferences.custom.base})`
          : this.preferences.preset,
      light: theme.colors(
        this.preferences.preset,
        this.preferences.custom,
        false,
      ),
      dark: theme.colors(
        this.preferences.preset,
        this.preferences.custom,
        true,
      ),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "gitextensions-theme.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  importJSON() {
    try {
      const data = importTheme(JSON.parse(this.json));
      this.preferences.preset = "custom";
      this.preferences.custom = {
        base: "ocean",
        name: data.name,
        light: data.light,
        dark: data.dark,
      };
      this.message = data.unknown.length
        ? this.$t("unknownTokens", { keys: data.unknown.join(", ") })
        : "";
      this.apply();
    } catch {
      this.message = this.$t("invalidTheme");
    }
  }
  async importFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.json = await file.text();
      this.importJSON();
      input.value = "";
    }
  }
}
export default toNative(AppearanceSettings);
</script>
<style lang="scss" scoped>
.appearance-layout {
  display: grid;
  grid-template-columns: minmax(300px, 1fr) minmax(250px, 0.9fr);
  gap: 14px;
  align-items: start;
}
.theme-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.preset-cards {
  display: flex;
  gap: 6px;
  button {
    flex: 1;
    min-width: 0;
    border: 1px solid var(--color-border);
    background: var(--color-level-200);
    color: var(--color-text);
    border-radius: var(--radius-md);
    padding: 8px;
    &[aria-pressed="true"] {
      border-color: var(--color-accent);
      background: var(--color-selection);
    }
  }
}
.swatches {
  display: flex;
  margin-top: 5px;
  i {
    width: 20%;
    height: calc(var(--font-size-base) * 14 / 13);
  }
}
fieldset {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 8px;
  min-width: 0;
}
legend {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}
.token-row {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: wrap;
  margin: 4px 0;
  label {
    flex: 1;
    font-size: var(--text-xs);
    min-width: 90px;
  }
  input[type="color"] {
    width: 28px;
    height: calc(var(--font-size-base) * 26 / 13);
    padding: 2px;
  }
  input:not([type="color"]) {
    width: 78px;
    font-family: var(--font-code);
    font-size: var(--text-xs);
  }
  button {
    background: transparent;
    border: 0;
    color: var(--color-accent);
  }
}
.contrast-warning {
  font-size: var(--text-xs);
  color: var(--color-warning);
}
.font-setting {
  padding-top: 8px;
}
.font-number {
  display: flex;
  align-items: center;
  input {
    max-width: 100px;
  }
}
.preview-column {
  position: sticky;
  top: 0;
  h3 {
    margin-bottom: 8px;
  }
}
@media (max-width: 900px) {
  .appearance-layout {
    grid-template-columns: 1fr;
  }
  .preview-column {
    position: static;
  }
}
</style>
