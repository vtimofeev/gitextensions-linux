<template>
  <Dialog
    :visible="!!target"
    modal
    :header="title"
    :style="{ width: '1200px', maxWidth: '96vw' }"
    @update:visible="close"
  >
    <div v-if="target" class="inspection" @keydown="changeKey">
      <div class="actions">
        <Button
          :label="$t('wholeFile')"
          :severity="mode === 'file' ? 'primary' : 'secondary'"
          @click="switchMode('file')"
        />
        <Button
          :label="$t('fileHistory')"
          :severity="mode === 'history' ? 'primary' : 'secondary'"
          @click="switchMode('history')"
        />
        <Button
          :label="$t('blame')"
          :severity="mode === 'blame' ? 'primary' : 'secondary'"
          @click="switchMode('blame')"
        />
        <code
          >{{ file }} ·
          {{
            mode === "file" && !historical && target.area !== "commit"
              ? target.area
              : revision.slice(0, 12)
          }}</code
        >
      </div>
      <Splitter
        v-if="mode === 'history'"
        class="history-split"
        layout="vertical"
        state-key="gitextensions.fileHistory.split"
        state-storage="local"
      >
        <SplitterPanel :size="35" :min-size="15">
          <div
            class="file-history"
            ref="historyList"
            role="listbox"
            :aria-label="$t('fileHistory')"
            tabindex="0"
            @keydown="historyKey"
          >
            <div
              v-for="(entry, index) in history"
              :key="entry.commit.hash"
              class="history-entry"
              :class="{ selected: chosen === entry.commit.hash }"
              role="option"
              :aria-selected="chosen === entry.commit.hash"
            >
              <button class="revision-button" @click="choose(entry)">
                <code>{{ entry.commit.hash.slice(0, 8) }}</code>
                <span class="subject">{{ entry.commit.subject }}</span>
                <span
                  class="revision-author"
                  :style="{
                    color: authorColor(
                      entry.commit.authorEmail || entry.commit.author,
                    ),
                  }"
                  ><AuthorAvatar
                    :name="entry.commit.author"
                    :email="entry.commit.authorEmail"
                  />
                  {{ entry.commit.author }}</span
                >
                <time
                  :datetime="entry.commit.date"
                  :title="fullDate(entry.commit.date)"
                  >{{ shortDate(entry.commit.date) }}</time
                >
                <span
                  class="revision-path"
                  :title="
                    renamedFrom(index)
                      ? $t('renamedFrom', { path: renamedFrom(index) })
                      : entry.file
                  "
                  >{{
                    renamedFrom(index)
                      ? `${renamedFrom(index)} → ${entry.file}`
                      : entry.file
                  }}</span
                >
              </button>
              <Button
                :label="$t('viewCommit')"
                text
                size="small"
                @click="commit(entry.commit.hash)"
              />
            </div>
            <p v-if="historyLoading" role="status">{{ $t("loading") }}</p>
            <p v-else-if="!history.length">{{ $t("noFileHistory") }}</p>
          </div>
        </SplitterPanel>
        <SplitterPanel :size="65" :min-size="20">
          <div class="history-details">
            <div
              class="history-tabs"
              role="tablist"
              :aria-label="$t('fileHistory')"
            >
              <Button
                v-for="tab in tabs"
                :key="tab.value"
                :label="$t(tab.label)"
                role="tab"
                :aria-selected="historyTab === tab.value"
                :severity="historyTab === tab.value ? 'primary' : 'secondary'"
                @click="selectTab(tab.value)"
              />
            </div>
            <div
              class="history-content"
              role="tabpanel"
              :aria-label="$t(activeLabel)"
            >
              <p v-if="loading" role="status">{{ $t("loading") }}</p>
              <p v-else-if="error" class="muted">{{ $t("previewFailed") }}</p>
              <FilePreview
                v-else-if="content"
                :content="content"
                :file-name="file"
              />
              <p v-else-if="binary">{{ $t("binaryFile") }}</p>
              <template v-else-if="chosen">
                <CodeViewer
                  v-if="historyTab === 'blame'"
                  :blame="blame"
                  :file-name="file"
                  @commit="blameCommit"
                />
                <CodeViewer
                  v-else-if="historyTab === 'whole'"
                  ref="historyCode"
                  :text="wholePreview.text"
                  :changes="wholePreview.changes"
                  :file-name="file"
                />
                <DiffViewer
                  ref="historyDiff"
                  v-else
                  :key="chosen + historyTab"
                  :value="text"
                  :empty-message="$t('noRevisionChanges')"
                  :file-name="file"
                />
              </template>
            </div>
          </div>
        </SplitterPanel>
      </Splitter>
      <template v-else>
        <p v-if="mode === 'blame'" class="muted">{{ $t("blameHint") }}</p>
        <p v-if="loading" role="status">{{ $t("loading") }}</p>
        <p v-else-if="error" class="muted">{{ $t("previewFailed") }}</p>
        <FilePreview v-else-if="content" :content="content" :file-name="file" />
        <p v-else-if="binary">{{ $t("binaryFile") }}</p>
        <CodeViewer
          v-else
          :text="text"
          :blame="blame"
          :file-name="file"
          @commit="commit"
        />
      </template>
    </div>
    <ErrorNotification :message="error" @dismiss="error = ''" />
  </Dialog>
