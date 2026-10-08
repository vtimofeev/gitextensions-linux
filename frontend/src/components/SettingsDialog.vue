<template>
  <Dialog
    :visible="!!store.settingsTab"
    modal
    maximizable
    :header="$t('settingsTitle')"
    :style="{ width: '860px', height: '600px' }"
    :pt="{
      content: {
        style: 'flex:1;min-height:0;display:flex;flex-direction:column;',
      },
    }"
    @update:visible="cancel"
  >
    <div class="settings-body">
      <nav
        class="settings-tabs"
        role="tablist"
        aria-orientation="vertical"
        @keydown="navigateTabs"
      >
        <button
          v-for="tab in tabs"
          :key="tab"
          role="tab"
          :aria-selected="store.settingsTab === tab"
          :tabindex="store.settingsTab === tab ? 0 : -1"
          @click="store.settingsTab = tab"
        >
          {{ $t(tab) }}
        </button>
      </nav>
      <div class="settings-content" role="tabpanel">
        <div v-if="store.settingsTab === 'general'" class="stack">
          <label
            >{{ $t("languageLabel")
            }}<select
              v-model="preferences.locale"
              @change="preferences.applyTheme()"
            >
              <option value="en">EN</option>
              <option value="ru">RU</option>
            </select></label
          ><label
            >{{ $t("themeMode")
            }}<select
              v-model="preferences.mode"
              @change="preferences.applyTheme()"
            >
              <option v-for="mode in modes" :key="mode" :value="mode">
                {{ $t(mode) }}
              </option>
            </select></label
          ><label
            >{{ $t("historyPageSize")
            }}<select v-model.number="preferences.historyPageSize">
              <option v-for="size in [100, 200, 500]" :key="size">
                {{ size }}
              </option>
            </select></label
          ><label
            >{{ $t("recentRepoLimit")
            }}<input
              type="number"
              min="5"
              max="200"
              step="1"
              v-model.number="preferences.recentRepoLimit" /></label
          ><label class="check"
            ><input type="checkbox" v-model="preferences.refreshOnFocus" />{{
              $t("refreshFocus")
            }}</label
          >
        </div>
        <div v-if="store.settingsTab === 'general'" class="stack">
          <label class="check"
            ><input type="checkbox" v-model="preferences.syntaxEnabled" />{{
              $t("syntaxHighlighting")
            }}</label
          >
          <label class="check"
            ><input type="checkbox" v-model="preferences.foldingEnabled" />{{
              $t("codeFolding")
            }}</label
          >
          <label class="check"
            ><input
              type="checkbox"
              v-model="preferences.showAuthorAvatarColumn"
            />{{ $t("showAuthorAvatarColumn") }}</label
          >
          <label class="check"
            ><input
              type="checkbox"
              v-model="preferences.highlightMyCommits"
            />{{ $t("highlightMyCommits") }}</label
          >
        </div>
        <div v-if="store.settingsTab === 'blame'" class="stack">
          <label v-for="key in blameKeys" :key="key" class="check"
            ><input type="checkbox" v-model="preferences.blame[key]" />{{
              $t(key)
            }}</label
          >
        </div>
        <AppearanceSettings v-if="store.settingsTab === 'appearance'" />
        <ProfilesSettings v-if="store.settingsTab === 'profiles'" />
        <div v-if="store.settingsTab === 'commitSync'" class="stack">
          <label
            >{{ $t("commit")
            }}<select v-model="store.pushAfterCommit">
              <option :value="false">{{ $t("commit") }}</option>
              <option :value="true">{{ $t("commitPush") }}</option>
            </select></label
          ><label
            >{{ $t("pullMode")
            }}<select v-model="preferences.pullMode">
              <option value="merge">{{ $t("merge") }}</option>
              <option value="rebase">{{ $t("rebase") }}</option>
              <option value="ff-only">{{ $t("ffOnly") }}</option>
            </select></label
          ><label class="check"
            ><input type="checkbox" v-model="preferences.fetchPrune" />{{
              $t("prune")
            }}</label
          ><label class="check"
            ><input type="checkbox" v-model="preferences.confirmForcePush" />{{
              $t("confirmForcePush")
            }}</label
          >
        </div>
        <ReviewSettings v-if="store.settingsTab === 'codeReview'" />
        <ToolsSettings v-if="store.settingsTab === 'tools'" />
        <ErrorNotification :message="error" @dismiss="error = ''" />
      </div>
    </div>
    <template #footer
      ><Button
        :label="$t('cancel')"
        severity="secondary"
        @click="cancel" /><Button :label="$t('save')" @click="save"
    /></template>
  </Dialog>
