<template>
  <section class="panel changes">
    <div class="change-columns">
      <section v-for="area in areas" :key="area.key">
        <div class="panel-heading">
          <h2>
            {{ $t(area.key) }}
            <span class="muted">{{ area.files.length }}</span>
          </h2>
          <Button
            :label="$t(area.key === 'staged' ? 'unstageAll' : 'stageAll')"
            text
            size="small"
            :disabled="store.busy || !area.files.length"
            @click="area.key === 'staged' ? store.unstage() : store.stage()"
          />
        </div>
        <div class="file-list">
          <div
            v-for="file in area.files"
            :key="file.path"
            class="file-row"
            :class="{
              selected:
                store.selectedFile === file.path &&
                store.selectedArea === area.key,
            }"
          >
            <span
              class="file-status"
              :title="file.conflict ? $t('conflict') : ''"
              >{{
                file.conflict
                  ? "!"
                  : area.key === "staged"
                    ? file.index
                    : file.worktree
              }}</span
            >
            <button
              class="file-button"
              :title="file.path"
              @click="
                store.loadDiff(
                  file.path,
                  file.untracked ? 'untracked' : area.key,
                )
              "
            >
              {{ file.path }}
            </button>
            <Button
              :icon="area.key === 'staged' ? 'pi pi-minus' : 'pi pi-plus'"
              :aria-label="
                $t(area.key === 'staged' ? 'unstage' : 'stage') +
                ': ' +
                file.path
              "
              text
              size="small"
              :disabled="store.busy"
              @click="
                area.key === 'staged' ? store.unstage(file) : store.stage(file)
              "
            />
          </div>
          <p v-if="!area.files.length" class="empty">{{ $t("noChanges") }}</p>
        </div>
      </section>
    </div>
    <CommitForm />
  </section>
</template>
<script lang="ts">
import { Component, Vue, toNative } from "vue-facing-decorator";
import CommitForm from "./CommitForm.vue";
import Button from "primevue/button";
import { container } from "../store/container";
@Component({ components: { CommitForm, Button } })
class ChangesPanel extends Vue {
  get store() {
    return container.repository;
  }
  get areas() {
    return [
      { key: "unstaged" as const, files: this.store.unstaged },
      { key: "staged" as const, files: this.store.staged },
    ];
  }
}
export default toNative(ChangesPanel);
</script>
<style lang="scss" scoped>
.change-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  > section:first-child {
    border-right: 1px solid var(--color-border);
  }
}
.file-list {
  height: calc(var(--font-size-base) * 200 / 13);
  overflow: auto;
}
.commit-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-top: 1px solid var(--color-border);
  .actions {
    justify-content: space-between;
  }
}
</style>
