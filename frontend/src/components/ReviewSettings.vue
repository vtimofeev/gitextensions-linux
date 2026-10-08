<template>
  <div class="stack">
    <label
      >{{ $t("reviewInstructions")
      }}<textarea
        v-model="preferences.reviewPrompt"
        :aria-label="$t('reviewInstructions')"
        rows="6"
      />
    </label>
    <fieldset v-for="name in names" :key="name" class="review-tool-settings">
      <legend>{{ labels[name] }}</legend>
      <label
        >{{ $t("reviewCommandTemplate")
        }}<input
          v-model="preferences.reviewTemplates[name].command"
          :aria-label="labels[name] + ' ' + $t('reviewCommandTemplate')"
      /></label>
      <label
        >{{ $t("reviewExecutable")
        }}<input
          v-model="preferences.reviewTemplates[name].executable"
          :aria-label="labels[name] + ' ' + $t('reviewExecutable')"
      /></label>
    </fieldset>
    <p class="muted">{{ $t("reviewTemplateHint", placeholders) }}</p>
    <label
      >{{ $t("reviewTerminal")
      }}<select
        v-model="terminalMode"
        :aria-label="$t('reviewTerminal')"
        @change="changeTerminal"
      >
        <option value="auto">{{ $t("reviewTerminalAuto") }}</option>
        <option value="custom">{{ $t("reviewTerminalCustom") }}</option>
      </select></label
    >
    <label v-if="terminalMode === 'custom'"
      >{{ $t("reviewCommandTemplate")
      }}<input
        v-model="preferences.reviewTerminal"
        :aria-label="$t('reviewTerminal') + ' ' + $t('reviewCommandTemplate')"
    /></label>
  </div>
</template>
<script lang="ts">
import { Component, Vue, toNative } from "vue-facing-decorator";
import { container } from "../store/container";
import { reviewToolNames, reviewToolLabels } from "../domain/review";
@Component({})
class ReviewSettings extends Vue {
  placeholders = Object.fromEntries(
    [
      "target",
      "instructions",
      "details",
      "prompt",
      "promptFile",
      "command",
    ].map((name) => [name, "{" + name + "}"]),
  );
  names = reviewToolNames;
  labels = reviewToolLabels;
  terminalMode = "auto";
  get preferences() {
    return container.preferences;
  }
  mounted() {
    this.terminalMode =
      this.preferences.reviewTerminal === "auto" ? "auto" : "custom";
  }
  changeTerminal() {
    this.preferences.reviewTerminal =
      this.terminalMode === "auto"
        ? "auto"
        : "x-terminal-emulator -e {command}";
  }
}
export default toNative(ReviewSettings);
</script>
<style lang="scss" scoped>
.review-tool-settings {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}
</style>
