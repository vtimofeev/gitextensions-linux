<template>
  <div
    ref="viewport"
    class="file-tree"
    role="tree"
    :aria-label="$t('files')"
    tabindex="0"
    @scroll="scroll"
    @keydown="navigate"
  >
    <div
      class="tree-spacer"
      :style="{ height: rows.length * rowHeight + 'px' }"
    >
      <div
        class="tree-window"
        :style="{ transform: `translateY(${start * rowHeight}px)` }"
      >
        <div
          v-for="(row, index) in visibleRows"
          :key="(row.directory ? 'dir:' : 'file:') + row.path"
          class="file-row tree-row"
          :class="{ selected: !row.directory && row.path === selected }"
          :data-index="start + index"
          :style="{
            height: rowHeight + 'px',
            paddingLeft: 6 + row.depth * 12 + 'px',
          }"
          role="treeitem"
          :aria-level="row.depth + 1"
          :aria-selected="!row.directory && row.path === selected"
          :aria-expanded="row.directory ? !collapsed.has(row.path) : undefined"
          @contextmenu.prevent.stop="
            !row.directory && $emit('menu', $event, row.path)
          "
          @keydown.shift.f10.prevent.stop="
            !row.directory && $emit('menu', $event, row.path)
          "
        >
          <button
            class="file-button tree-button"
            :class="{ directory: row.directory }"
            :title="row.path"
            @click="activate(row)"
          >
            <i
              :class="[
                'pi',
                row.directory
                  ? collapsed.has(row.path)
                    ? 'pi-chevron-right'
                    : 'pi-chevron-down'
                  : 'tree-leaf',
              ]"
              aria-hidden="true"
            />
            <i
              class="file-type-icon pi"
              :class="
                row.directory
                  ? collapsed.has(row.path)
                    ? 'pi-folder'
                    : 'pi-folder-open'
                  : typeIcon(row.path)
              "
              aria-hidden="true"
            />
            <span v-if="row.directory" class="folder-label">
              <span v-if="row.name.includes('/')" class="folder-prefix">{{
                row.name.slice(0, row.name.lastIndexOf("/"))
              }}</span>
              <span v-if="row.name.includes('/')" class="folder-separator"
                >/</span
              >
              <span class="folder-leaf">{{
                row.name.slice(row.name.lastIndexOf("/") + 1)
              }}</span>
            </span>
            <span v-else>{{ row.name }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import { Component, Vue, Prop, Watch, toNative } from "vue-facing-decorator";
import { markRaw, nextTick } from "vue";
import {
  buildFileTree,
  fileTreeRows,
  type FileTreeRow,
} from "../domain/file-tree";
import { fileTypeIcon } from "../domain/file-icons";
import { container } from "../store/container";
@Component({ emits: ["select", "menu"] })
class FileTree extends Vue {
  @Prop({ default: () => [] }) readonly files!: string[];
  @Prop({ default: "" }) readonly selected!: string;
  collapsed = new Set<string>();
  typeIcon = fileTypeIcon;
  offset = 0;
  height = 300;
  private observer: ResizeObserver | null = null;
  private navigation = 0;
  get rowHeight() {
    return Math.round((container.preferences.fontSize * 22) / 13);
  }
  get tree() {
    return markRaw(buildFileTree(this.files));
  }
  get rows() {
    return markRaw(fileTreeRows(this.tree, this.collapsed));
  }
  get allRows() {
    return markRaw(fileTreeRows(this.tree, new Set()));
  }
  get start() {
    return Math.max(
      0,
      Math.min(
        this.rows.length - Math.ceil(this.height / this.rowHeight),
        Math.floor(this.offset / this.rowHeight),
      ) - 4,
    );
  }
  get visibleRows() {
    return this.rows.slice(
      this.start,
      this.start + Math.ceil(this.height / this.rowHeight) + 9,
    );
  }
  activate(row: FileTreeRow) {
    if (!row.directory) {
      this.$emit("select", row.path);
      return;
    }
    const next = new Set(this.collapsed);
    if (next.has(row.path)) next.delete(row.path);
    else next.add(row.path);
    this.collapsed = next;
  }
  scroll(event: Event) {
    this.offset = (event.target as HTMLElement).scrollTop;
  }
  async focusRow(index: number, navigation = this.navigation) {
    const viewport = this.$refs.viewport as HTMLElement | undefined;
    if (!viewport) return;
    const top = index * this.rowHeight;
    if (top < viewport.scrollTop) viewport.scrollTop = top;
    else if (top + this.rowHeight > viewport.scrollTop + viewport.clientHeight)
      viewport.scrollTop = top + this.rowHeight - viewport.clientHeight;
    this.offset = viewport.scrollTop;
    await nextTick();
    if (navigation !== this.navigation) return;
    viewport
      .querySelector<HTMLButtonElement>(`[data-index="${index}"] button`)
      ?.focus({ preventScroll: true });
  }
  expandFile(path: string) {
    const expanded = new Set(this.collapsed);
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++)
      expanded.delete(parts.slice(0, i).join("/"));
    if (expanded.size !== this.collapsed.size) this.collapsed = expanded;
  }
  async openFile(row: FileTreeRow, navigation: number) {
    this.expandFile(row.path);
    if (row.path !== this.selected) this.$emit("select", row.path);
    await nextTick();
    if (navigation !== this.navigation) return;
    const index = this.rows.findIndex(
      (item) => !item.directory && item.path === row.path,
    );
    if (index >= 0) await this.focusRow(index, navigation);
  }
  async navigate(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (
      ![
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const navigation = ++this.navigation;
    const element = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-index]",
    );
    let index = element ? Number(element.dataset.index) : -1;
    const row = this.rows[index];
    if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      const direction = event.key === "ArrowUp" || event.key === "End" ? -1 : 1;
      const current =
        row ??
        this.allRows.find(
          (item) => !item.directory && item.path === this.selected,
        );
      let position = current
        ? this.allRows.findIndex(
            (item) =>
              item.directory === current.directory &&
              item.path === current.path,
          )
        : -1;
      if (event.key === "Home") position = -1;
      else if (event.key === "End" || (position < 0 && direction < 0))
        position = this.allRows.length;
      for (
        position += direction;
        position >= 0 && position < this.allRows.length;
        position += direction
      ) {
        const target = this.allRows[position]!;
        if (!target.directory) {
          await this.openFile(target, navigation);
          return;
        }
      }
      return;
    }
    if (event.key === "ArrowLeft" && row) {
      if (row.directory && !this.collapsed.has(row.path)) this.activate(row);
      else if (row.depth > 0) {
        // The logical parent may be inside a compacted chain; use visible depth.
        for (let parent = index - 1; parent >= 0; parent--) {
          if (this.rows[parent]!.depth < row.depth) {
            index = parent;
            break;
          }
        }
      }
    } else if (event.key === "ArrowRight" && row?.directory) {
      if (this.collapsed.has(row.path)) this.activate(row);
      else index++;
    }
    if (this.rows.length) {
      index = Math.max(0, Math.min(index, this.rows.length - 1));
      const target = this.rows[index]!;
      if (!target.directory) await this.openFile(target, navigation);
      else await this.focusRow(index, navigation);
    }
  }
  @Watch("files")
  reset() {
    ++this.navigation;
    this.collapsed = new Set();
    this.offset = 0;
    const viewport = this.$refs.viewport as HTMLElement | undefined;
    if (viewport) viewport.scrollTop = 0;
    void this.revealSelected();
  }
  @Watch("selected", { immediate: true })
  async revealSelected() {
    const selected = this.selected;
    if (!selected) return;
    this.expandFile(selected);
    await nextTick();
    const viewport = this.$refs.viewport as HTMLElement | undefined;
    if (!viewport || this.selected !== selected) return;
    const index = this.rows.findIndex(
      (row) => !row.directory && row.path === selected,
    );
    if (index < 0) return;
    const top = index * this.rowHeight;
    if (top < viewport.scrollTop) viewport.scrollTop = top;
    else if (top + this.rowHeight > viewport.scrollTop + viewport.clientHeight)
      viewport.scrollTop = top + this.rowHeight - viewport.clientHeight;
    this.offset = viewport.scrollTop;
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
    ++this.navigation;
    this.observer?.disconnect();
  }
}
export default toNative(FileTree);
</script>
<style lang="scss" scoped>
.file-tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.tree-spacer {
  position: relative;
}
.tree-window {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}
.tree-row {
  box-sizing: border-box;
  min-height: 0;
  border-bottom: 0;
  padding-top: 0;
  padding-bottom: 0;
}
.tree-button {
  display: flex;
  gap: 3px;
  align-items: center;
  height: 100%;
  font-family: var(--font-sans);
  font-size: calc(var(--font-size-base) * 11 / 13);
  color: rgb(255 255 255 / 85%);
  padding-top: 0;
  padding-bottom: 0;
}
.tree-button.directory {
  color: var(--color-text-secondary);
}
.tree-button > .file-type-icon {
  flex-basis: 13px;
  font-size: inherit;
  color: inherit;
}
.tree-button > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tree-button > .pi:first-child {
  flex: 0 0 10px;
  font-size: 9px;
}
.tree-leaf {
  visibility: hidden;
}
</style>

<style lang="scss" scoped>
.folder-label {
  display: inline-flex;
  min-width: 0;
}
.folder-prefix {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.folder-separator {
  flex: 0 0 auto;
}
.folder-leaf {
  flex: 0 0 auto;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
