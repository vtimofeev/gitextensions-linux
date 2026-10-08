<template>
  <section ref="pane" class="panel sidebar-changes">
    <CommitForm />
    <section
      v-for="area in areas"
      :key="area.key"
      @keydown.esc.stop="store.clearSelection()"
    >
      <div class="panel-heading">
        <h3>
          {{ $t(area.key) }} <span class="muted">{{ area.files.length }}</span>
        </h3>
        <div v-if="selected(area.key).length > 1" class="selection-actions">
          <Button
            :label="
              $t(area.key === 'staged' ? 'unstage' : 'stage') +
              ' ' +
              selected(area.key).length
            "
            :title="
              $t(area.key === 'staged' ? 'unstageFiles' : 'stageFiles', {
                n: selected(area.key).length,
              })
            "
            text
            size="small"
            :disabled="store.busy || !selections[area.key].movable"
            @click="moveFiles(selected(area.key), area.key)"
          />
          <Button
            :label="$t('revert') + ' ' + selected(area.key).length"
            :title="$t('revertFiles', { n: selected(area.key).length })"
            text
            size="small"
            :disabled="store.busy || selections[area.key].conflict"
            @click="confirmFiles(selected(area.key), area.key)"
          />
        </div>
        <Button
          v-if="area.key === 'staged'"
          class="review-button"
          icon="pi pi-sparkles"
          :aria-label="$t('reviewUncommitted')"
          :title="$t('reviewUncommitted')"
          text
          size="small"
          :disabled="store.busy"
          @click="reviewChanges"
        />
        <Button
          :label="$t(area.key === 'staged' ? 'unstageAll' : 'stageAll')"
          size="small"
          text
          :disabled="
            store.busy ||
            !area.files.length ||
            (area.key === 'unstaged' && !area.files.some((f) => !f.conflict))
          "
          @click="area.key === 'staged' ? store.unstage() : store.stage()"
        />
      </div>
      <div
        class="sidebar-files"
        :data-area="area.key"
        tabindex="0"
        role="listbox"
        aria-multiselectable="true"
        :aria-label="$t(area.key)"
        @keydown="listKey($event, area.key)"
        @scroll="scroll($event, area.key)"
        @dragover.prevent
        @drop.prevent="drop($event, area.key)"
      >
        <div
          class="files-spacer"
          :style="{ height: `${area.files.length * rowHeight}px` }"
        >
          <div
            class="files-window"
            :style="{
              transform: `translateY(${start(area.key) * rowHeight}px)`,
            }"
          >
            <div
              v-for="(file, index) in visible(area.key)"
              :key="file.path"
              class="file-row"
              :data-index="start(area.key) + index"
              :style="{ height: `${rowHeight}px` }"
              :class="{ selected: store.isFileSelected(file.path, area.key) }"
              role="option"
              :aria-setsize="area.files.length"
              :aria-posinset="start(area.key) + index + 1"
              :aria-selected="store.isFileSelected(file.path, area.key)"
              @click="select($event, file, area.key)"
              :draggable="!store.busy && !file.conflict"
              @dragstart="drag($event, file, area.key)"
              @contextmenu.prevent.stop="menu($event, file, area.key)"
            >
              <span class="file-status">{{
                file.conflict
                  ? "!"
                  : file.untracked
                    ? "?"
                    : area.key === "staged"
                      ? file.index
                      : file.worktree
              }}</span>
              <button
                class="file-button"
                :title="file.path"
                @keydown.shift.f10.prevent.stop="menu($event, file, area.key)"
              >
                {{ file.path }}
              </button>
              <div
                class="row-actions"
                :class="{ 'conflict-actions': file.conflict }"
                @click.stop
              >
                <button
                  type="button"
                  class="row-action"
                  v-if="!file.conflict"
                  :aria-label="actionLabel('revert', file, area.key)"
                  :title="actionLabel('revert', file, area.key)"
                  :disabled="store.busy || hasConflict(file, area.key)"
                  @click="confirmFiles(targets(file, area.key), area.key)"
                >
                  <i class="pi pi-undo" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="row-action"
                  :aria-label="
                    actionLabel(
                      file.conflict
                        ? 'resolveConflict'
                        : area.key === 'staged'
                          ? 'unstage'
                          : 'stage',
                      file,
                      area.key,
                    )
                  "
                  :title="
                    actionLabel(
                      file.conflict
                        ? 'resolveConflict'
                        : area.key === 'staged'
                          ? 'unstage'
                          : 'stage',
                      file,
                      area.key,
                    )
                  "
                  :disabled="store.busy"
                  @click="
                    file.conflict
                      ? store.openConflict(file.path)
                      : moveFiles(targets(file, area.key), area.key)
                  "
                >
                  <i
                    :class="[
                      'pi',
                      file.conflict
                        ? 'pi-external-link'
                        : area.key === 'staged'
                          ? 'pi-minus'
                          : 'pi-plus',
                    ]"
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
        <p v-if="!area.files.length" class="empty">{{ $t("noChanges") }}</p>
      </div>
    </section>
  </section>
  <Teleport to="body"
    ><div
      v-if="context"
      ref="menu"
      class="ref-menu file-menu"
      role="menu"
      :aria-label="$t('fileActions')"
      :style="position"
      @keydown.esc="context = null"
    >
      <button role="menuitem" @click="inspect('file')">
        {{ $t("wholeFile") }}</button
      ><button role="menuitem" @click="inspect('history')">
        {{ $t("fileHistory") }}</button
      ><button role="menuitem" @click="inspect('blame')">
        {{ $t("blame") }}
      </button>
      <button role="menuitem" :disabled="store.busy" @click="externalDiff">
        {{ $t("viewExternalDiff") }}
      </button>
      <button
        v-if="context.file.conflict"
        role="menuitem"
        :disabled="store.busy"
        @click="
          store.openConflict(context.file.path);
          context = null;
        "
      >
        {{ $t("resolveConflict") }}
      </button>
      <button v-else role="menuitem" :disabled="store.busy" @click="move">
        {{ $t(context.area === "staged" ? "unstage" : "stage") }}</button
      ><button
        role="menuitem"
        :disabled="store.busy || hasConflict(context.file, context.area)"
        @click="confirmDiscard"
      >
        {{ $t("revert") }}
      </button>
      <button role="menuitem" @click="copyPaths">{{ $t("copyPaths") }}</button>
    </div></Teleport
  >
  <Dialog
    :visible="!!discarding"
    modal
    :header="
      discarding && discarding.files.length > 1
        ? $t('revertFiles', { n: discarding.files.length })
        : $t('revert')
    "
    :closable="!store.busy"
    @update:visible="!store.busy && (discarding = null)"
  >
    <div class="dialog-form">
      <template v-if="discarding">
        <ul class="revert-files">
          <li v-for="file in discarding.files" :key="file.path">
            {{
              $t(
                discarding.area === "unstaged"
                  ? "discardWorktreeWarning"
                  : "discardAllWarning",
                { file: file.path },
              )
            }}
            <span v-if="file.untracked && deleteNewFiles">{{
              $t("deleteUntrackedWarning")
            }}</span>
          </li>
        </ul>
        <label v-if="mixedNewFiles"
          ><input
            v-model="deleteNewFiles"
            type="checkbox"
            :disabled="store.busy"
          />
          {{ $t("deleteNewFiles") }}</label
        >
        <p>{{ $t("cannotUndo") }}</p>
      </template>
      <div class="actions">
        <Button
          :label="$t('revert')"
          severity="danger"
          :loading="store.busy"
          @click="discard"
        /><Button
          :label="$t('cancel')"
          severity="secondary"
          :disabled="store.busy"
          @click="discarding = null"
        />
      </div>
    </div>
  </Dialog>
