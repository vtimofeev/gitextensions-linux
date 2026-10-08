<template>
  <Dialog
    :visible="!!store.diffToolTarget"
    modal
    :header="$t('viewExternalDiff')"
    :closable="!store.busy"
    @update:visible="close"
  >
    <div class="dialog-form">
      <p>{{ store.diffToolTarget?.file }}</p>
      <p class="muted">{{ $t("externalDiffHint") }}</p>
      <label
        >{{ $t("mergeTool")
        }}<select
          v-model="tool"
          :aria-label="$t('mergeTool')"
          :disabled="store.busy || loading"
        >
          <option value="">{{ $t("chooseMergeTool") }}</option>
          <option v-for="entry in tools" :key="entry.name" :value="entry.name">
            {{ entry.name
            }}{{ !entry.available ? " · " + $t("notInstalled") : "" }}
          </option>
        </select></label
      >
      <p v-if="running" role="status">{{ $t("working") }}</p>
      <div class="actions">
        <Button
          :label="$t('viewExternalDiff')"
          icon="pi pi-external-link"
          :disabled="store.busy || loading || !ready"
          @click="launch"
        />
        <Button
          v-if="running"
          :label="$t('cancelTool')"
          severity="secondary"
          @click="cancel"
        />
        <Button
          :label="$t('toolSettings')"
          severity="secondary"
          :disabled="store.busy"
          @click="settings"
        />
        <Button
          :label="$t('close')"
          severity="secondary"
          :disabled="store.busy"
          @click="close"
        />
      </div>
    </div>
  </Dialog>
</template>
<script lang="ts">
import { Component, Vue, Watch, toNative } from "vue-facing-decorator";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import { container } from "../store/container";
import type { MergeTool } from "../domain/models";
@Component({ components: { Button, Dialog } })
class ExternalDiffDialog extends Vue {
  tools: MergeTool[] = [];
  tool = "";
  loading = false;
  running = false;
  private generation = 0;
  get store() {
    return container.repository;
  }
  get ready() {
    return this.tools.some(
      (entry) => entry.name === this.tool && entry.available,
    );
  }
  // immediate: the dialog loads lazily, so it may mount already requested.
  @Watch("store.diffToolTarget", { immediate: true })
  async load() {
    const token = ++this.generation;
    if (!this.store.diffToolTarget) return;
    this.loading = true;
    try {
      const tools = await container.api.mergeTools(this.store.path);
      if (token !== this.generation) return;
      this.tools = tools;
      this.tool =
        tools.find(
          (t) => t.name === container.preferences.mergeTool && t.available,
        )?.name ||
        tools.find((t) => t.default && t.available)?.name ||
        tools.find((t) => t.available)?.name ||
        "";
    } catch (error) {
      if (token === this.generation) this.store.error = String(error);
    } finally {
      if (token === this.generation) this.loading = false;
    }
  }
  @Watch("store.path")
  pathChanged() {
    this.close();
  }
  async launch() {
    const target = this.store.diffToolTarget;
    if (!target || !this.ready || this.store.busy) return;
    this.running = true;
    container.preferences.setMergeTool(this.tool);
    const ok = await this.store.execute(
      () =>
        container.api.runDiffTool(
          this.store.path,
          target.file,
          target.area,
          target.revision,
          this.tool,
        ),
      true,
      "working",
    );
    this.running = false;
    if (ok) this.close();
  }
  async cancel() {
    try {
      await container.api.cancelMergeTool();
    } catch (error) {
      this.store.error = String(error);
    }
  }
  settings() {
    this.close();
    this.store.openToolSettings();
  }
  close() {
    if (!this.store.busy) {
      this.generation++;
      this.loading = false;
      this.store.diffToolTarget = null;
    }
  }
}
export default toNative(ExternalDiffDialog);
</script>
