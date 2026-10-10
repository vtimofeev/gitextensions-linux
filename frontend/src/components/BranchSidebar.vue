<template>
  <aside class="panel branches">
    <div class="panel-heading">
      <h2>{{ $t("branches") }}</h2>
      <Button
        icon="pi pi-plus"
        size="small"
        text
        :aria-label="$t('create')"
        :disabled="store.busy"
        @click="requestCreate"
      />
    </div>
    <div class="branch-search">
      <input
        v-model="search"
        type="search"
        :placeholder="$t('searchBranches')"
        :aria-label="$t('searchBranches')"
        @keydown.esc.prevent="search = ''"
      />
    </div>
    <div
      ref="viewport"
      class="branch-list"
      tabindex="0"
      :aria-label="$t('branches')"
      @scroll="scroll"
      @keydown="navigate"
    >
      <div class="branch-spacer" :style="{ height: totalHeight + 'px' }">
        <div
          class="branch-window"
          :style="{ transform: `translateY(${rows[startIndex]?.top ?? 0}px)` }"
        >
          <div
            v-for="row in visibleRows"
            :key="row.key"
            :data-index="row.index"
          >
            <div
              v-if="row.branch && !row.branch.remote"
              :style="{ height: row.height + 'px' }"
              class="branch-row"
              :class="{ selected: row.branch.current }"
              @contextmenu="menu($event, row.branch)"
            >
              <button
                :disabled="store.busy"
                :title="$t('checkout') + ': ' + row.branch.name"
                @click="store.focusBranch(row.branch.hash)"
                @contextmenu="menu($event, row.branch)"
                @keydown.shift.f10="menu($event, row.branch)"
              >
                <i class="pi pi-code-branch" aria-hidden="true" /><span
                  >{{ row.branch.name
                  }}<small
                    >{{ row.branch.upstream }} {{ row.branch.tracking }}</small
                  ></span
                ><i
                  v-if="row.branch.current"
                  class="pi pi-check"
                  aria-hidden="true"
                />
              </button>
              <Button
                icon="pi pi-trash"
                text
                severity="secondary"
                size="small"
                :aria-label="$t('delete') + ': ' + row.branch.name"
                :disabled="store.busy || row.branch.current"
                @click="
                  deleting = row.branch.name;
                  force = false;
                "
              />
            </div>
            <button
              v-else-if="row.branch"
              :title="row.branch.name"
              :style="{ height: row.height + 'px' }"
              class="remote-ref"
              :disabled="store.busy"
              @click="store.focusBranch(row.branch.hash)"
              @contextmenu="menu($event, row.branch)"
              @keydown.shift.f10="menu($event, row.branch)"
            >
              <i class="pi pi-cloud" aria-hidden="true" /> {{ row.branch.name }}
            </button>
            <div
              v-else-if="row.kind === 'heading'"
              class="panel-heading"
              :style="{ height: row.height + 'px' }"
            >
              <h2>{{ $t("remotes") }}</h2>
            </div>
            <p v-else class="empty" :style="{ height: row.height + 'px' }">
              {{
                $t(
                  row.kind === "noRemotes" ? "noRemotes" : "noMatchingBranches",
                )
              }}
            </p>
          </div>
        </div>
      </div>
    </div>
    <Dialog
      v-model:visible="creating"
      modal
      :header="$t('create')"
      :closable="!store.busy"
    >
      <form class="dialog-form" @submit.prevent="create">
        <label
          >{{ $t("branchName")
          }}<input v-model="name" required autofocus :disabled="store.busy"
        /></label>
        <label
          >{{ $t("startPoint")
          }}<input
            v-model="start"
            :placeholder="store.selectedCommit?.hash.slice(0, 12) || 'HEAD'"
            :disabled="store.busy"
        /></label>
        <label class="check"
          ><input
            v-model="switchNew"
            type="checkbox"
            :disabled="store.busy"
          />{{ $t("switchNew") }}</label
        >
        <div class="actions">
          <Button
            type="submit"
            :label="$t('create')"
            :loading="store.busy"
          /><Button
            :label="$t('cancel')"
            severity="secondary"
            :disabled="store.busy"
            @click="creating = false"
          />
        </div>
      </form>
    </Dialog>
    <Dialog
      :visible="!!deleting"
      modal
      :header="$t('confirmation')"
      :closable="!store.busy"
      @update:visible="deleting = ''"
    >
      <div class="dialog-form">
        <p>{{ $t("confirmDelete", { name: deleting }) }}</p>
        <label class="check"
          ><input v-model="force" type="checkbox" />{{
            $t("forceDelete")
          }}</label
        >
        <p v-if="force" class="muted">{{ $t("deleteWarning") }}</p>
        <div class="actions">
          <Button
            severity="danger"
            :label="$t('delete')"
            :loading="store.busy"
            @click="remove"
          /><Button
            severity="secondary"
            :label="$t('cancel')"
            :disabled="store.busy"
            @click="deleting = ''"
          />
        </div>
      </div>
    </Dialog>
  </aside>
