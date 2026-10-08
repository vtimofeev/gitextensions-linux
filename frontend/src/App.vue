<template>
  <Teleport to="body">
    <div id="error-notifications" role="region" :aria-label="$t('errors')" />
  </Teleport>
  <div
    ref="shell"
    class="app-shell"
    :class="{ 'sidebar-collapsed': sidebarCollapsed }"
    :style="{ '--sidebar-width': sidebarWidth + 'px' }"
  >
    <AppToolbar ref="toolbar" @remote="openRemote" @commands="openCommands" />
    <ErrorNotification :message="store.error" @dismiss="store.error = ''">
      <Button
        v-if="store.retryPush"
        :label="$t('retryPush')"
        :disabled="store.busy"
        @click="store.pushAgain()"
      />
    </ErrorNotification>
    <Button
      v-if="store.retryPush && !store.error"
      class="retry-push"
      :label="$t('retryPush')"
      :disabled="store.busy"
      @click="store.pushAgain()"
    />
    <div v-if="store.snapshot?.operation" class="notice">
      {{ $t("operation", { name: store.snapshot.operation }) }}
    </div>
    <div v-if="store.notice" class="notice" role="status">
      {{ store.notice }}
    </div>
    <SettingsDialog />
    <ReviewDialog />
    <CommandPalette ref="palette" :registry="registry" />
    <ReferenceActions />
    <ConflictDialog />
    <ExternalDiffDialog /><RepositoryTools /><FileInspection />
    <main v-if="store.snapshot" class="workspace">
      <button
        class="sidebar-collapse"
        :style="{ left: (sidebarCollapsed ? 0 : sidebarWidth - 10) + 'px' }"
        :aria-label="$t(sidebarCollapsed ? 'expandSidebar' : 'collapseSidebar')"
        :title="$t(sidebarCollapsed ? 'expandSidebar' : 'collapseSidebar')"
        @click="toggleSidebar"
      >
        {{ sidebarCollapsed ? "»" : "«" }}
      </button>
      <Splitter
        class="workspace-split"
        @resize="syncSidebar"
        @resizeend="syncSidebar"
        @resizestart="resizeStart"
        state-key="gitextensions.workspace"
        state-storage="local"
        :gutter-size="6"
        :pt="{ gutterHandle: { 'aria-label': $t('resizeSidebar') } }"
      >
        <SplitterPanel
          :size="23"
          :min-size="16"
          class="sidebar"
          :class="{ collapsed: sidebarCollapsed }"
          ><Splitter
            class="sidebar-split"
            layout="vertical"
            state-key="gitextensions.sidebar"
            state-storage="local"
            :gutter-size="6"
            :pt="{ gutterHandle: { 'aria-label': $t('resizeBranches') } }"
            @resizestart="resizeStart"
          >
            <SplitterPanel :size="60" :min-size="15" class="sidebar-pane"
              ><SidebarChanges
            /></SplitterPanel>
            <SplitterPanel :size="40" :min-size="10" class="sidebar-pane"
              ><BranchSidebar
            /></SplitterPanel> </Splitter
        ></SplitterPanel>
        <SplitterPanel :size="77" :min-size="35" class="main-column">
          <Splitter
            class="content-split"
            @resizestart="resizeStart"
            layout="vertical"
            state-key="gitextensions.content"
            state-storage="local"
            :gutter-size="6"
            :pt="{ gutterHandle: { 'aria-label': $t('resizeHistory') } }"
          >
            <SplitterPanel :size="55" :min-size="20"
              ><HistoryPanel
            /></SplitterPanel>
            <SplitterPanel :size="45" :min-size="20"
              ><DiffPanel
            /></SplitterPanel>
          </Splitter>
          <details v-if="store.output" class="panel output" open>
            <summary>{{ $t("output") }}</summary>
            <pre>{{ store.output }}</pre>
          </details>
        </SplitterPanel>
      </Splitter>
    </main>
    <main v-else class="welcome panel">
      <i class="pi pi-code-branch" />
      <h1>{{ $t("welcome") }}</h1>
      <p class="muted">{{ $t("welcomeText") }}</p>
      <Button
        :label="$t('open')"
        icon="pi pi-folder-open"
        :disabled="store.busy"
        @click="store.choose()"
      />
      <RecentRepositories
        v-if="store.recent.length"
        @open="store.open($event)"
      />
    </main>
    <footer>
      <span
        >{{
          store.busy
            ? $t((store.activity || "activityOperation") as MessageKey)
            : store.reviewStatus || $t("ready")
        }}
        ·
        {{
          $t("uncommittedCount", {
            n: store.snapshot?.dirtyCount ?? store.snapshot?.files.length ?? 0,
          })
        }}
        <template v-if="store.snapshot?.hasUpstream">
          · {{ upstream }} · ↑{{ store.snapshot.ahead || 0 }} ↓{{
            store.snapshot.behind || 0
          }}</template
        ></span
      ><span>{{ store.path }}</span>
    </footer>
    <RemoteDialog
      :key="remoteVisible ? remoteMode : 'closed'"
      :visible="remoteVisible"
      :mode="remoteMode"
      @close="remoteVisible = false"
    />
  </div>
