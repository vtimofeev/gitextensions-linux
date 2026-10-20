<template>
  <section class="panel diff-panel" @keydown="navigateFiles">
    <Splitter
      class="diff-body"
      :class="{ 'preview-only': !showFiles }"
      state-key="gitextensions.changedFiles.split"
      state-storage="local"
      :gutter-size="6"
      :pt="{ gutterHandle: { 'aria-label': $t('resizeFiles') } }"
      @resizestart="resizeStart"
    >
      <SplitterPanel :size="25" :min-size="12" class="files-pane">
        <aside>
          <div class="panel-heading">
            <h2>{{ $t("files") }}</h2>
          </div>
          <p v-if="!store.selectedCommit" class="empty">
            {{ $t("selectCommit") }}
          </p>
          <FileTree
            :key="store.path"
            :files="store.commitFiles"
            :selected="
              store.selectedArea === 'commit' ? store.selectedFile : ''
            "
            @select="store.loadDiff($event, 'commit')"
            @menu="commitMenu"
          />
        </aside>
      </SplitterPanel>
      <SplitterPanel :size="75" :min-size="25" class="preview-pane">
        <section
          class="diff-content"
          @contextmenu.prevent.stop="
            menu($event, store.selectedFile, store.selectedArea)
          "
        >
          <div class="panel-heading">
            <Button
              :label="$t('diff')"
              text
              size="small"
              :class="{ 'active-view': !imageFile || !viewImage }"
              :aria-pressed="!imageFile || !viewImage"
              @click="viewImage = false"
            />
            <Button
              v-if="imageFile"
              :label="$t('image')"
              :aria-pressed="viewImage"
              text
              size="small"
              @click="viewImage = true"
            /><Button
              v-if="store.selectedFile"
              :label="$t('wholeFile')"
              text
              size="small"
              @click="inspectSelected('file')"
            /><Button
              v-if="store.selectedFile"
              :label="$t('fileHistory')"
              text
              size="small"
              @click="inspectSelected('history')"
            /><Button
              v-if="store.selectedFile"
              :label="$t('blame')"
              text
              size="small"
              @click="inspectSelected('blame')"
            />
            <div v-if="store.selectedFile" class="file-navigation">
              <Button
                icon="pi pi-angle-up"
                text
                size="small"
                :aria-label="$t('previousFile')"
                :title="$t('previousFile') + ' (Alt+PageUp)'"
                aria-keyshortcuts="Alt+PageUp"
                :disabled="store.busy || !fileNavigation.previous"
                @click="goFile(-1)"
              />
              <Button
                icon="pi pi-angle-down"
                text
                size="small"
                :aria-label="$t('nextFile')"
                :title="$t('nextFile') + ' (Alt+PageDown)'"
                aria-keyshortcuts="Alt+PageDown"
                :disabled="store.busy || !fileNavigation.next"
                @click="goFile(1)"
              />
            </div>
            <span class="muted filename" :title="store.selectedFile">{{
              store.selectedFile
            }}</span>
          </div>
          <div v-if="selectedConflict" class="empty">
            <p>{{ $t("fileHasConflict") }}</p>
            <Button
              :label="$t('resolveConflict')"
              :disabled="store.busy"
              @click="store.openConflict(store.selectedFile)"
            />
          </div>
          <p v-else-if="!store.selectedFile" class="empty">
            {{ $t("selectFile") }}
          </p>
          <template v-else-if="imageFile && viewImage">
            <p
              v-if="store.diffLoading || imageLoading"
              class="empty"
              role="status"
            >
              {{ $t("loading") }}
            </p>
            <p v-else-if="imageError" class="empty">
              {{ $t("previewFailed") }}
            </p>
            <FilePreview
              v-else-if="content"
              :content="content"
              :file-name="store.selectedFile"
            />
            <p v-else class="empty">{{ $t("previewFailed") }}</p>
          </template>
          <template v-else>
            <p v-if="store.diffLoading" class="empty" role="status">
              {{ $t("diffLoading") }}
            </p>
            <DiffViewer
              v-show="!store.diffLoading"
              :value="store.diffLoading ? '' : store.diff"
              :file-name="store.selectedFile"
              :plain="store.selectedArea === 'untracked'"
            />
          </template>
        </section>
      </SplitterPanel>
    </Splitter>
    <CommitDetails
      v-if="
        store.selectedCommit &&
        (store.selectedArea === 'commit' || !store.selectedFile)
      "
    />
  </section>
  <ErrorNotification :message="imageError" @dismiss="imageError = ''" />
  <Teleport to="body"
    ><div
      v-if="context"
      class="ref-menu diff-file-menu"
      role="menu"
      :aria-label="$t('fileActions')"
      :style="{ left: context.x + 'px', top: context.y + 'px' }"
    >
      <button role="menuitem" @click="inspect('file')">
        {{ $t("wholeFile") }}</button
      ><button role="menuitem" @click="inspect('history')">
        {{ $t("fileHistory") }}</button
      ><button role="menuitem" @click="inspect('blame')">
        {{ $t("blame") }}
      </button>
      <button role="menuitem" @click="externalDiff">
        {{ $t("viewExternalDiff") }}
      </button>
    </div></Teleport
  >
