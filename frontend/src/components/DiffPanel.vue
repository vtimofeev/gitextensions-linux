<template>
  <section class="panel diff-panel">
    <div class="diff-body">
      <aside v-if="store.selectedArea === 'commit' || !store.selectedFile">
        <div class="panel-heading">
          <h2>{{ $t("files") }}</h2>
        </div>
        <p v-if="!store.selectedCommit" class="empty">
          {{ $t("selectCommit") }}
        </p>
        <div
          v-for="file in store.commitFiles"
          :key="file"
          class="file-row"
          @contextmenu.prevent.stop="menu($event, file, 'commit')"
          @keydown.shift.f10.prevent.stop="menu($event, file, 'commit')"
          :class="{
            selected:
              store.selectedFile === file && store.selectedArea === 'commit',
          }"
        >
          <button
            class="file-button"
            :title="file"
            @click="store.loadDiff(file, 'commit')"
          >
            {{ file }}
          </button>
        </div>
      </aside>
      <section
        class="diff-content"
        @contextmenu.prevent.stop="
          menu($event, store.selectedFile, store.selectedArea)
        "
      >
        <div class="panel-heading">
          <h2>{{ $t("diff") }}</h2>
          <span class="muted filename">{{ store.selectedFile }}</span
          ><Button
            v-if="imageFile"
            :label="$t(viewImage ? 'diff' : 'image')"
            text
            size="small"
            @click="viewImage = !viewImage"
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
          <p v-else-if="imageError" class="empty">{{ $t("previewFailed") }}</p>
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
    </div>
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
import CommitDetails from "./CommitDetails.vue";
import DiffViewer from "./DiffViewer.vue";
import { defineAsyncComponent } from "vue";
import ErrorNotification from "./ErrorNotification.vue";
import { isImageFile } from "../domain/image";
import type { DiffArea, FileContent } from "../domain/models";
import { container } from "../store/container";
const FilePreview = defineAsyncComponent(() => import("./FilePreview.vue"));
@Component({
  components: {
    DiffViewer,
    FilePreview,
    ErrorNotification,
    Button,
    CommitDetails,
  },
})
class DiffPanel extends Vue {
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
  > aside {
    flex: 0 0 230px;
    border-right: 1px solid var(--color-border);
    overflow: auto;
  }
}
.diff-content {
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