</template>
<script lang="ts">
import { Component, Vue, Watch, toNative } from "vue-facing-decorator";
import { defineAsyncComponent, markRaw, nextTick } from "vue";
import RecentRepositories from "./components/RecentRepositories.vue";
import CommandPalette from "./components/CommandPalette.vue";
import { CommandRegistry, type Command } from "./commands/registry";
const ReviewDialog = defineAsyncComponent(
  () => import("./components/ReviewDialog.vue"),
);
const SettingsDialog = defineAsyncComponent(
  () => import("./components/SettingsDialog.vue"),
);
import AppToolbar from "./components/toolbar/AppToolbar.vue";
import ErrorNotification from "./components/ErrorNotification.vue";
import type { MessageKey } from "./i18n/en";
import Button from "primevue/button";
import Splitter from "primevue/splitter";
import SplitterPanel from "primevue/splitterpanel";
const RepositoryTools = defineAsyncComponent(
  () => import("./components/RepositoryTools.vue"),
);
const FileInspection = defineAsyncComponent(
  () => import("./components/FileInspection.vue"),
);
const ExternalDiffDialog = defineAsyncComponent(
  () => import("./components/ExternalDiffDialog.vue"),
);
import BranchSidebar from "./components/BranchSidebar.vue";
import HistoryPanel from "./components/HistoryPanel.vue";
import SidebarChanges from "./components/SidebarChanges.vue";
import DiffPanel from "./components/DiffPanel.vue";
const ConflictDialog = defineAsyncComponent(
  () => import("./components/ConflictDialog.vue"),
);
import ReferenceActions from "./components/ReferenceActions.vue";
const RemoteDialog = defineAsyncComponent(
  () => import("./components/RemoteDialog.vue"),
);
import { container } from "./store/container";
@Component({
  components: {
    ErrorNotification,
    CommandPalette,
    RecentRepositories,
    SettingsDialog,
    ReviewDialog,
    AppToolbar,
    Button,
    Splitter,
    SplitterPanel,
    ExternalDiffDialog,
    RepositoryTools,
    FileInspection,
    BranchSidebar,
    HistoryPanel,
    SidebarChanges,
    DiffPanel,
    RemoteDialog,
    ReferenceActions,
    ConflictDialog,
  },
})
class App extends Vue {
  sidebarWidth = 300;
  sidebarCollapsed =
    localStorage.getItem("gitextensions.layout.sidebarCollapsed") === "true";
  private sidebarObserver: ResizeObserver | null = null;
  get upstream() {
    return this.store.snapshot?.branches.find((b) => b.current)?.upstream;
  }
  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    localStorage.setItem(
      "gitextensions.layout.sidebarCollapsed",
      String(this.sidebarCollapsed),
    );
    this.$nextTick(this.syncSidebar);
  }
  syncSidebar() {
    const panel = (this.$refs.shell as HTMLElement)?.querySelector<HTMLElement>(
      ".workspace-split > .sidebar",
    );
    if (panel) this.sidebarWidth = panel.getBoundingClientRect().width + 3;
  }
  openRemote(mode: "fetch" | "pull" | "push") {
    this.remoteMode = mode;
    this.remoteVisible = true;
  }
  commandAnchor() {
    const toolbar = this.$refs.toolbar as InstanceType<typeof AppToolbar>;
    const button = (toolbar.$refs.commandsButton ||
      toolbar.$refs.repoButton) as { $el: HTMLElement };
    return {
      currentTarget: button.$el,
      target: button.$el,
    } as unknown as Event;
  }
  openCommands(event?: Event, go = false) {
    (this.$refs.palette as InstanceType<typeof CommandPalette>).open(
      event || this.commandAnchor(),
      go,
    );
  }
  get registry() {
    const t = this.$t;
    const toolbar = () => this.$refs.toolbar as InstanceType<typeof AppToolbar>;
    const repo = this.store;
    const enabled = !!repo.snapshot && !repo.busy;
    const canCommit =
      enabled &&
      !!repo.staged.length &&
      !!repo.message.trim() &&
      !!repo.identity?.name &&
      !!repo.identity?.email;
    const commands: Command[] = [
      {
        id: "palette",
        label: t("commands"),
        shortcut: "Ctrl+K",
        hidden: true,
        run: () => this.openCommands(),
      },
      {
        id: "branch",
        label: t("switchBranch"),
        shortcut: "Ctrl+B",
        enabled,
        run: () => toolbar().open("branch"),
      },
      {
        id: "repo",
        label: t("switchRepository"),
        shortcut: "Ctrl+O",
        enabled: !repo.busy,
        run: () => toolbar().open("repo"),
      },
      {
        id: "favorite-current",
        label: t("toggleCurrentFavorite"),
        enabled,
        run: () => repo.toggleFavorite(repo.path),
      },
      ...repo.recent.map((recent) => ({
        id: "repo-" + recent.path,
        label:
          t("switchRepository") +
          " → " +
          (recent.favorite ? "★ " : "") +
          recent.path,
        enabled: !repo.busy,
        run: () => repo.open(recent.path),
      })),
      {
        id: "fetch",
        label: t("fetchAll"),
        enabled,
        run: () => toolbar().fetch(),
      },
      {
        id: "pull",
        label: t("pull") + " (" + this.preferences.pullMode + ")",
        enabled,
        run: () => toolbar().pull(),
      },
      {
        id: "push",
        label: repo.snapshot?.ahead
          ? t("pushCommits", { n: repo.snapshot.ahead })
          : t("push"),
        enabled,
        run: () => toolbar().push(),
      },
      {
        id: "new-branch",
        label: t("create"),
        enabled,
        run: () => {
          repo.createBranchRequested++;
        },
      },
      {
        id: "create-tag",
        label: t("createTagSelected"),
        enabled:
          !!repo.selectedCommit && !repo.busy && !repo.snapshot?.operation,
        run: () => {
          repo.createTagRequested++;
        },
      },
      {
        id: "review-commit",
        label: t("reviewSelectedCommit"),
        enabled: enabled && !!repo.selectedCommit,
        run: () => container.review.open(repo.path, repo.selectedCommit),
      },
      {
        id: "commit",
        label: t("commit"),
        shortcut: "Ctrl+Enter",
        enabled: canCommit,
        run: () => repo.commit(false),
      },
      {
        id: "commit-push",
        label: t("commitPush"),
        shortcut: "Ctrl+Shift+Enter",
        enabled: canCommit,
        run: () => repo.commit(true),
      },
      {
        id: "profiles",
        label: t("switchIdentity"),
        run: () => {
          repo.settingsTab = "profiles";
        },
      },
      {
        id: "settings",
        label: t("settings"),
        shortcut: "Ctrl+,",
        run: () => {
          repo.settingsTab = "general";
        },
      },
      {
        id: "light",
        label: t("themeLabel") + ": " + t("light"),
        run: () => this.preferences.setMode("light"),
      },
      {
        id: "dark",
        label: t("themeLabel") + ": " + t("dark"),
        run: () => this.preferences.setMode("dark"),
      },
      {
        id: "system",
        label: t("themeLabel") + ": " + t("system"),
        run: () => this.preferences.setMode("system"),
      },
      {
        id: "language",
        label: t("language") + ": EN / RU",
        run: () => this.preferences.toggleLocale(),
      },
      {
        id: "goto",
        label: t("goToCommit"),
        shortcut: "Ctrl+Shift+G",
        enabled,
        run: () => this.openCommands(undefined, true),
      },
      {
        id: "font-increase",
        label: t("increaseFont"),
        shortcut: "Ctrl+=",
        run: () => this.preferences.setFontSize(this.preferences.fontSize + 1),
      },
      {
        id: "font-decrease",
        label: t("decreaseFont"),
        shortcut: "Ctrl+-",
        run: () => this.preferences.setFontSize(this.preferences.fontSize - 1),
      },
      {
        id: "font-reset",
        label: t("fontReset"),
        shortcut: "Ctrl+0",
        run: () => this.preferences.setFontSize(13),
      },
      ...this.preferences.profiles.map((profile) => ({
        id: "profile-" + profile.id,
        label: t("switchIdentity") + " → " + profile.label,
        enabled,
        run: () => repo.applyProfile(profile),
      })),
    ];
    return new CommandRegistry(commands);
  }
  keydown(event: KeyboardEvent) {
    this.registry.handle(event);
  }

  resizeStart(event: { originalEvent: Event }) {
    event.originalEvent.preventDefault();
    window.getSelection()?.removeAllRanges();
  }
  path = "";
  remoteMode: "fetch" | "pull" | "push" = "fetch";
  remoteVisible = false;
  get store() {
    return container.repository;
  }
  get preferences() {
    return container.preferences;
  }
  @Watch("store.path")
  onPathChanged(value: string) {
    container.review.close();
    this.store.reviewStatus = "";
    this.path = value;
    this.$nextTick(this.observeSidebar);
  }
  observeSidebar() {
    this.sidebarObserver?.disconnect();
    const panel = (this.$refs.shell as HTMLElement)?.querySelector<HTMLElement>(
      ".workspace-split > .sidebar",
    );
    if (panel) {
      this.sidebarObserver = markRaw(new ResizeObserver(this.syncSidebar));
      this.sidebarObserver.observe(panel);
    }
    this.syncSidebar();
  }
  async mounted() {
    await this.store.bootstrap();
    this.path = this.store.path;
    await nextTick();
    this.observeSidebar();
    window.addEventListener("resize", this.syncSidebar);
    window.addEventListener("keydown", this.keydown);
    window.addEventListener("focus", this.onFocus);
  }
  beforeUnmount() {
    window.removeEventListener("focus", this.onFocus);
    window.removeEventListener("keydown", this.keydown);
    window.removeEventListener("resize", this.syncSidebar);
    this.sidebarObserver?.disconnect();
  }
  onFocus() {
    if (this.preferences.refreshOnFocus && this.store.path && !this.store.busy)
      void this.store.refresh();
  }
}
export default toNative(App);
</script>
<style lang="scss" scoped>
.app-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: calc(var(--font-size-base) * 24 / 13);
  > :not(.workspace):not(.welcome) {
    flex-shrink: 0;
  }
}
.workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  padding: 0;
  position: relative;
}
.workspace-split {
  width: 100%;
  min-height: 0;
}
.main-column {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.content-split {
  flex: 1;
  min-height: 0;
  width: 100%;
}
:deep(.p-splitter) {
  border: 0;
  border-radius: 0;
  background: transparent;
}
:deep(.p-splitterpanel) {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
:deep(.p-splitter[data-p-resizing="true"]) {
  user-select: none;
  -webkit-user-select: none;
}
:deep(.p-splitter-gutter) {
  background: var(--color-level-200);
}
:deep(.p-splitter-gutter:hover),
:deep(.p-splitter-gutter:focus-within) {
  background: color-mix(in srgb, var(--color-accent) 30%, transparent);
}
:deep(.p-splitter-gutter-handle) {
  background: radial-gradient(
      circle,
      var(--color-text-secondary) 1px,
      transparent 1.5px
    )
    center / 4px 5px;
  opacity: 0.5;
  border-radius: 0;
}
.tabs {
  display: flex;
  gap: 4px;
}
.notice {
  padding: 6px 12px;
  margin: 0 12px 6px;
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-md);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
#error-notifications {
  position: fixed;
  z-index: 10000;
  bottom: calc(var(--font-size-base) * 24 / 13 + 12px);
  right: 12px;
  width: min(680px, calc(100vw - 24px));
  max-height: calc(100vh - 80px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.retry-push {
  align-self: flex-start;
  margin: 0 12px 6px;
}
.welcome {
  width: min(700px, 100%);
  min-height: 0;
  overflow: auto;
  flex-shrink: 1;
  margin: 4vh auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  > i {
    font-size: calc(var(--font-size-base) * 48 / 13);
    color: var(--color-accent);
  }
}
.output {
  flex: 0 1 auto;
  max-height: 20%;
  overflow: auto;
  padding: 4px 8px;
  pre {
    max-height: 150px;
    overflow: auto;
  }
}
footer {
  position: fixed;
  bottom: 0;
  width: 100%;
  background: var(--color-level-200);
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  padding: 0 12px;
  align-items: center;
  height: calc(var(--font-size-base) * 24 / 13);
  font-size: calc(var(--font-size-base) * 12 / 13);
  color: var(--color-text-secondary);
}
</style>

<style lang="scss" scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}
/* Changes (top) and branches (bottom) share the sidebar height; each scrolls. */
.sidebar-split {
  flex: 1;
  min-height: 0;
  width: 100%;
}
.sidebar-pane {
  overflow: auto;
  /* The changes pane scrolls inside its own lists. */
  &:first-child {
    overflow: hidden;
  }
}
</style>

<style lang="scss" scoped>
.sidebar-collapse {
  position: absolute;
  top: 6px;
  z-index: 5;
  width: 20px;
  height: 20px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-level-200);
  color: var(--color-text-secondary);
  padding: 0;
}
.sidebar.collapsed {
  flex: 0 0 0 !important;
  min-width: 0 !important;
  visibility: hidden;
}
:deep(.p-splitter-gutter:hover .p-splitter-gutter-handle),
:deep(.p-splitter-gutter:focus-within .p-splitter-gutter-handle) {
  opacity: 1;
}
</style>

<style lang="scss" scoped>
footer > span:last-child {
  font-family: var(--font-code);
  font-size: calc(var(--font-size-code) * 0.85);
  line-height: 1;
}
</style>