</template>
<script lang="ts">
import { Component, Vue, Watch, toNative } from "vue-facing-decorator";
import Button from "primevue/button";
import Splitter from "primevue/splitter";
import SplitterPanel from "primevue/splitterpanel";
import FileTree from "./FileTree.vue";
import CommitDetails from "./CommitDetails.vue";
import DiffViewer from "./DiffViewer.vue";
import { defineAsyncComponent } from "vue";
import ErrorNotification from "./ErrorNotification.vue";
import { isImageFile } from "../domain/image";
import { buildFileTree, fileTreeRows } from "../domain/file-tree";
import type { DiffArea, FileContent } from "../domain/models";
import { container } from "../store/container";
const FilePreview = defineAsyncComponent(() => import("./FilePreview.vue"));
@Component({
  components: {
    DiffViewer,
    Splitter,
    SplitterPanel,
    FileTree,
    FilePreview,
    ErrorNotification,
    Button,
    CommitDetails,
  },
})
class DiffPanel extends Vue {
  get navigationFiles() {
    if (this.store.selectedArea === "commit")
      return fileTreeRows(buildFileTree(this.store.commitFiles), new Set())
        .filter((row) => !row.directory)
        .map((row) => row.path);
    return this.store
      .filesIn(this.store.selectedArea === "staged" ? "staged" : "unstaged")
      .map((file) => file.path);
  }
  get fileNavigation() {
    const files = this.navigationFiles;
    const index = files.indexOf(this.store.selectedFile);
    return {
      previous: index > 0 ? files[index - 1] : undefined,
      next: index >= 0 ? files[index + 1] : undefined,
    };
  }
  goFile(direction: number) {
    if (this.store.busy) return;
    const file =
      direction < 0 ? this.fileNavigation.previous : this.fileNavigation.next;
    if (!file) return;
    const area =
      this.store.selectedArea === "commit"
        ? "commit"
        : this.store.selectedArea === "staged"
          ? "staged"
          : "unstaged";
    if (area !== "commit") this.store.selectFile(file, area);
    const diffArea =
      area === "unstaged" && this.store.fileStatus(file)?.untracked
        ? "untracked"
        : area;
    void this.store.loadDiff(file, diffArea);
  }
  navigateFiles(event: KeyboardEvent) {
    if (
      !event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      !["PageUp", "PageDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    this.goFile(event.key === "PageUp" ? -1 : 1);
  }
  get showFiles() {
    return this.store.selectedArea === "commit" || !this.store.selectedFile;
  }
  resizeStart(event: { originalEvent: Event }) {
    event.originalEvent?.preventDefault();
    window.getSelection()?.removeAllRanges();
  }
  commitMenu(event: MouseEvent | KeyboardEvent, file: string) {
    this.menu(event, file, "commit");
  }
  content: FileContent | null = null;
  viewImage = true;
  imageLoading = false;
  imageError = "";
  private imageGeneration = 0;
  get imageFile() {
    return isImageFile(this.store.selectedFile);
  }
  get imageKey() {
    return JSON.stringify([
      this.store.path,
      this.store.selectedFile,
      this.store.selectedArea,
      this.store.selectedCommit?.hash,
      this.store.diffLoading,
    ]);
  }
  @Watch("imageKey", { immediate: true })
  async loadImage() {
    const token = ++this.imageGeneration;
    this.content = null;
    this.imageError = "";
    this.imageLoading = false;
    this.viewImage = true;
    if (!this.imageFile || this.store.diffLoading || this.selectedConflict)
      return;
    this.imageLoading = true;
    try {
      const content = await container.api.fileContent(
        this.store.path,
        this.store.selectedFile,
        this.store.selectedArea,
        this.store.selectedCommit?.hash ?? "HEAD",
      );
      if (token === this.imageGeneration) this.content = content;
    } catch (e) {
      if (token === this.imageGeneration) this.imageError = String(e);
    } finally {
      if (token === this.imageGeneration) this.imageLoading = false;
    }
  }
  context: { file: string; area: DiffArea; x: number; y: number } | null = null;
  mounted() {
    document.addEventListener("click", this.dismiss);
    document.addEventListener("keydown", this.dismissKey);
  }
  beforeUnmount() {
    ++this.imageGeneration;
    document.removeEventListener("click", this.dismiss);
    document.removeEventListener("keydown", this.dismissKey);
  }
  dismiss() {
    this.context = null;
  }
  dismissKey(event: KeyboardEvent) {
    if (event.key === "Escape") this.dismiss();
  }
  menu(event: MouseEvent | KeyboardEvent, file: string, area: DiffArea) {
    if (!file || this.store.busy) return;
    this.store.refMenu = null;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.context = {
      file,
      area,
      x: Math.min(
        event instanceof MouseEvent ? event.clientX : rect.left,
        window.innerWidth - 300,
      ),
      y: Math.min(
        event instanceof MouseEvent ? event.clientY : rect.bottom,
        window.innerHeight - 150,
      ),
    };
  }
  inspectSelected(mode: "file" | "history" | "blame") {
    this.store.inspectFile(
      this.store.selectedFile,
      this.store.selectedArea,
      mode,
    );
  }
  inspect(mode: "file" | "history" | "blame") {
    const target = this.context;
    this.context = null;
    if (target) this.store.inspectFile(target.file, target.area, mode);
  }
  externalDiff() {
    const target = this.context;
    this.context = null;
    if (!target) return;
    if (
      target.area !== "commit" &&
      this.store.fileStatus(target.file)?.conflict
    )
      this.store.openConflict(target.file);
    else this.store.openDiffTool(target.file, target.area);
  }
  get selectedConflict() {
    return (
      this.store.selectedArea !== "commit" &&
      this.store.fileStatus(this.store.selectedFile)?.conflict
    );
  }
  get store() {
    return container.repository;
  }
}
export default toNative(DiffPanel);
</script>
<style lang="scss" scoped>
.diff-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}
.diff-body {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
  aside {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  &.preview-only > :deep(.files-pane),
  &.preview-only > :deep(.p-splitter-gutter) {
    display: none;
  }
  &.preview-only > :deep(.preview-pane) {
    flex: 1 1 0 !important;
  }
}
.diff-content {
  height: 100%;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
  > .panel-heading {
    flex-shrink: 0;
  }
}
.filename {
  margin-left: auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

<style lang="scss" scoped>
.diff-content > .panel-heading {
  display: flex;
  flex-wrap: nowrap;
  gap: 2px;
}
.diff-content > .panel-heading > :deep(.p-button) {
  flex: 0 0 auto;
}
.active-view {
  background: var(--color-selection);
}
</style>

<style lang="scss" scoped>
.file-navigation {
  display: flex;
  flex: 0 0 auto;
  gap: 0;
}
.file-navigation > :deep(.p-button) {
  width: calc(var(--font-size-base) * 24 / 13);
  height: calc(var(--font-size-base) * 24 / 13);
}
</style>
