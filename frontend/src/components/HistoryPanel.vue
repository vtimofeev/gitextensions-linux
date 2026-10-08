<template>
  <section class="panel history">
    <div class="panel-heading">
      <h2>
        {{ $t("history") }}
        <span class="muted">{{
          search
            ? `${commits.length} / ${store.snapshot?.commits.length ?? 0}`
            : store.snapshot?.commits.length
        }}</span>
      </h2>
      <div class="graph-legend" :aria-label="$t('graphLegend')">
        <span><i class="head-marker" />HEAD</span
        ><span :title="store.snapshot?.branch"
          ><i class="branch-marker" />{{ $t("currentBranchPointer") }}</span
        >
      </div>
      <!-- Filters apply on Enter (as Git Extensions' quick filter); × or Esc resets. -->
      <form
        class="filter-field search-filter"
        @submit.prevent="applySearch"
        @keydown.esc.prevent="clearSearch"
      >
        <input
          v-model="searchInput"
          :placeholder="$t('search')"
          :aria-label="$t('search')"
        /><button
          v-if="searchInput || search"
          type="button"
          class="clear-filter"
          :aria-label="$t('clearFilter')"
          :title="$t('clearFilter')"
          @click="clearSearch"
        >
          <i class="pi pi-times" />
        </button>
      </form>
      <form
        class="filter-field author-filter"
        @submit.prevent="store.filterAuthor(author)"
        @keydown.esc.prevent="clearAuthor"
      >
        <input
          v-model="author"
          :placeholder="$t('authorFilter')"
          :aria-label="$t('authorFilter')"
          :disabled="store.busy"
        /><button
          v-if="author || store.authorFilter"
          type="button"
          class="clear-filter"
          :aria-label="$t('clearFilter')"
          :title="$t('clearFilter')"
          :disabled="store.busy"
          @click="clearAuthor"
        >
          <i class="pi pi-times" /></button
        ><Button
          type="submit"
          icon="pi pi-filter"
          text
          :aria-label="$t('applyFilter')"
          :disabled="store.busy"
        />
      </form>
    </div>
    <div
      class="history-header"
      :style="{ ...columns, paddingRight: gutter + 'px' }"
    >
      <span>{{ $t("graph") }}</span
      ><span>SHA</span><span>{{ $t("history") }}</span
      ><span
        v-if="preferencesStore.showAuthorAvatarColumn"
        :title="$t('avatar')"
        :aria-label="$t('avatar')"
        ><i class="pi pi-user" aria-hidden="true" /></span
      ><span>{{ $t("author") }}</span
      ><span>{{ $t("date") }}</span>
    </div>
    <div class="history-viewport">
      <div
        ref="scroller"
        class="history-scroll"
        tabindex="0"
        :aria-label="$t('history')"
        @scroll="scroll"
        @keydown="navigate"
      >
        <div
          class="history-spacer"
          :style="{ height: `${rows.length * rowHeight}px` }"
        >
          <div
            class="history-window"
            :style="{ transform: `translateY(${start * rowHeight}px)` }"
          >
            <div
              v-for="row in visibleRows"
              :key="row.commit.hash"
              class="commit-row"
              :class="{
                selected: store.selectedCommit?.hash === row.commit.hash,
                authored: isMine(row.commit),
              }"
              :style="columns"
              :data-hash="row.commit.hash"
              :data-head="row.commit.hash === pointers.head"
              :data-current-branch="row.commit.hash === pointers.branch"
              @contextmenu="menu($event, row.commit)"
              @keydown.shift.f10="menu($event, row.commit)"
            >
              <span aria-hidden="true"></span>
              <button class="hash" @click="store.selectCommit(row.commit)">
                {{ row.commit.hash.slice(0, 8) }}
              </button>
              <button
                class="subject"
                :aria-pressed="store.selectedCommit?.hash === row.commit.hash"
                :title="`${row.commit.refs} ${row.commit.subject}`"
                :aria-label="`${row.commit.refs} ${row.commit.subject}`.trim()"
                @click="store.selectCommit(row.commit)"
              >
                <span v-if="labelMap.get(row.commit.hash)?.length" class="refs">
                  <span
                    v-for="label in labelMap.get(row.commit.hash)"
                    :key="label.kind + ':' + label.name"
                    class="ref-label"
                    :class="[label.kind, { current: label.current }]"
                    :data-ref-kind="label.kind"
                    :data-current="label.current"
                    :title="label.name"
                    @contextmenu.stop="refMenu($event, row.commit, label)"
                    >{{
                      label.kind === "tag"
                        ? "# "
                        : label.kind === "remote"
                          ? "☁ "
                          : ""
                    }}{{ label.name }}</span
                  > </span
                ><span class="subject-text">{{ row.commit.subject }}</span>
              </button>
              <span
                v-if="preferencesStore.showAuthorAvatarColumn"
                class="avatar-cell"
                ><AuthorAvatar
                  :name="row.commit.author"
                  :email="row.commit.authorEmail"
              /></span>
              <span
                class="author"
                :style="{
                  color: authorColor(
                    row.commit.authorEmail || row.commit.author,
                  ),
                }"
                :title="`${row.commit.author} <${row.commit.authorEmail}>`"
                >{{ row.commit.author }}</span
              >
              <span class="muted date" :title="dateTitle(row.commit.date)">{{
                date(row.commit.date)
              }}</span>
            </div>
          </div>
        </div>
        <p v-if="!rows.length && !building" class="empty">
          {{ $t("emptyHistory") }}
        </p>
      </div>
      <canvas ref="canvas" class="commit-canvas" aria-hidden="true"></canvas>
      <span v-if="building" class="graph-loading" role="status">{{
        $t("loadingGraph")
      }}</span>
    </div>
    <div class="panel-heading">
      <span
        v-if="store.activity === 'activityLoadMore'"
        class="muted loading-more"
        role="status"
        ><i class="pi pi-spin pi-spinner" /> {{ $t("activityLoadMore") }}</span
      >
      <span v-if="layout.lanes > maxLanes" class="muted">{{
        $t("graphOverflow")
      }}</span>
      <span v-if="store.selectedCommit" class="muted">{{
        store.selectedCommit.subject
      }}</span>
    </div>
    <ErrorNotification :message="graphError" @dismiss="graphError = ''" />
  </section>
