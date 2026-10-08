<template>
  <header class="app-toolbar">
    <div class="toolbar-left">
      <Button
        v-if="store.path || store.identity"
        ref="identityButton"
        class="identity-avatar"
        :class="{ missing: !store.identity?.name || !store.identity?.email }"
        :aria-label="store.identity?.name || $t('identityMissing')"
        :title="store.identity?.email || $t('identityMissing')"
        text
        @click="toggle('identity', $event)"
        ><span
          class="avatar"
          :style="{
            background: activeProfile?.color || 'var(--color-surface-subtle)',
            color: activeProfile ? '#fff' : 'var(--color-text)',
          }"
          >{{ initials }}</span
        ><i class="pi pi-chevron-down chevron"
      /></Button>
      <Button
        ref="repoButton"
        class="repo-switcher"
        text
        :aria-label="$t('recent')"
        :title="store.path || $t('open')"
        :disabled="store.busy"
        @click="toggle('repo', $event)"
      >
        <i class="pi pi-folder" /><span class="repo-text"
          ><b>{{ repoName }}</b
          ><small>{{ shortPath }}</small></span
        ><i class="pi pi-chevron-down chevron" />
      </Button>
    </div>
    <div class="toolbar-main">
      <Button
        v-if="store.snapshot"
        ref="branchButton"
        class="branch-switcher"
        text
        :title="store.snapshot.branch"
        :aria-label="$t('branches')"
        :disabled="store.busy"
        @click="toggle('branch', $event)"
      >
        <i class="pi pi-code-branch branch-icon" /><span
          class="branch-name"
          :class="{ detached: store.snapshot.detached }"
          >{{ branchName }}</span
        ><span
          v-if="dirtyCount"
          class="dirty-dot"
          :title="$t('changedCount', { n: dirtyCount })"
          >●</span
        ><span v-if="store.snapshot.hasUpstream" class="tracking"
          >↑{{ store.snapshot.ahead || 0 }} ↓{{
            store.snapshot.behind || 0
          }}</span
        ><i class="pi pi-chevron-down chevron" />
      </Button>
      <span class="toolbar-spacer" />
      <span v-if="store.busy" class="progress" role="status"
        ><i class="pi pi-spin pi-spinner" />{{ activity }}</span
      >
      <Button
        v-if="store.snapshot"
        ref="commandsButton"
        class="commands-button"
        icon="pi pi-search"
        text
        :label="$t('commands') + '  Ctrl K'"
        :title="$t('commands') + ' (Ctrl+K)'"
        :aria-label="$t('commands')"
        @click="$emit('commands', $event)"
      />
      <Button
        v-if="store.snapshot"
        icon="pi pi-refresh"
        text
        :aria-label="$t('refresh')"
        :title="$t('refresh')"
        :disabled="store.busy"
        @click="store.refresh()"
      />
      <div v-if="store.snapshot" class="sync-group">
        <SplitButton
          class="sync-fetch"
          :label="$t('fetch')"
          icon="pi pi-cloud-download"
          severity="secondary"
          :disabled="store.busy"
          :model="fetchItems"
          @click="fetch()"
          :pt="splitLabels('fetch')"
        />
        <SplitButton
          class="sync-pull"
          :label="$t('pull')"
          icon="pi pi-arrow-down"
          severity="secondary"
          :disabled="store.busy"
          :model="pullItems"
          @click="pull()"
          :pt="splitLabels('pull')"
        />
        <SplitButton
          class="sync-push"
          :label="
            $t('push') +
            (store.snapshot.ahead ? ' ' + store.snapshot.ahead : '')
          "
          icon="pi pi-arrow-up"
          :severity="store.snapshot.ahead ? undefined : 'secondary'"
          :disabled="store.busy"
          :model="pushItems"
          @click="push()"
          :pt="splitLabels('push')"
        />
      </div>
      <Button
        ref="moreButton"
        icon="pi pi-ellipsis-h"
        text
        :aria-label="$t('moreActions')"
        :title="$t('moreActions')"
        @click="toggle('more', $event)"
      />
    </div>
    <Popover ref="menu" @hide="opened = ''">
      <div
        class="toolbar-menu"
        role="menu"
        @keydown="navigateMenu"
        @keydown.esc="close"
      >
        <template v-if="opened === 'identity'">
          <h3>{{ $t("identityHeading") }}</h3>
          <button
            v-for="profile in preferences.profiles"
            :key="profile.id"
            role="menuitem"
            autofocus
            :disabled="store.busy"
            @click="selectProfile(profile)"
          >
            <span
              class="profile-dot"
              :style="{ background: profile.color }"
            />{{ activeProfile?.id === profile.id ? "✓ " : ""
            }}{{ profile.label }} — {{ profile.name
            }}<small>{{ profile.email }}</small>
          </button>
          <button
            role="menuitem"
            :disabled="store.busy"
            @click="customIdentity"
          >
            {{ $t("customIdentity") }}
            <small
              >{{ store.identity?.name }} · {{ store.identity?.email }}</small
            >
          </button>
          <p class="muted">{{ $t("identityLocal") }}</p>
          <button role="menuitem" autofocus @click="settings('profiles')">
            {{ $t("manageProfiles") }}
          </button>
        </template>
        <template v-if="opened === 'repo'">
          <RecentRepositories menu @open="openRepo" />
          <button
            role="menuitem"
            @click="
              close();
              store.choose();
            "
          >
            {{ $t("openFolder") }}
          </button>
          <form @submit.prevent="openRepo(path)">
            <label
              >{{ $t("enterPath")
              }}<input
                v-model="path"
                :aria-label="$t('path')"
                autofocus /></label
            ><Button
              type="submit"
              :label="$t('openPath')"
              :disabled="!path.trim() || store.busy"
            />
          </form>
        </template>
        <template v-if="opened === 'branch'">
          <input
            v-model="filter"
            autofocus
            :aria-label="$t('searchBranches')"
            :placeholder="$t('searchBranches')"
          />
          <template v-for="remote in [false, true]" :key="String(remote)"
            ><h3>{{ $t(remote ? "remoteBranches" : "localBranches") }}</h3>
            <button
              v-for="branch in branches.filter((b) => b.remote === remote)"
              :key="branch.name"
              role="menuitem"
              :class="remote ? 'remote' : 'local'"
              :disabled="store.busy || branch.current"
              @click="checkout(branch)"
            >
              {{ branch.current ? "✓ " : "" }}{{ branch.name }}
              <span v-if="branch.upstream"
                >↑{{ branch.ahead || 0 }} ↓{{ branch.behind || 0 }}</span
              >
            </button></template
          >
          <button
            role="menuitem"
            @click="
              close();
              store.createBranchRequested++;
            "
          >
            {{ $t("create") }}
          </button>
        </template>
        <template v-if="opened === 'more'">
          <button role="menuitem" autofocus @click="settings('general')">
            {{ $t("settings") }} <kbd>Ctrl+,</kbd>
          </button>
          <button
            v-if="store.path"
            role="menuitem"
            @click="
              close();
              store.openToolSettings();
            "
          >
            {{ $t("toolSettings") }}
          </button>
          <button
            v-if="store.path"
            role="menuitem"
            @click="
              close();
              store.utility = 'stash';
            "
          >
            {{ $t("stash") }}</button
          ><button
            v-if="store.path"
            role="menuitem"
            @click="
              close();
              store.utility = 'reflog';
            "
          >
            {{ $t("reflog") }}</button
          ><button
            v-if="store.path"
            role="menuitem"
            @click="
              close();
              store.openReset();
            "
          >
            {{ $t("resetBranch") }}
          </button>
          <h3>{{ $t("themeLabel") }}</h3>
          <button
            v-for="mode in modes"
            :key="mode"
            role="menuitemradio"
            :aria-checked="preferences.mode === mode"
            @click="preferences.setMode(mode)"
          >
            {{ preferences.mode === mode ? "✓ " : "" }}{{ $t(mode) }}
          </button>
          <button role="menuitem" @click="preferences.toggleLocale()">
            {{ $t("languageLabel") }}:
            {{ preferences.locale.toUpperCase() }}</button
          ><button
            role="menuitem"
            @click="
              aboutVisible = true;
              close();
            "
          >
            {{ $t("about") }}
          </button>
        </template>
      </div>
    </Popover>
    <Dialog v-model:visible="aboutVisible" modal :header="$t('about')"
      ><p>{{ $t("app") }}</p>
      <p>© 2026 Vasily Timofeev · Git Extensions contributors</p>
      <p>{{ $t("originalThanks") }}</p>
      <p>{{ $t("aiCreated") }}</p>
      <p>{{ $t("licenseRights") }}</p>
      <Button label="GPL-3.0-only" text @click="openLicense"
    /></Dialog>
  </header>
