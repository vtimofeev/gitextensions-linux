<template>
  <Dialog
    :visible="!!store.utility"
    modal
    :header="title"
    :closable="!store.busy && !loading"
    :style="{ width: '850px', maxWidth: '95vw' }"
    @update:visible="close"
  >
    <p v-if="loading" role="status">{{ $t("loading") }}</p>
    <template v-else-if="store.utility === 'stash'">
      <form class="dialog-form" @submit.prevent="create">
        <label
          >{{ $t("stashMessage")
          }}<input v-model="message" :disabled="store.busy"
        /></label>
        <div class="actions">
          <label class="check"
            ><input
              type="checkbox"
              v-model="untracked"
              :disabled="store.busy"
            />{{ $t("includeUntracked") }}</label
          ><label class="check"
            ><input
              type="checkbox"
              v-model="keepIndex"
              :disabled="store.busy"
            />{{ $t("keepIndex") }}</label
          ><Button
            type="submit"
            :label="$t('stashCreate')"
            :disabled="store.busy || !!store.snapshot?.operation"
          />
        </div>
      </form>
      <div class="entry-list">
        <button
          v-for="entry in entries"
          :key="entry.selector + entry.hash"
          class="entry"
          :class="{ selected: selected?.hash === entry.hash }"
          @click="select(entry)"
        >
          <code>{{ entry.selector }} · {{ entry.hash.slice(0, 8) }}</code
          ><span>{{ entry.subject }}</span
          ><small>{{ entry.date }}</small>
        </button>
        <p v-if="!entries.length">{{ $t("stashEmpty") }}</p>
      </div>
      <template v-if="selected">
        <label class="check"
          ><input
            type="checkbox"
            v-model="restoreIndex"
            :disabled="store.busy"
          />{{ $t("restoreIndex") }}</label
        >
        <p class="muted">{{ $t("stashPopHint") }}</p>
        <div class="actions">
          <Button
            :label="$t('stashPreview')"
            severity="secondary"
            :disabled="store.busy"
            @click="view"
          /><Button
            :label="$t('stashApply')"
            :disabled="store.busy || !!store.snapshot?.operation"
            @click="stash('apply')"
          /><Button
            :label="$t('stashPop')"
            :disabled="store.busy || !!store.snapshot?.operation"
            @click="stash('pop')"
          /><Button
            :label="$t('stashDrop')"
            severity="danger"
            :disabled="store.busy || !!store.snapshot?.operation"
            @click="confirmDrop = true"
          />
        </div>
        <p v-if="confirmDrop">
          {{ $t("stashRemoveConfirm") }}
          <Button
            :label="$t('stashDrop')"
            severity="danger"
            :disabled="store.busy"
            @click="stash('drop')"
          /><Button :label="$t('cancel')" text @click="confirmDrop = false" />
        </p>
      </template>
    </template>
    <template v-else-if="store.utility === 'reflog'">
      <p class="muted">{{ $t("reflogHint") }}</p>
      <div class="entry-list">
        <button
          v-for="entry in entries"
          :key="entry.selector"
          class="entry"
          :class="{ selected: selected?.selector === entry.selector }"
          @click="select(entry)"
        >
          <code>{{ entry.selector }} · {{ entry.hash.slice(0, 8) }}</code
          ><span>{{ entry.subject }}</span
          ><small>{{ entry.date }}</small>
        </button>
      </div>
      <div v-if="selected" class="actions">
        <Button
          :label="$t('viewCommit')"
          :disabled="store.busy"
          @click="view"
        /><Button
          :label="$t('restoreCommit')"
          severity="secondary"
          :disabled="store.busy || !!store.snapshot?.operation"
          @click="store.openReset(selected!.hash)"
        />
      </div>
    </template>
    <form
      v-else-if="store.utility === 'reset'"
      class="dialog-form"
      @submit.prevent="reset"
    >
      <p>{{ $t("resetHint") }}</p>
      <label
        >{{ $t("resetTarget")
        }}<input v-model="store.resetTarget" required :disabled="store.busy"
      /></label>
      <label
        >{{ $t("resetMode")
        }}<select v-model="resetMode" :disabled="store.busy">
          <option value="soft">{{ $t("resetSoft") }}</option>
          <option value="mixed">{{ $t("resetMixed") }}</option>
          <option value="hard">{{ $t("resetHard") }}</option>
        </select></label
      >
      <template v-if="resetMode === 'hard'"
        ><p class="warning">{{ $t("resetHardHint") }}</p>
        <label class="check"
          ><input
            v-model="confirmHard"
            type="checkbox"
            :disabled="store.busy"
          />{{ $t("resetConfirm") }}</label
        ></template
      >
      <div class="actions">
        <Button
          type="submit"
          :label="$t('resetBranch')"
          :severity="resetMode === 'hard' ? 'danger' : 'primary'"
          :disabled="
            store.busy ||
            !!store.snapshot?.operation ||
            (resetMode === 'hard' && !confirmHard)
          "
        /><Button
          :label="$t('cancel')"
          text
          :disabled="store.busy"
          @click="close"
        />
      </div>
    </form>
    <ErrorNotification :message="error" @dismiss="error = ''" />
  </Dialog>