</template>
<script lang="ts">
import { Component, Vue, Watch, toNative } from "vue-facing-decorator";
import { markRaw, nextTick } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import type { Branch } from "../domain/models";
import { container } from "../store/container";
@Component({ components: { Button, Dialog } })
class BranchSidebar extends Vue {
  @Watch("store.createBranchRequested")
  requestCreate() {
    this.switchNew = true;
    this.creating = true;
  }
  menu(event: MouseEvent | KeyboardEvent, branch: Branch) {
    const commit = this.store.snapshot?.commits.find(
      (c) => c.hash === branch.hash,
    );
    this.store.openRefMenu(event, {
      name: branch.name,
      hash: branch.hash,
      kind: branch.remote ? "remote" : "local",
      current: branch.current,
      parents: commit?.parents.length ?? 0,
    });
  }
  search = "";
  creating = false;
  deleting = "";
  name = "";
  start = "";
  switchNew = true;
  force = false;
  get store() {
    return container.repository;
  }
  get locals() {
    const query = this.search.trim().toLocaleLowerCase();
    return (
      this.store.snapshot?.branches.filter(
        (b) => !b.remote && b.name.toLocaleLowerCase().includes(query),
      ) ?? []
    );
  }
  get remotes() {
    const query = this.search.trim().toLocaleLowerCase();
    return (
      this.store.snapshot?.branches.filter(
        (b) => b.remote && b.name.toLocaleLowerCase().includes(query),
      ) ?? []
    );
  }
  offset = 0;
  height = 240;
  private observer: ResizeObserver | null = null;
  get fontSize() {
    return container.preferences.fontSize;
  }
  get rows() {
    let top = 0;
    const rows: {
      key: string;
      kind: string;
      branch: Branch | null;
      height: number;
      top: number;
      index: number;
    }[] = [];
    const add = (
      key: string,
      kind: string,
      branch: Branch | null,
      size: number,
    ) => {
      const height = Math.ceil((size * this.fontSize) / 13);
      rows.push({ key, kind, branch, height, top, index: rows.length });
      top += height;
    };
    for (const branch of this.locals)
      add(
        "local:" + branch.name,
        "branch",
        branch,
        branch.upstream || branch.tracking ? 44 : 29,
      );
    if (this.search.trim() && !this.locals.length)
      add("empty:locals", "noMatchingBranches", null, 44);
    add("heading:remotes", "heading", null, 34);
    for (const branch of this.remotes)
      add("remote:" + branch.name, "branch", branch, 29);
    if (!this.remotes.length)
      add(
        "empty:remotes",
        this.search.trim() ? "noMatchingBranches" : "noRemotes",
        null,
        44,
      );
    return markRaw(rows);
  }
  get totalHeight() {
    const row = this.rows.at(-1);
    return row ? row.top + row.height : 0;
  }
  rowAt(offset: number) {
    let low = 0,
      high = this.rows.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const row = this.rows[middle]!;
      if (row.top + row.height <= offset) low = middle + 1;
      else high = middle;
    }
    return low;
  }
  get startIndex() {
    return Math.max(0, this.rowAt(this.offset) - 4);
  }
  get visibleRows() {
    return this.rows.slice(
      this.startIndex,
      this.rowAt(this.offset + this.height) + 5,
    );
  }
  scroll(event: Event) {
    this.offset = (event.target as HTMLElement).scrollTop;
  }
  mounted() {
    const viewport = this.$refs.viewport as HTMLElement;
    this.observer = markRaw(
      new ResizeObserver(() => {
        this.height = viewport.clientHeight;
      }),
    );
    this.observer.observe(viewport);
  }
  beforeUnmount() {
    this.observer?.disconnect();
  }
  @Watch("search")
  @Watch("store.path")
  resetScroll() {
    this.offset = 0;
    const viewport = this.$refs.viewport as HTMLElement | undefined;
    if (viewport) viewport.scrollTop = 0;
  }
  @Watch("fontSize")
  async fontChanged(value: number, old: number) {
    const offset = (this.offset * value) / old;
    await nextTick();
    const viewport = this.$refs.viewport as HTMLElement | undefined;
    if (!viewport) return;
    viewport.scrollTop = offset;
    this.offset = viewport.scrollTop;
  }
  async navigate(event: KeyboardEvent) {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const viewport = this.$refs.viewport as HTMLElement;
    const focused = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-index]",
    );
    let index = focused ? Number(focused.dataset.index) : -1;
    const direction = event.key === "ArrowUp" || event.key === "End" ? -1 : 1;
    if (event.key === "Home") index = -1;
    if (event.key === "End" || (index < 0 && direction < 0))
      index = this.rows.length;
    do {
      index += direction;
    } while (
      index >= 0 &&
      index < this.rows.length &&
      !this.rows[index]!.branch
    );
    const row = this.rows[index];
    if (!row?.branch) return;
    event.preventDefault();
    event.stopPropagation();
    if (row.top < viewport.scrollTop) viewport.scrollTop = row.top;
    else if (row.top + row.height > viewport.scrollTop + viewport.clientHeight)
      viewport.scrollTop = row.top + row.height - viewport.clientHeight;
    this.offset = viewport.scrollTop;
    await nextTick();
    viewport
      .querySelector<HTMLButtonElement>(`[data-index="${index}"] button`)
      ?.focus({ preventScroll: true });
  }
  async create() {
    if (await this.store.createBranch(this.name, this.start, this.switchNew)) {
      this.creating = false;
      this.name = "";
      this.start = "";
    }
  }
  async remove() {
    if (await this.store.deleteBranch(this.deleting, this.force))
      this.deleting = "";
  }
}
export default toNative(BranchSidebar);
</script>
<style lang="scss" scoped>
.branch-search {
  padding: 4px 6px;
  input {
    font-size: calc(var(--font-size-base) * 12 / 13);
  }
}
.branches {
  align-self: stretch;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  > .panel-heading,
  > .branch-search {
    flex-shrink: 0;
  }
}
.branch-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.branch-spacer {
  position: relative;
}
.branch-window {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}
.branch-window .panel-heading,
.branch-window .empty {
  box-sizing: border-box;
  margin: 0;
}
.branch-window .empty {
  padding: calc(var(--font-size-base) * 12 / 13);
}
.branch-row {
  box-sizing: border-box;
  min-height: calc(var(--font-size-base) * 29 / 13);
  display: flex;
  align-items: center;
  padding: 0 6px;
  > button:first-child {
    flex: 1;
    min-width: 0;
    display: flex;
    gap: 4px;
    align-items: center;
    border: none;
    background: transparent;
    color: var(--ref-local);
    text-align: left;
    padding: 4px 2px;
  }
  span {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-text-secondary);
  }
}
.remote-ref {
  padding: 5px 10px;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
  box-sizing: border-box;
  color: var(--ref-remote);
}
</style>