</template>
<script lang="ts">
import { Component, Vue, toNative } from "vue-facing-decorator";
import { BrowserOpenURL } from "../../../wailsjs/runtime/runtime";
import Button from "primevue/button";
import RecentRepositories from "../RecentRepositories.vue";
import SplitButton from "primevue/splitbutton";
import Popover from "primevue/popover";
import Dialog from "primevue/dialog";
import { container } from "../../store/container";
import type { Branch } from "../../domain/models";
import type { IdentityProfile } from "../../store/preferences";
import type { ThemeMode } from "../../theme/presets";
import type { MessageKey } from "../../i18n/en";
import { navigateMenu } from "./menu-navigation";
@Component({
  components: { Button, SplitButton, Popover, Dialog, RecentRepositories },
  emits: ["remote", "commands"],
})
class AppToolbar extends Vue {
  opened = "";
  path = "";
  filter = "";
  aboutVisible = false;
  openLicense() {
    BrowserOpenURL("https://www.gnu.org/licenses/gpl-3.0.html");
  }
  modes: ThemeMode[] = ["light", "dark", "system"];
  navigateMenu = navigateMenu;
  get store() {
    return container.repository;
  }
  get preferences() {
    return container.preferences;
  }
  get activeProfile() {
    return this.store.activeProfile;
  }
  get initials() {
    return (
      this.store.identity?.name
        .split(/\s+/)
        .map((s) => s[0])
        .slice(0, 2)
        .join("")
        .toUpperCase() || "⚠"
    );
  }
  basename(path: string) {
    return path.split("/").filter(Boolean).pop() || this.$t("open");
  }
  shorten(path: string) {
    const home = this.store.snapshot?.homePath;
    return home && (path === home || path.startsWith(home + "/"))
      ? "~" + path.slice(home.length)
      : path;
  }
  get repoName() {
    return this.basename(this.store.path);
  }
  get shortPath() {
    return this.shorten(this.store.path);
  }
  get branchName() {
    return this.store.snapshot?.detached
      ? this.store.snapshot.commits
          .find((c) => /(^|, )HEAD(,|$)/.test(c.refs))
          ?.hash.slice(0, 8) || "HEAD"
      : this.store.snapshot?.branch;
  }
  get dirtyCount() {
    return (
      this.store.snapshot?.dirtyCount ?? this.store.snapshot?.files.length ?? 0
    );
  }
  get activity() {
    return this.$t((this.store.activity || "activityOperation") as MessageKey);
  }
  get branches() {
    return (
      this.store.snapshot?.branches.filter((b) =>
        b.name.toLowerCase().includes(this.filter.toLowerCase()),
      ) || []
    );
  }
  splitLabels(key: "fetch" | "pull" | "push") {
    return {
      pcButton: { root: { "aria-label": this.$t(key), title: this.$t(key) } },
      pcDropdown: {
        root: {
          "aria-label": this.$t(key) + " " + this.$t("options"),
          title: this.$t("options"),
        },
      },
    };
  }
  toggle(name: string, event: Event) {
    const menu = this.$refs.menu as InstanceType<typeof Popover>;
    if (this.opened === name) {
      menu.hide();
      return;
    }
    menu.hide();
    this.opened = name;
    menu.show(event);
  }
  close() {
    (this.$refs.menu as InstanceType<typeof Popover>).hide();
  }
  open(name: "repo" | "branch", event?: Event) {
    const ref = this.$refs[name + "Button"] as { $el: HTMLElement };
    if (ref)
      this.toggle(
        name,
        event ||
          ({ currentTarget: ref.$el, target: ref.$el } as unknown as Event),
      );
  }
  settings(tab: string) {
    this.close();
    this.store.settingsTab = tab;
  }
  async openRepo(path: string) {
    this.close();
    await this.store.open(path);
  }
  customIdentity() {
    this.preferences.rememberProfile(this.store.path);
    this.close();
  }
  async selectProfile(profile: IdentityProfile) {
    this.close();
    await this.store.applyProfile(profile);
  }
  async checkout(branch: Branch) {
    this.close();
    if (branch.remote)
      await this.store.refAction({
        action: "checkout",
        target: branch.name,
        name: "",
        remote: true,
        detach: false,
        mode: "ff",
        message: "",
        noCommit: false,
        squash: false,
        recordOrigin: false,
        mainline: 0,
        rebaseMerges: false,
        force: false,
      });
    else await this.store.checkout(branch.name);
  }
  options(mode: "fetch" | "pull" | "push") {
    this.$emit("remote", mode);
  }
  fetch(prune = this.preferences.fetchPrune) {
    this.preferences.fetchPrune = prune;
    this.preferences.persistSync();
    return this.store.execute(
      () => container.api.fetchAll(this.store.path, prune),
      true,
      "repository",
      "activityFetch",
    );
  }
  pull(mode = this.preferences.pullMode) {
    this.preferences.pullMode = mode;
    this.preferences.persistSync();
    return this.store.execute(
      () => container.api.pull(this.store.path, "", "", mode),
      true,
      "repository",
      "activityPull",
    );
  }
  push(force = false) {
    if (!this.store.snapshot?.hasUpstream) {
      this.options("push");
      return;
    }
    if (
      force &&
      this.preferences.confirmForcePush &&
      !window.confirm(this.$t("forceWarning"))
    )
      return;
    return this.store.execute(
      () =>
        container.api.push(this.store.path, {
          remote: "",
          branch: "",
          setUpstream: false,
          forceWithLease: force,
          tags: false,
          dryRun: false,
        }),
      true,
      "repository",
      "activityPush",
    );
  }
  get fetchItems() {
    return [
      { label: this.$t("fetchAll"), command: () => this.fetch(false) },
      { label: this.$t("fetchPrune"), command: () => this.fetch(true) },
      { separator: true },
      { label: this.$t("options"), command: () => this.options("fetch") },
    ];
  }
  get pullItems() {
    return ["merge", "rebase", "ff-only"]
      .map((mode) => ({
        label:
          (this.preferences.pullMode === mode ? "✓ " : "") +
          this.$t((mode === "ff-only" ? "ffOnly" : mode) as MessageKey),
        command: () => {
          void this.pull(mode);
        },
      }))
      .concat([
        { label: this.$t("options"), command: () => this.options("pull") },
      ]);
  }
  get pushItems() {
    return [
      { label: this.$t("push"), command: () => this.push() },
      { label: this.$t("forcePush"), command: () => this.push(true) },
      { separator: true },
      { label: this.$t("options"), command: () => this.options("push") },
    ];
  }
}
export default toNative(AppToolbar);
</script>
<style lang="scss" scoped>
.app-toolbar {
  display: flex;
  height: calc(var(--font-size-base) * 44 / 13);
  background: var(--color-level-200);
  border-bottom: 1px solid var(--color-border);
  min-width: 0;
}
.toolbar-left {
  width: var(--sidebar-width, 23vw);
  flex: none;
  display: flex;
  align-items: center;
  border-right: 1px solid var(--color-border);
  padding: 0 6px;
  gap: 4px;
  min-width: 0;
}
.toolbar-main {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 0 6px;
}
.toolbar-spacer {
  flex: 1;
}
.repo-switcher {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  justify-content: flex-start;
}
.repo-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  text-align: left;
  b,
  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  small {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
  }
}
.identity-avatar.missing::after {
  content: "";
  width: 5px;
  height: 5px;
  background: var(--color-warning);
  border-radius: 50%;
}
.identity-avatar {
  border-radius: 50%;
  flex: none;
  font-size: var(--text-xs);
}
.branch-switcher {
  max-width: 35%;
  min-width: 0;
}