</template>
<script lang="ts">
import ErrorNotification from "./ErrorNotification.vue";
import { Component, Vue, Watch, toNative } from "vue-facing-decorator";
import Dialog from "primevue/dialog";
import Button from "primevue/button";
import { container } from "../store/container";
import type { StashEntry } from "../domain/models";
@Component({ components: { ErrorNotification, Dialog, Button } })
class RepositoryTools extends Vue {
  entries: StashEntry[] = [];
  selected: StashEntry | null = null;
  loading = false;
  error = "";
  message = "";
  untracked = true;
  keepIndex = false;
  restoreIndex = false;
  confirmDrop = false;
  resetMode = "mixed";
  confirmHard = false;
  private generation = 0;
  get store() {
    return container.repository;
  }
  get title() {
    return container.i18n.t(
      this.store.utility === "stash"
        ? "stash"
        : this.store.utility === "reflog"
          ? "reflog"
          : "resetBranch",
    );
  }
  // immediate: the dialog loads lazily, so it may mount already requested.
  @Watch("store.utility", { immediate: true })
  async changed() {
    this.selected = null;
    this.confirmDrop = false;
    this.confirmHard = false;
    this.resetMode = "mixed";
    await this.load();
  }
  async load() {
    const token = ++this.generation;
    const mode = this.store.utility;
    const path = this.store.path;
    this.error = "";
    if (mode !== "stash" && mode !== "reflog") {
      this.loading = false;
      return;
    }
    this.loading = true;
    try {
      const entries =
        mode === "stash"
          ? await container.api.stashes(path)
          : await container.api.reflog(path);
      if (token === this.generation && path === this.store.path)
        this.entries = entries;
    } catch (e) {
      if (token === this.generation) this.error = String(e);
    } finally {
      if (token === this.generation) this.loading = false;
    }
  }
  select(entry: StashEntry) {
    this.selected = entry;
    this.confirmDrop = false;
  }
  close() {
    if (!this.store.busy && !this.loading) this.store.utility = "";
  }
  async create() {
    const ok = await this.store.execute(() =>
      container.api.stashAction(
        this.store.path,
        "create",
        "",
        this.message,
        this.untracked,
        this.keepIndex,
        false,
      ),
    );
    if (ok) this.message = "";
    await this.load();
  }
  async stash(action: string) {
    if (!this.selected) return;
    const hash = this.selected.hash;
    const ok = await this.store.execute(() =>
      container.api.stashAction(
        this.store.path,
        action,
        hash,
        "",
        false,
        false,
        this.restoreIndex,
      ),
    );
    if (ok) {
      this.selected = null;
      this.confirmDrop = false;
    }
    await this.load();
  }
  async view() {
    if (!this.selected) return;
    const hash = this.selected.hash;
    this.close();
    await this.store.focusBranch(hash);
  }
  async reset() {
    const ok = await this.store.execute(() =>
      container.api.reset(
        this.store.path,
        this.store.resetTarget,
        this.resetMode,
      ),
    );
    if (ok) this.close();
  }
}
export default toNative(RepositoryTools);
</script>
<style lang="scss" scoped>
.entry-list {
  max-height: 45vh;
  overflow: auto;
  margin: 10px 0;
  border: 1px solid var(--color-border);
}
.entry {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr) 160px;
  gap: 8px;
  align-items: center;
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  padding: 6px 8px;
  background: transparent;
  color: var(--color-text);
  text-align: left;
  span {
    overflow-wrap: anywhere;
  }
  small {
    color: var(--color-text-secondary);
  }
  &.selected {
    background: var(--color-selection);
    box-shadow: inset 3px 0 var(--color-accent);
  }
}
label {
  display: flex;
  gap: 6px;
  align-items: center;
  input[type="checkbox"] {
    width: auto;
    flex-shrink: 0;
  }
}
.warning {
  color: var(--color-negative);
}
</style>