</template>
<script lang="ts">
import ErrorNotification from "./ErrorNotification.vue";
import { Component, Vue, Watch, toNative } from "vue-facing-decorator";
import { markRaw, nextTick } from "vue";
import Dialog from "primevue/dialog";
import Button from "primevue/button";
import Splitter from "primevue/splitter";
import SplitterPanel from "primevue/splitterpanel";
import CodeViewer from "./CodeViewer.vue";
import DiffViewer from "./DiffViewer.vue";
import FilePreview from "./FilePreview.vue";
import { isImageFile } from "../domain/image";
import AuthorAvatar from "./AuthorAvatar.vue";
import { authorColor } from "../domain/author-color";
import { WholeFileDocument } from "../diff/document";
import { wholeFileChanges } from "../domain/code-changes";
import { compactDate } from "../domain/blame";
import { container } from "../store/container";
import type { FileRevision, BlameLine, FileContent } from "../domain/models";
type HistoryTab = "diff" | "blame" | "whole";
type Preview = {
  text: string;
  blame: BlameLine[];
  binary: boolean;
  content?: FileContent | null;
};
@Component({
  components: {
    ErrorNotification,
    Dialog,
    Button,
    Splitter,
    SplitterPanel,
    CodeViewer,
    AuthorAvatar,
    DiffViewer,
    FilePreview,
  },
})
class FileInspection extends Vue {
  authorColor = authorColor;
  mode: "file" | "history" | "blame" = "file";
  file = "";
  revision = "HEAD";
  historical = false;
  loading = false;
  historyLoading = false;
  error = "";
  text = "";
  binary = false;
  content: FileContent | null = null;
  history: FileRevision[] = [];
  blame: BlameLine[] = [];
  chosen = "";
  historyTab: HistoryTab = "diff";
  tabs = [
    { value: "diff" as const, label: "diff" as const },
    { value: "blame" as const, label: "blame" as const },
    { value: "whole" as const, label: "wholeFileChanges" as const },
  ];
  private generation = 0;
  private historyGeneration = 0;
  private cache = markRaw(new Map<string, Promise<Preview>>());
  get store() {
    return container.repository;
  }
  get target() {
    return this.store.fileInspection;
  }
  get wholePreview() {
    return wholeFileChanges(new WholeFileDocument(this.text).rows);
  }
  get activeLabel() {
    return this.tabs.find((tab) => tab.value === this.historyTab)!.label;
  }
  get title() {
    return container.i18n.t(
      this.mode === "file"
        ? "wholeFile"
        : this.mode === "history"
          ? "fileHistory"
          : "blame",
    );
  }
  // immediate: the dialog loads lazily, so it may mount with a target already set.
  @Watch("store.fileInspection", { immediate: true })
  async changed() {
    ++this.generation;
    ++this.historyGeneration;
    this.cache.clear();
    const target = this.target;
    if (!target) return;
    this.mode = target.mode;
    this.file = target.file;
    this.revision = target.revision;
    this.historical = false;
    this.chosen = "";
    this.history = [];
    const saved = localStorage.getItem("gitextensions.fileHistory.tab");
    this.historyTab = saved === "blame" || saved === "whole" ? saved : "diff";
    await this.load();
  }
  close() {
    ++this.generation;
    ++this.historyGeneration;
    this.cache.clear();
    this.store.fileInspection = null;
  }
  renamedFrom(index: number) {
    const entry = this.history[index]!;
    const previous = this.history[index + 1];
    return (
      entry.originalPath ||
      (previous && previous.file !== entry.file ? previous.file : "")
    );
  }
  async choose(entry: FileRevision) {
    this.file = entry.file;
    this.revision = entry.commit.hash;
    this.historical = true;
    this.chosen = entry.commit.hash;
    await this.loadPreview();
  }
  async selectTab(tab: HistoryTab) {
    this.historyTab = tab;
    localStorage.setItem("gitextensions.fileHistory.tab", tab);
    await this.loadPreview();
  }
  async historyKey(event: KeyboardEvent) {
    if (event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const index = this.history.findIndex(
      (entry) => entry.commit.hash === this.chosen,
    );
    const entry =
      this.history[
        Math.max(
          0,
          Math.min(
            this.history.length - 1,
            index + (event.key === "ArrowDown" ? 1 : -1),
          ),
        )
      ];
    if (entry) {
      void this.choose(entry);
      await nextTick();
      (this.$refs.historyList as HTMLElement)
        .querySelector(".history-entry.selected")
        ?.scrollIntoView({ block: "nearest" });
    }
  }
  changeKey(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    if (
      this.mode === "history" &&
      this.historyTab === "whole" &&
      event.altKey &&
      ["ArrowUp", "ArrowDown"].includes(event.key)
    ) {
      event.preventDefault();
      (
        this.$refs.historyCode as { jump(direction: number): void } | undefined
      )?.jump(event.key === "ArrowDown" ? 1 : -1);
    }
  }
  async blameCommit(hash: string) {
    const entry = this.history.find((entry) => entry.commit.hash === hash);
    if (entry) await this.choose(entry);
    else await this.commit(hash);
  }
  async switchMode(mode: "file" | "history" | "blame") {
    ++this.generation;
    ++this.historyGeneration;
    this.mode = mode;
    await this.load();
  }
  async loadPreview() {
    if (!this.target || !this.chosen) return;
    const token = ++this.generation;
    const path = this.store.path,
      file = this.file,
      revision = this.revision,
      tab = this.historyTab;
    const key = JSON.stringify([path, file, revision, tab, this.blameOptions]);
    this.loading = true;
    this.error = "";
    this.text = "";
    this.blame = [];
    this.binary = false;
    this.content = null;
    let request = this.cache.get(key);
    if (!request) {
      request = (async (): Promise<Preview> => {
        if (tab === "blame")
          return {
            text: "",
            blame: await container.api.blame(
              path,
              file,
              revision,
              this.blameOptions,
            ),
            binary: false,
          };
        if (tab === "whole" && isImageFile(file)) {
          const content = await container.api.fileContent(
            path,
            file,
            "commit",
            revision,
          );
          return {
            text: content.text,
            blame: [],
            binary: content.binary,
            content,
          };
        }
        const text = await container.api.fileDiff(
          path,
          file,
          revision,
          tab === "whole",
        );
        if (isImageFile(file) && text === "Binary file") {
          const content = await container.api.fileContent(
            path,
            file,
            "commit",
            revision,
          );
          return { text, blame: [], binary: content.binary, content };
        }
        return { text, blame: [], binary: text === "Binary file" };
      })();
      this.cache.set(key, request);
    }
    try {
      const result = await request;
      if (token === this.generation && path === this.store.path)
        Object.assign(this, result);
    } catch (e) {
      if (this.cache.get(key) === request) this.cache.delete(key);
      if (token === this.generation) this.error = String(e);
    } finally {
      if (token === this.generation) this.loading = false;
    }
  }
  async load() {
    const target = this.target;
    if (!target) return;
    if (this.mode === "history" && this.history.length) {
      await this.choose(
        this.history.find((entry) => entry.commit.hash === this.chosen) ??
          this.history[0]!,
      );
      return;
    }
    const token = ++this.generation;
    const historyToken = ++this.historyGeneration;
    const path = this.store.path,
      mode = this.mode;
    this.loading = true;
    this.historyLoading = mode === "history";
    this.error = "";
    this.text = "";
    this.binary = false;
    this.content = null;
    this.blame = [];
    try {
      if (mode === "history") {
        const value = await container.api.fileHistory(
          path,
          this.file,
          this.revision,
        );
        if (historyToken !== this.historyGeneration || path !== this.store.path)
          return;
        this.history = value;
        this.loading = false;
        this.historyLoading = false;
        if (value[0]) await this.choose(value[0]);
      } else if (mode === "blame") {
        const value = await container.api.blame(
          path,
          this.file,
          this.revision,
          this.blameOptions,
        );
        if (token === this.generation) this.blame = value;
      } else {
        const value = await container.api.fileContent(
          path,
          this.file,
          this.historical ? "commit" : target.area,
          this.revision,
        );
        if (token === this.generation) {
          this.text = value.text;
          this.binary = value.binary;
          this.content = value;
        }
      }
    } catch (e) {
      if (token === this.generation) this.error = String(e);
    } finally {
      if (token === this.generation && path === this.store.path)
        this.loading = false;
      if (historyToken === this.historyGeneration) this.historyLoading = false;
    }
  }
  get blameOptions() {
    const p = container.preferences.blame;
    return {
      ignoreWhitespace: p.ignoreWhitespace,
      detectCopiesInFile: p.detectCopiesInFile,
      detectCopiesInAllFiles: p.detectCopiesInAllFiles,
    };
  }
  @Watch("blameOptions")
  blameOptionsChanged() {
    this.cache.clear();
    if (
      this.target &&
      (this.mode === "blame" ||
        (this.mode === "history" && this.historyTab === "blame"))
    )
      void (this.mode === "history" ? this.loadPreview() : this.load());
  }
  // Same compact date + time as the commit graph; full date in the tooltip.
  shortDate(value: string) {
    return compactDate(value, container.preferences.locale);
  }
  fullDate(value: string) {
    return container.i18n.date(value);
  }
  async commit(hash: string) {
    this.close();
    await this.store.focusBranch(hash);
  }
}
export default toNative(FileInspection);
</script>
<style lang="scss" scoped>
.inspection {
  height: 70vh;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.actions {
  flex-wrap: wrap;
  code {
    overflow-wrap: anywhere;
  }
}
.history-split {
  flex: 1;
  min-height: 0;
}
:deep(.p-splitterpanel) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.file-history {
  overflow: auto;
  flex: 1;
  width: 100%;
  min-height: 0;
}
.history-entry {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--color-border);
  &.selected {
    background: var(--color-selection);
    box-shadow: inset 3px 0 var(--color-accent);
  }
}
.revision-author {
  display: flex;
  align-items: center;
  gap: 6px;
}
.revision-button {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: 9ch minmax(120px, 2fr) minmax(80px, 1fr) 20ch minmax(
      100px,
      1fr
    );
  gap: 8px;
  text-align: left;
  background: transparent;
  color: var(--color-text);
  border: 0;
  padding: 6px;
  font-size: var(--text-sm);
  span,
  time {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  time,
  .revision-path {
    color: var(--color-text-secondary);
  }
}
.history-details,
.history-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  width: 100%;
}
.history-tabs {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  padding: 6px;
  border-bottom: 1px solid var(--color-border);
}
</style>