/* Toolbar switchers read as neutral text controls, not accent links. */
.identity-avatar,
.repo-switcher,
.branch-switcher {
  color: var(--color-text);
  gap: 6px;
  height: calc(var(--font-size-base) * 34 / 13);
  padding: 0 6px;
}
.identity-avatar {
  border-radius: var(--radius-md);
  padding: 0 4px;
  .avatar {
    display: grid;
    place-items: center;
    width: calc(var(--font-size-base) * 26 / 13);
    height: calc(var(--font-size-base) * 26 / 13);
    border-radius: 50%;
    font-size: var(--text-xs);
    font-weight: 600;
  }
}
.repo-switcher {
  > .pi-folder {
    color: var(--color-text-secondary);
  }
  .repo-text {
    flex: 1;
    gap: 2px;
    line-height: 1.15;
    b {
      font-weight: 600;
    }
  }
}
.chevron {
  font-size: calc(var(--font-size-base) * 9 / 13);
  color: var(--color-text-secondary);
  flex: none;
}
.branch-switcher {
  .branch-icon {
    color: var(--ref-local);
  }
  .branch-name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tracking {
    font-size: var(--text-xs);
    color: var(--color-accent-3);
    font-variant-numeric: tabular-nums;
  }
}
.dirty-dot {
  font-size: calc(var(--font-size-base) * 9 / 13);
}
/* Fetch / Pull / Push read as one segmented control. */
.sync-group {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  :deep(.p-splitbutton) {
    border-radius: 0;
  }
  :deep(.p-splitbutton + .p-splitbutton) {
    border-left: 1px solid var(--color-border);
  }
  /* Border stays 0 in every state: PrimeVue's hover/active/focus rules add a 1px
     border, which widened the button and shifted the whole toolbar. */
  :deep(.p-button),
  :deep(.p-button:not(:disabled):hover),
  :deep(.p-button:not(:disabled):active),
  :deep(.p-button:focus-visible) {
    border-width: 0;
  }
  :deep(.p-button) {
    border: 0;
    border-radius: 0;
  }
  :deep(.p-button.p-button-secondary) {
    background: transparent;
    color: var(--color-text);
  }
  :deep(.p-button.p-button-secondary:not(:disabled):hover) {
    background: var(--color-surface-subtle);
  }
  :deep(.p-splitbutton-dropdown) {
    width: calc(var(--font-size-base) * 22 / 13);
    padding: 0;
    .p-icon,
    .pi {
      font-size: calc(var(--font-size-base) * 9 / 13);
    }
  }
}
.commands-button {
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  height: calc(var(--font-size-base) * 28 / 13);
}
.dirty-dot,
.detached {
  color: var(--color-warning);
}
.progress {
  color: var(--color-accent-3);
  font-size: var(--text-xs);
  white-space: nowrap;
}
.sync-group {
  display: flex;
  gap: 0;
  :deep(.p-button) {
    height: calc(var(--font-size-base) * 28 / 13);
  }
}
@media (max-width: 1280px) {
  .repo-text small {
    display: none;
  }
  .commands-button :deep(.p-button-label),
  .sync-fetch :deep(.p-button-label),
  .sync-pull :deep(.p-button-label) {
    display: none;
  }
  .progress {
    max-width: 90px;
    overflow: hidden;
  }
}
:global(.sidebar-collapsed .repo-text) {
  display: none;
}
:global(.sidebar-collapsed .toolbar-left) {
  padding: 0;
  position: relative;
}
:global(.sidebar-collapsed .identity-avatar) {
  position: absolute;
  left: 6px;
}
:global(.sidebar-collapsed .repo-switcher) {
  position: absolute;
  left: 44px;
  width: 44px;
}
:global(.sidebar-collapsed .toolbar-main) {
  padding-left: 96px;
}
</style>
<style lang="scss">
.toolbar-menu {
  width: 320px;
  max-height: 70vh;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  h3 {
    font-size: var(--text-xs);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }
  button {
    display: block;
    width: 100%;
    border: 0;
    background: transparent;
    color: var(--color-text);
    text-align: left;
    padding: 8px;
    border-radius: var(--radius-sm);
    &:hover,
    &:focus-visible {
      background: var(--color-selection);
    }
    &.remote {
      color: var(--ref-remote);
    }
    &.local {
      color: var(--ref-local);
    }
  }
  small {
    display: block;
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
  }
  p {
    padding: 8px;
    font-size: var(--text-xs);
  }
  kbd {
    float: right;
  }
}
.profile-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: 6px;
}
</style>

<style lang="scss" scoped>
.repo-text {
  line-height: 1;
  small {
    font-family: var(--font-code);
    font-size: calc(var(--font-size-code) * 0.85);
  }
}
</style>
<style lang="scss">
.toolbar-menu form input {
  font-family: var(--font-code);
  font-size: var(--font-size-code);
}
</style>