</template>
<script lang="ts">
import { Component, Vue, Watch, toNative } from "vue-facing-decorator";
import { markRaw } from "vue";
import Button from "primevue/button";
import AuthorAvatar from "./AuthorAvatar.vue";
import { authorColor } from "../domain/author-color";
import { compactDate } from "../domain/blame";
import ErrorNotification from "./ErrorNotification.vue";
import { container } from "../store/container";
import { historyRowHeight, graphLaneWidth } from "../graph/metrics";
import { RefLabels, type RefLabel } from "../graph/ref-labels";
import type { GraphLayout } from "../graph/layout";
import type { Commit, TargetRef } from "../domain/models";
import {
  GRAPH_EXTRA_WIDTH,
  GraphRenderer,
  GraphPointers,
  MAX_LANES,
} from "../graph/renderer";
@Component({ components: { Button, AuthorAvatar, ErrorNotification } })
class HistoryPanel extends Vue {
  authorColor = authorColor;
  search = "";
  searchInput = "";
  author = "";
  applySearch() {
    this.search = this.searchInput.trim();
  }
  clearSearch() {
    const filtered = !!this.search;
    this.searchInput = "";
    this.search = "";
    // Back to the first page after a filter, like the author filter.
    if (filtered)
      this.store.graphFocus = {
        hash: "",
        request: this.store.graphFocus.request,
      };
    if (filtered && this.store.limit > this.store.pageSize) {
      this.store.limit = this.store.pageSize;
      void this.store.refresh();
    }
  }
  async clearAuthor() {
    this.author = "";
    if (this.store.authorFilter) await this.store.filterAuthor("");
  }
  @Watch("store.authorFilter")
  authorChanged(value: string) {
    this.author = value;
  }
  layout: GraphLayout = { rows: [], lanes: 1 };
  graphError = "";
  building = false;
  offset = 0;
  height = 288;
  get rowHeight() {
    return historyRowHeight(container.preferences.fontSize);
  }
  get fontSize() {
    return container.preferences.fontSize;
  }
  maxLanes = MAX_LANES;
  private worker: Worker | null = null;
  private observer: ResizeObserver | null = null;
  // Real scrollbar width of the rows, so header columns line up with cells.
  gutter = 0;
  private frame = 0;
  private generation = 0;
  private renderer = markRaw(new GraphRenderer());
  get store() {
    return container.repository;
  }
  get commits() {
    const search = this.search.toLocaleLowerCase();
    const all = this.store.snapshot?.commits ?? [];
    if (!search) return all;
    return (
      all.filter((c) =>
        [c.hash, c.author, c.subject, c.refs].some((v) =>
          v.toLocaleLowerCase().includes(search),
        ),
      ) ?? []
    );
  }
  get labelMap() {
    const labels = new RefLabels(this.store.snapshot);
    return new Map(
      (this.store.snapshot?.commits ?? []).map((commit) => [
        commit.hash,
        labels.forCommit(commit),
      ]),
    );
  }
  get commitMap() {
    return new Map(this.commits.map((c) => [c.hash, c]));
  }
  get rows(): Array<{ commit: Commit }> {
    const map = this.commitMap;
    return this.layout.rows.flatMap((row) => {
      const commit = map.get(row.hash);
      return commit ? [{ commit }] : [];
    });
  }
  get start() {
    return Math.max(0, Math.floor(this.offset / this.rowHeight) - 4);
  }
  get visibleRows() {
    return this.rows.slice(
      this.start,
      this.start + Math.ceil(this.height / this.rowHeight) + 9,
    );
  }
  get preferencesStore() {
    return container.preferences;
  }
  isMine(commit: Commit) {
    return (
      this.preferencesStore.highlightMyCommits &&
      !!this.store.identity?.email &&
      commit.authorEmail === this.store.identity.email
    );
  }
  get columns() {
    return {
      gridTemplateColumns: `${Math.min(MAX_LANES, this.layout.lanes) * graphLaneWidth(this.fontSize) + (GRAPH_EXTRA_WIDTH * this.fontSize) / 13}px 92px minmax(150px,1fr) ${this.preferencesStore.showAuthorAvatarColumn ? Math.round((36 * this.fontSize) / 13) + "px " : ""}140px ${Math.round((122 * this.fontSize) / 13)}px`,
    };
  }
  @Watch("fontSize")
  fontChanged(value: number, old: number) {
    const scroller = this.$refs.scroller as HTMLElement;
    if (scroller) {
      scroller.scrollTop =
        (this.offset * historyRowHeight(value)) / historyRowHeight(old);
      this.offset = scroller.scrollTop;
    }
    this.schedule();
  }
  mounted() {
    const scroller = this.$refs.scroller as HTMLElement;
    this.observer = markRaw(
      new ResizeObserver(() => {
        this.height = scroller.clientHeight;
        this.gutter = scroller.offsetWidth - scroller.clientWidth;
        this.schedule();
      }),
    );
    this.observer.observe(scroller);
    this.rebuild();
  }
  beforeUnmount() {
    this.generation++;
    this.worker?.terminate();
    this.observer?.disconnect();
    cancelAnimationFrame(this.frame);
  }
  @Watch("store.graphFocus")
  focusBranch() {
    if (!this.store.graphFocus.hash) return;
    this.clearSearch();
    this.revealBranch();
  }
  revealBranch() {
    const index = this.rows.findIndex(
      (row) => row.commit.hash === this.store.graphFocus.hash,
    );
    if (index < 0) return;
    const scroller = this.$refs.scroller as HTMLElement;
    scroller.scrollTop = Math.max(
      0,
      index * this.rowHeight - this.height / 2 + this.rowHeight / 2,
    );
    this.offset = scroller.scrollTop;
    this.schedule();
  }
  private rebuildKey = "";
  // Top visible commit + offset inside its row, to keep the scroll position
  // across rebuilds of the same view (load more, refresh, new commits on top).
  private anchor(): { hash: string; delta: number } | null {
    const index = Math.floor(this.offset / this.rowHeight);
    const row = this.layout.rows[index];
    return row
      ? { hash: row.hash, delta: this.offset - index * this.rowHeight }
      : null;
  }
  private restoreAnchor(anchor: { hash: string; delta: number }) {
    const index = this.layout.rows.findIndex((r) => r.hash === anchor.hash);
    if (index < 0) return;
    const scroller = this.$refs.scroller as HTMLElement;
    scroller.scrollTop = index * this.rowHeight + anchor.delta;
    this.offset = scroller.scrollTop;
  }
  @Watch("commits")
  rebuild() {
    if (!this.$refs.scroller) return;
    const generation = ++this.generation;
    this.worker?.terminate();
    const scroller = this.$refs.scroller as HTMLElement;
    const key = `${this.store.path}\u0000${this.search}\u0000${this.store.authorFilter}`;
    // Same view: keep showing the current graph until the new layout is complete,
    // provided the anchored commit is still part of the history.
    // At the very top the view stays at the top (new commits appear above);
    // otherwise the top visible commit anchors the position.
    const atTop = this.offset < this.rowHeight;
    const candidate =
      key === this.rebuildKey && this.layout.rows.length > 0 && !atTop
        ? this.anchor()
        : null;
    const sameView =
      key === this.rebuildKey &&
      this.layout.rows.length > 0 &&
      (atTop ||
        (!!candidate && this.commits.some((c) => c.hash === candidate.hash)));
    const anchor = sameView ? candidate : null;
    this.rebuildKey = key;
    const pending: GraphLayout["rows"] = [];
    if (!sameView) {
      scroller.scrollTop = 0;
      this.offset = 0;
      this.layout = markRaw({ rows: [], lanes: 1 });
      this.building = true;
    }
    this.graphError = "";
    this.schedule();
    // Terminate superseded requests; stale large histories cannot delay a refresh or search.
    const worker = markRaw(
      new Worker(new URL("../graph/layout.worker.ts", import.meta.url), {
        type: "module",
      }),
    );
    this.worker = worker;
    worker.onmessage = (
      event: MessageEvent<{
        rows?: GraphLayout["rows"];
        lanes?: number;
        done?: boolean;
        error?: string;
      }>,
    ) => {
      if (generation !== this.generation) return;
      const { rows, lanes, done, error } = event.data;
      if (!rows) {
        this.building = false;
        this.graphError = error ?? "Graph calculation failed";
        worker.terminate();
        this.worker = null;
        return;
      }
      if (sameView) {
        // Swap only the complete layout, then restore the anchored position.
        pending.push(...rows);
        if (!done) return;
        this.layout = markRaw({ rows: pending, lanes: lanes ?? 1 });
        if (anchor) this.$nextTick(() => this.restoreAnchor(anchor));
      } else {
        // Append chunks; the first chunk already shows the top of the history.
        const previous = this.building ? [] : this.layout.rows;
        this.layout = markRaw({
          rows: previous.length ? previous.concat(rows) : rows,
          lanes: lanes ?? 1,
        });
      }
      this.building = false;
      if (done) {
        this.$nextTick(() => this.loadMoreIfNeeded());
        if (this.store.graphFocus.hash)
          this.$nextTick(() => this.revealBranch());
        worker.terminate();
        this.worker = null;
      }
      this.schedule();
    };
    worker.onerror = () => {
      if (generation !== this.generation) return;
      this.building = false;
      this.graphError = container.i18n.t("graphError");
      worker.terminate();
      this.worker = null;
    };
    // The layout needs only the topology; posting full commits doubles clone cost.
    // Filtered views keep only edges inside the result: lanes to commits that
    // are not shown would otherwise run to the bottom and swell the graph.
    const filtered = !!this.search || !!this.store.authorFilter;
    const shown = filtered ? new Set(this.commits.map((c) => c.hash)) : null;
    worker.postMessage({
      commits: this.commits.map((c) => ({
        hash: c.hash,
        parents: shown ? c.parents.filter((p) => shown.has(p)) : c.parents,
      })),
    });
  }
  @Watch("preferences")
  schedule() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const canvas = this.$refs.canvas as HTMLCanvasElement | undefined;
      if (canvas)
        this.renderer.draw(
          canvas,
          this.layout,
          this.offset,
          this.height,
          this.pointers,
          this.commitMap,
        );
    });
  }
  get pointers() {
    return new GraphPointers(this.store.snapshot);
  }
  get preferences() {
    return `${container.preferences.themeRevision}-${container.preferences.locale}`;
  }
  scroll(event: Event) {
    this.offset = (event.target as HTMLElement).scrollTop;
    this.schedule();
    this.loadMoreIfNeeded();
  }
  // Older history loads automatically when the view nears the end of the
  // loaded rows (Git Extensions loads the whole log progressively, too).
  loadMoreIfNeeded() {
    // Not while a layout is being computed: the old rows may be partly hidden.
    if (this.search || this.building || this.worker || this.store.busy) return;
    if (!this.store.hasMoreHistory) return;
    const end = this.rows.length * this.rowHeight;
    if (this.offset + this.height >= end - this.height * 2)
      void this.store.more();
  }
  navigate(event: KeyboardEvent) {
    if (
      event.target !== this.$refs.scroller ||
      !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) ||
      !this.rows.length
    )
      return;
    event.preventDefault();
    const current = this.rows.findIndex(
      (row) => row.commit.hash === this.store.selectedCommit?.hash,
    );
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? this.rows.length - 1
          : Math.max(
              0,
              Math.min(
                this.rows.length - 1,
                current + (event.key === "ArrowDown" ? 1 : -1),
              ),
            );
    const row = this.rows[index];
    if (!row) return;
    void this.store.selectCommit(row.commit);
    const scroller = this.$refs.scroller as HTMLElement,
      top = index * this.rowHeight;
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    else if (top + this.rowHeight > scroller.scrollTop + this.height)
      scroller.scrollTop = top + this.rowHeight - this.height;
  }
  menu(event: MouseEvent | KeyboardEvent, commit: Commit) {
    void this.store.selectCommit(commit);
    this.store.openRefMenu(event, {
      name: commit.subject,
      hash: commit.hash,
      kind: "commit",
      current: false,
      parents: commit.parents.length,
      refs: (this.labelMap.get(commit.hash) ?? []).filter(
        (label): label is TargetRef =>
          ["local", "remote", "tag"].includes(label.kind),
      ),
    });
  }
  refMenu(event: MouseEvent, commit: Commit, label: RefLabel) {
    if (!["local", "remote", "tag"].includes(label.kind)) {
      this.menu(event, commit);
      return;
    }
    void this.store.selectCommit(commit);
    this.store.openRefMenu(event, {
      ...label,
      kind: label.kind as TargetRef["kind"],
      hash: commit.hash,
      parents: commit.parents.length,
    });
  }
  date(value: string) {
    return compactDate(value, container.preferences.locale);
  }
  dateTitle(value: string) {
    return container.i18n.date(value);
  }
}
export default toNative(HistoryPanel);
</script>
<style lang="scss" scoped>
.history {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.history > :not(.history-viewport) {
  flex-shrink: 0;
}
.history .panel-heading input {
  max-width: 340px;
}
.filter-field {
  position: relative;
  display: flex;
  align-items: center;
  input {
    padding-right: 24px;
  }
}
.search-filter {
  flex: 0 1 340px;
  min-width: 160px;
  input {
    width: 100%;
  }
}
.clear-filter {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  border: 0;
  background: transparent;
  color: var(--color-text-secondary);
  padding: 2px 4px;
  cursor: pointer;
  .pi {
    font-size: calc(var(--font-size-base) * 10 / 13);
  }
  &:hover {
    color: var(--color-text);
  }
}
.author-filter .clear-filter {
  right: calc(var(--font-size-base) * 32 / 13);
}
.author-filter {
  flex-wrap: nowrap;
  flex: 0 1 280px;
  min-width: 180px;
  input {
    flex: 1;
    min-width: 0;
  }
  button {
    flex-shrink: 0;
  }
}
.history-header,
.commit-row {
  display: grid;
  align-items: center;
  font-size: calc(var(--font-size-base) * 13 / 13);
}
.author {
  font-weight: 400;
}
.commit-row > .avatar-cell {
  display: flex;
  justify-content: center;
  padding: 0;
  overflow: visible;
  text-overflow: clip;
}
.date {
  font-size: calc(var(--font-size-base) * 11 / 13);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary);
}
.history-header {
  height: calc(var(--font-size-base) * 34 / 13);
  color: var(--color-text-secondary);
  background: var(--color-level-200);
  span {
    padding: 0 8px;
  }
}
.history-viewport {
  flex: 1;
  min-height: 0;
  position: relative;
}
.history-scroll {
  height: 100%;
  overflow: auto;
  overscroll-behavior: contain;
}
.history-spacer {
  position: relative;
}
.history-window {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}
.commit-row {
  height: var(--history-row-height);
  border-bottom: 1px solid var(--color-border-subtle);
  box-sizing: border-box;
  &.authored {
    background: color-mix(
      in srgb,
      var(--color-accent) 7%,
      var(--color-level-200)
    );
    .author {
      font-weight: 700;
    }
  }
  &.selected {
    background: var(--color-selection);
  }
  > span {
    padding: 0 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
.hash,
.subject {
  border: 0;
  background: transparent;
  color: var(--color-text);
  text-align: left;
  padding: 0 8px;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  height: 100%;
  cursor: pointer;
}
.hash {
  font-family: var(--font-code);
  font-size: var(--font-size-code);
  color: var(--color-accent);
}
.subject {
  display: flex;
  align-items: center;
  gap: 4px;
}
.subject-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.refs {
  display: inline-flex;
  flex: 0 1 auto;
  max-width: 65%;
  min-width: 0;
  overflow: hidden;
  gap: 4px;
}
.ref-label {
  display: inline-block;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid currentColor;
  border-radius: var(--radius-sm);
  padding: 0 4px;
  font-size: calc(var(--font-size-base) * 11 / 13);
  line-height: calc(var(--font-size-base) * 17 / 13);
  font-weight: 400;
  color: var(--ref-other);
  background: color-mix(in srgb, currentColor 11%, transparent);
  &.local {
    color: var(--ref-local);
  }
  &.remote {
    color: var(--ref-remote);
  }
  &.tag {
    color: var(--ref-tag);
  }
  &.head {
    color: var(--graph-head);
  }
  /* The checked-out branch is a filled pill so it stays visible on selected rows. */
  &.current {
    font-weight: 600;
    color: var(--color-level-200);
    background: var(--ref-local);
    дborder-color: var(--ref-local);
  }
}
.commit-canvas {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
}
.graph-loading {
  position: absolute;
  top: 12px;
  left: 12px;
  color: var(--color-text-secondary);
  background: var(--color-level-100);
  padding: 4px 8px;
}
@media (max-width: 1100px) {
  .author {
    font-size: calc(var(--font-size-base) * 11 / 13);
  }
  .date {
    font-size: calc(var(--font-size-base) * 11 / 13);
  }
}
</style>

<style lang="scss" scoped>
.subject {
  font-size: calc(var(--font-size-base) * 12 / 13);
  line-height: calc(var(--font-size-base) * 14 / 13);
}
</style>

<style lang="scss" scoped>
.graph-legend {
  display: flex;
  gap: 8px;
  font-size: calc(var(--font-size-base) * 10 / 13);
  color: var(--color-text-secondary);
  span {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  i {
    display: inline-block;
    width: 10px;
    height: calc(var(--font-size-base) * 10 / 13);
  }
  .head-marker {
    border: 2px solid var(--graph-head);
    border-radius: 50%;
  }
  .branch-marker {
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 8px solid var(--ref-local);
  }
}
</style>