</template>
<script lang="ts">
import { Component, Vue, Watch, toNative } from "vue-facing-decorator";
import { nextTick, markRaw } from "vue";
import CommitForm from "./CommitForm.vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import { container } from "../store/container";
import type { FileStatus } from "../domain/models";
type Area = "staged" | "unstaged";
@Component({ components: { CommitForm, Button, Dialog } })
class SidebarChanges extends Vue {
  context: { file: FileStatus; area: Area; x: number; y: number } | null = null;
  discarding: { files: FileStatus[]; area: Area } | null = null;
  deleteNewFiles = false;
  get mixedNewFiles() {
    return (
      !!this.discarding?.files.some((f) => f.untracked) &&
      this.discarding.files.some((f) => !f.untracked)
    );
  }
  private dragged: {
    files: FileStatus[];
    token: string;
    area: Area;
    path: string;
  } | null = null;
  reviewChanges() {
    void container.review.open(this.store.path, null);
  }
  get store() {
    return container.repository;
  }
  get areas() {
    return [
      { key: "staged" as const, files: this.store.staged },
      { key: "unstaged" as const, files: this.store.unstaged },
    ];
  }
  get selections() {
    const summary = (area: Area) => {
      const files = this.store.selectionFiles(area);
      return {
        files,
        conflict: files.some((f) => f.conflict),
        movable: files.some((f) => !f.conflict),
      };
    };
    return { staged: summary("staged"), unstaged: summary("unstaged") };
  }
  selected(area: Area) {
    return this.selections[area].files;
  }
  hasConflict(file: FileStatus, area: Area) {
    return this.store.isFileSelected(file.path, area)
      ? this.selections[area].conflict
      : file.conflict;
  }
  targets(file: FileStatus, area: Area) {
    return this.store.isFileSelected(file.path, area)
      ? this.selected(area)
      : [file];
  }
  actionLabel(
    action: "stage" | "unstage" | "revert" | "resolveConflict",
    file: FileStatus,
    area: Area,
  ) {
    const n = this.targets(file, area).length;
    if (n > 1 && action !== "resolveConflict")
      return this.$t(
        action === "stage"
          ? "stageFiles"
          : action === "unstage"
            ? "unstageFiles"
            : "revertFiles",
        { n },
      );
    return this.$t(action) + ": " + file.path;
  }
  select(event: MouseEvent | KeyboardEvent, file: FileStatus, area: Area) {
    if (this.store.busy) return;
    if (event.shiftKey) this.store.selectRange(file.path, area);
    else if (event.ctrlKey || event.metaKey)
      this.store.toggleFile(file.path, area);
    else this.store.selectFile(file.path, area);
    if (file.conflict) this.store.openConflict(file.path);
    else
      void this.store.loadDiff(file.path, file.untracked ? "untracked" : area);
  }
  offsets: Record<Area, number> = { staged: 0, unstaged: 0 };
  heights: Record<Area, number> = { staged: 288, unstaged: 288 };
  private observer: ResizeObserver | null = null;
  get rowHeight() {
    return Math.round((container.preferences.fontSize * 29) / 13);
  }
  get fontSize() {
    return container.preferences.fontSize;
  }
  list(area: Area) {
    return (this.$refs.pane as HTMLElement).querySelector(
      `.sidebar-files[data-area="${area}"]`,
    ) as HTMLElement;
  }
  start(area: Area) {
    const last = Math.max(
      0,
      this.store.filesIn(area).length -
        Math.ceil(this.heights[area] / this.rowHeight),
    );
    return Math.max(
      0,
      Math.min(last, Math.floor(this.offsets[area] / this.rowHeight)) - 4,
    );
  }
  visible(area: Area) {
    return this.store
      .filesIn(area)
      .slice(
        this.start(area),
        this.start(area) + Math.ceil(this.heights[area] / this.rowHeight) + 9,
      );
  }
  scroll(event: Event, area: Area) {
    this.offsets[area] = (event.target as HTMLElement).scrollTop;
  }
  @Watch("fontSize")
  fontChanged(value: number, old: number) {
    for (const area of ["staged", "unstaged"] as const) {
      this.list(area).scrollTop =
        (this.offsets[area] * Math.round((value * 29) / 13)) /
        Math.round((old * 29) / 13);
      this.offsets[area] = this.list(area).scrollTop;
    }
  }
  async listKey(event: KeyboardEvent, area: Area) {
    if (this.store.busy) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      event.stopPropagation();
      this.store.selectAll(area);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.store.clearSelection();
      this.context = null;
      return;
    }
    if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const list = event.currentTarget as HTMLElement;
    const row = (event.target as HTMLElement).closest<HTMLElement>(".file-row");
    const files = this.store.filesIn(area);
    const index = row ? Number(row.dataset.index) : -1;
    const next =
      index < 0
        ? event.key === "ArrowDown"
          ? 0
          : files.length - 1
        : Math.max(
            0,
            Math.min(
              files.length - 1,
              index + (event.key === "ArrowDown" ? 1 : -1),
            ),
          );
    const file = files[next];
    if (!file) return;
    const top = next * this.rowHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + this.rowHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = top + this.rowHeight - list.clientHeight;
    this.offsets[area] = list.scrollTop;
    this.select(event, file, area);
    await nextTick();
    list
      .querySelector<HTMLButtonElement>(`[data-index="${next}"] .file-button`)
      ?.focus({ preventScroll: true });
  }
  async moveFiles(files: FileStatus[], area: Area) {
    await (area === "staged"
      ? this.store.unstage(files)
      : this.store.stage(files));
  }
  confirmFiles(files: FileStatus[], area: Area) {
    if (this.store.busy || files.some((f) => f.conflict)) return;
    this.discarding = { files: [...files], area };
    this.deleteNewFiles = files.every((f) => f.untracked);
    this.context = null;
    this.store.error = "";
  }
  async copyPaths() {
    const context = this.context;
    this.context = null;
    if (context)
      await this.store.copyFilePaths(this.targets(context.file, context.area));
  }
  get position() {
    return {
      left: `${Math.min(this.context?.x ?? 0, window.innerWidth - 240)}px`,
      top: `${Math.min(this.context?.y ?? 0, window.innerHeight - 260)}px`,
    };
  }
  mounted() {
    this.observer = markRaw(
      new ResizeObserver(() => {
        for (const area of ["staged", "unstaged"] as const)
          this.heights[area] = this.list(area).clientHeight;
      }),
    );
    for (const area of ["staged", "unstaged"] as const)
      this.observer.observe(this.list(area));
    document.addEventListener("click", this.outside);
    document.addEventListener("keydown", this.escape);
  }
  beforeUnmount() {
    this.observer?.disconnect();
    document.removeEventListener("click", this.outside);
    document.removeEventListener("keydown", this.escape);
  }
  outside(event: MouseEvent) {
    if (!(event.target as HTMLElement).closest(".file-menu"))
      this.context = null;
  }
  escape(event: KeyboardEvent) {
    if (event.key === "Escape") this.context = null;
  }
  @Watch("store.refMenu")
  referenceMenu() {
    if (this.store.refMenu) this.context = null;
  }
  @Watch("store.path")
  changed() {
    this.context = null;
    this.discarding = null;
    this.dragged = null;
    for (const area of ["staged", "unstaged"] as const) {
      this.offsets[area] = 0;
      if (this.$refs.pane) this.list(area).scrollTop = 0;
    }
  }
  async menu(event: MouseEvent | KeyboardEvent, file: FileStatus, area: Area) {
    if (this.store.busy) return;
    this.store.refMenu = null;
    if (!this.store.isFileSelected(file.path, area))
      this.store.selectFile(file.path, area);
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.context = {
      file,
      area,
      x: event instanceof MouseEvent ? event.clientX : rect.left,
      y: event instanceof MouseEvent ? event.clientY : rect.bottom,
    };
    await nextTick();
    (this.$refs.menu as HTMLElement)
      ?.querySelector<HTMLButtonElement>("button")
      ?.focus();
  }
  inspect(mode: "file" | "history" | "blame") {
    const target = this.context;
    this.context = null;
    if (target)
      this.store.inspectFile(
        target.file.path,
        target.file.untracked ? "untracked" : target.area,
        mode,
      );
  }
  externalDiff() {
    const context = this.context;
    this.context = null;
    if (!context) return;
    const file = this.targets(context.file, context.area)[0];
    if (!file) return;
    if (file.conflict) this.store.openConflict(file.path);
    else
      this.store.openDiffTool(
        file.path,
        file.untracked ? "untracked" : context.area,
      );
  }
  async move() {
    const context = this.context;
    this.context = null;
    if (context)
      await this.moveFiles(
        this.targets(context.file, context.area),
        context.area,
      );
  }
  confirmDiscard() {
    const context = this.context;
    if (context)
      this.confirmFiles(this.targets(context.file, context.area), context.area);
  }
  async discard() {
    if (!this.discarding) return;
    const { files, area } = this.discarding;
    const included = files.filter((f) => !f.untracked || this.deleteNewFiles);
    if (
      !included.length ||
      (await this.store.discard(included, area === "unstaged"))
    )
      this.discarding = null;
  }
  drag(event: DragEvent, file: FileStatus, area: Area) {
    if (this.store.busy || file.conflict) {
      event.preventDefault();
      return;
    }
    if (!this.store.isFileSelected(file.path, area))
      this.store.selectFile(file.path, area);
    this.dragged = {
      files: this.targets(file, area).filter((f) => !f.conflict),
      token: file.path,
      area,
      path: this.store.path,
    };
    event.dataTransfer?.setData("application/x-gitextensions-file", file.path);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }
  async drop(event: DragEvent, area: Area) {
    const dragged = this.dragged;
    this.dragged = null;
    if (
      !dragged ||
      dragged.path !== this.store.path ||
      dragged.area === area ||
      this.store.busy ||
      event.dataTransfer?.getData("application/x-gitextensions-file") !==
        dragged.token
    )
      return;
    await (area === "staged"
      ? this.store.stage(dragged.files)
      : this.store.unstage(dragged.files));
  }
}
export default toNative(SidebarChanges);
</script>
<style lang="scss" scoped>
/* Title stays left; selection, review and stage-all actions group on the right. */
.panel-heading > h3 {
  margin-right: auto;
}
/* The changes pane fills its splitter panel: the commit form keeps its height and
   Staged / Unstaged share the rest, each list scrolling on its own. */
