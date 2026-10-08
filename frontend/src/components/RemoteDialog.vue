<template>
  <Dialog
    :visible="visible"
    modal
    :header="$t(mode)"
    :closable="!store.busy"
    @update:visible="$emit('close')"
  >
    <form class="dialog-form" @submit.prevent="submit">
      <label v-if="mode !== 'fetch'"
        >{{ $t("remote")
        }}<select
          :aria-label="$t('remote')"
          v-model="remote"
          :disabled="store.busy"
        >
          <option value="">{{ $t("defaultRemote") }}</option>
          <option v-for="name in store.snapshot?.remotes" :key="name">
            {{ name }}
          </option>
        </select></label
      >
      <label v-if="mode !== 'fetch'"
        >{{ $t("destination") }}<input v-model="branch" :disabled="store.busy"
      /></label>
      <template v-if="mode === 'push'"
        ><label v-for="option in pushFlags" :key="option.key" class="check"
          ><input
            v-model="options[option.key]"
            type="checkbox"
            :disabled="store.busy"
          />{{ $t(option.label) }}</label
        >
        <p v-if="options.forceWithLease" class="muted">
          {{ $t("forceWarning") }}
        </p></template
      >
      <label v-if="mode === 'pull'"
        >{{ $t("pullMode")
        }}<select
          :aria-label="$t('pullMode')"
          v-model="pullMode"
          :disabled="store.busy"
        >
          <option value="ff-only">{{ $t("ffOnly") }}</option>
          <option value="rebase">{{ $t("rebase") }}</option>
          <option value="merge">{{ $t("merge") }}</option>
        </select></label
      >
      <label v-if="mode === 'fetch'" class="check"
        ><input v-model="prune" type="checkbox" :disabled="store.busy" />{{
          $t("prune")
        }}</label
      >
      <div class="actions">
        <Button type="submit" :label="$t(mode)" :loading="store.busy" /><Button
          :label="$t('cancel')"
          severity="secondary"
          :disabled="store.busy"
          @click="$emit('close')"
        />
      </div>
    </form>
  </Dialog>
</template>
<script lang="ts">
import { Component, Prop, Vue, toNative } from "vue-facing-decorator";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import { container } from "../store/container";
@Component({ components: { Button, Dialog }, emits: ["close"] })
class RemoteDialog extends Vue {
  @Prop({ type: Boolean, required: true }) visible!: boolean;
  @Prop({ type: String, required: true }) mode!: "fetch" | "pull" | "push";
  remote = "";
  branch = "";
  pullMode = container.preferences.pullMode;
  prune = container.preferences.fetchPrune;
  options = {
    setUpstream: false,
    forceWithLease: false,
    tags: false,
    dryRun: false,
  };
  pushFlags = [
    { key: "setUpstream" as const, label: "setUpstream" as const },
    { key: "forceWithLease" as const, label: "forceLease" as const },
    { key: "tags" as const, label: "tags" as const },
    { key: "dryRun" as const, label: "dryRun" as const },
  ];
  get store() {
    return container.repository;
  }
  async submit() {
    if (
      this.mode === "push" &&
      this.options.forceWithLease &&
      container.preferences.confirmForcePush &&
      !window.confirm(this.$t("forceWarning"))
    )
      return;
    container.preferences.pullMode = this.pullMode;
    container.preferences.fetchPrune = this.prune;
    container.preferences.persistSync();
    const api = container.api;
    const path = this.store.path;
    const ok = await this.store.execute(
      () =>
        this.mode === "fetch"
          ? api.fetchAll(path, this.prune)
          : this.mode === "pull"
            ? api.pull(path, this.remote, this.branch, this.pullMode)
            : api.push(path, {
                ...this.options,
                remote: this.remote,
                branch: this.branch,
              }),
      true,
      "repository",
      this.mode === "fetch"
        ? "activityFetch"
        : this.mode === "pull"
          ? "activityPull"
          : "activityPush",
    );
    if (ok) this.$emit("close");
  }
}
export default toNative(RemoteDialog);
</script>
