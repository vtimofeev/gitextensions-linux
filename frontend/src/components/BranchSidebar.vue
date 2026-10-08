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
    <p v-if="search.trim() && !locals.length" class="empty">
      {{ $t("noMatchingBranches") }}
    </p>
    <div
      v-for="branch in locals"
      :key="branch.name"
      class="branch-row"
      :class="{ selected: branch.current }"
      @contextmenu="menu($event, branch)"
    >
      <button
        :disabled="store.busy"
        :title="$t('checkout') + ': ' + branch.name"
        @click="store.focusBranch(branch.hash)"
        @contextmenu="menu($event, branch)"
        @keydown.shift.f10="menu($event, branch)"
      >
        <i class="pi pi-code-branch" /><span
          >{{ branch.name
          }}<small>{{ branch.upstream }} {{ branch.tracking }}</small></span
        ><i v-if="branch.current" class="pi pi-check" />
      </button>
      <Button
        icon="pi pi-trash"
        text
        severity="secondary"
        size="small"
        :aria-label="$t('delete') + ': ' + branch.name"
        :disabled="store.busy || branch.current"
        @click="
          deleting = branch.name;
          force = false;
        "
      />
    </div>
    <div class="panel-heading">
      <h2>{{ $t("remotes") }}</h2>
    </div>
    <button
      v-for="branch in remotes"
      :key="branch.name"
      class="remote-ref"
      :disabled="store.busy"
      @click="store.focusBranch(branch.hash)"
      @contextmenu="menu($event, branch)"
      @keydown.shift.f10="menu($event, branch)"
    >
      <i class="pi pi-cloud" /> {{ branch.name }}
    </button>
    <p v-if="!remotes.length" class="empty">
      {{ $t(search.trim() ? "noMatchingBranches" : "noRemotes") }}
    </p>
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
  max-height: calc(100vh - 180px);
  overflow: auto;
}
.branch-row {
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
    text-overflow: ellipsis;
  }
  small {
    display: block;
    color: var(--color-text-secondary);
  }
}
.remote-ref {
  padding: 5px 10px;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  overflow-wrap: anywhere;
  color: var(--ref-remote);
}
</style>