.sidebar-changes {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  > section {
    flex: 1 1 0;
    min-height: calc(var(--font-size-base) * 70 / 13);
    display: flex;
    flex-direction: column;
  }
}
.sidebar-files {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.panel-heading {
  flex-wrap: wrap;
  gap: 2px;
  padding: 3px 6px;
  h3 {
    font-size: calc(var(--font-size-base) * 12 / 13);
  }
}
.file-row {
  gap: 4px;
  padding: 0 5px;
  font-size: calc(var(--font-size-base) * 12 / 13);
}
.empty {
  padding: 6px;
  font-size: calc(var(--font-size-base) * 12 / 13);
}
.selection-actions {
  display: flex;
  margin-left: auto;
}
.row-actions {
  display: flex;
  flex-shrink: 0;
  visibility: hidden;
  .row-action {
    width: calc(var(--font-size-base) * 24 / 13);
    height: calc(var(--font-size-base) * 24 / 13);
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-accent);
    cursor: pointer;
    &:hover {
      background: color-mix(in srgb, var(--color-accent) 12%, transparent);
    }
    &:disabled {
      opacity: 0.6;
      cursor: default;
    }
    .pi {
      font-size: var(--text-sm);
    }
  }
}
.file-row:hover .row-actions,
.file-row:focus-within .row-actions,
.file-row.selected .row-actions,
.row-actions.conflict-actions {
  visibility: visible;
}
.revert-files {
  padding-left: 1.5em;
  overflow-wrap: anywhere;
  max-height: 45vh;
  overflow: auto;
}
</style>

<style lang="scss" scoped>
.files-spacer {
  position: relative;
}
.files-window {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}
.file-row {
  box-sizing: border-box;
  min-height: 0;
}
.sidebar-files {
  overscroll-behavior: contain;
}
</style>