</template>
<script lang="ts">
import ErrorNotification from "./ErrorNotification.vue";
import { Component, Vue, Watch, toNative } from "vue-facing-decorator";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import AppearanceSettings from "./AppearanceSettings.vue";
import ProfilesSettings from "./ProfilesSettings.vue";
import ReviewSettings from "./ReviewSettings.vue";
import ToolsSettings from "./ToolsSettings.vue";
import { blameDefaults } from "../domain/blame";
import { container } from "../store/container";
@Component({
  components: {
    ErrorNotification,
    Button,
    Dialog,
    AppearanceSettings,
    ProfilesSettings,
    ToolsSettings,
    ReviewSettings,
  },
})
class SettingsDialog extends Vue {
  blameKeys = Object.keys(blameDefaults) as (keyof typeof blameDefaults)[];
  tabs = [
    "general",
    "appearance",
    "blame",
    "profiles",
    "commitSync",
    "tools",
    "codeReview",
  ] as const;
  modes = ["light", "dark", "system"] as const;
  private initial = "";
  private initialPush = false;
  error = "";
  get store() {
    return container.repository;
  }
  get preferences() {
    return container.preferences;
  }
  // immediate: the dialog loads lazily, so it may mount already open.
  @Watch("store.settingsTab", { immediate: true })
  opened(value: string, old: string) {
    if (value && !old) {
      this.preferences.deferSave = true;
      this.initial = this.preferences.capture();
      this.initialPush = this.store.pushAfterCommit;
      this.error = "";
    }
  }
  navigateTabs(event: KeyboardEvent) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = this.tabs.indexOf(
      this.store.settingsTab as (typeof this.tabs)[number],
    );
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? this.tabs.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + this.tabs.length) %
            this.tabs.length;
    this.store.settingsTab = this.tabs[next]!;
    const target = event.currentTarget as HTMLElement;
    this.$nextTick(() =>
      (target?.querySelector("[aria-selected=true]") as HTMLElement)?.focus(),
    );
  }
  cancel() {
    this.preferences.deferSave = false;
    if (this.initial) {
      this.preferences.restore(this.initial);
      this.store.pushAfterCommit = this.initialPush;
    }
    this.store.settingsTab = "";
    this.initial = "";
  }
  async save() {
    const profiles = this.preferences.profiles;
    const valid =
      profiles.every(
        (p) =>
          p.label.trim() &&
          p.name.trim() &&
          p.email.includes("@") &&
          !/[\r\n]/.test(p.name + p.email),
      ) &&
      this.preferences.rules.every(
        (r) => r.pattern.trim() && profiles.some((p) => p.id === r.profileId),
      );
    if (!valid) {
      this.error = this.$t("profileValidation");
      return;
    }
    const previous = this.initial ? JSON.parse(this.initial).profiles : [];
    this.preferences.deferSave = false;
    this.preferences.save();
    this.store.trimRecent();
    await this.store.profilesSaved(previous);
    this.store.persistPushPreference();
    const changed = this.store.limit !== this.preferences.historyPageSize;
    this.store.limit = this.preferences.historyPageSize;
    this.initial = "";
    this.store.settingsTab = "";
    if (changed && this.store.path) void this.store.refresh();
  }
}
export default toNative(SettingsDialog);
</script>
<style lang="scss" scoped>
.settings-body {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 14px;
}
.settings-tabs {
  flex: 0 0 150px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  padding-right: 8px;
  button {
    text-align: left;
    border: 0;
    color: var(--color-text);
    background: transparent;
    padding: 10px;
    border-radius: var(--radius-sm);
    &[aria-selected="true"] {
      color: var(--color-accent);
      background: var(--color-selection);
    }
  }
}
.settings-content {
  overflow: auto;
  flex: 1;
  min-width: 0;
  padding-right: 4px;
}
</style>
