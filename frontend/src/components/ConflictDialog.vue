<template>
  <Dialog
    :visible="!!store.conflictFile || store.toolSettings"
    modal
    :header="$t(store.conflictFile ? 'resolveConflict' : 'toolSettings')"
    :closable="!store.busy"
    @update:visible="close"
  >
    <div class="dialog-form conflict-dialog">
      <p>{{ store.conflictFile }}</p>
      <p v-if="store.snapshot?.operation === 'rebase'" class="muted">
        {{ $t("rebaseSides") }}
      </p>
      <p v-if="loading" role="status">{{ $t("working") }}</p>
      <template v-if="data || store.toolSettings">
        <p
          v-if="
            data &&
            (!data.externalSupported ||
              !data.oursPresent ||
              !data.theirsPresent)
          "
          class="muted"
        >
          {{ $t("specialConflict") }}
        </p>
        <p v-if="data?.binary" class="muted">{{ $t("externalOnlyPreview") }}</p>
        <label
          >{{ $t("mergeTool")
          }}<select
            v-model="tool"
            :aria-label="$t('mergeTool')"
            :disabled="store.busy"
            @change="selectTool"
          >
            <option value="">{{ $t("chooseMergeTool") }}</option>
            <option
              v-for="entry in tools"
              :key="entry.name"
              :value="entry.name"
            >
              {{ entry.name }}{{ entry.default ? " · Git default" : ""
              }}{{ !entry.available ? " · " + $t("notInstalled") : "" }}
            </option>
          </select></label
        >
        <label
          >{{ $t("toolExecutable")
          }}<input
            v-model="executable"
            :disabled="store.busy || customTool"
            :placeholder="'/usr/bin/' + (tool || 'meld')"
        /></label>
        <label class="check"
          ><input
            v-model="trustExit"
            type="checkbox"
            :disabled="store.busy"
          />{{ $t("trustToolExit") }}</label
        >
        <p class="muted">{{ $t("toolConfigHint") }}</p>
        <div class="actions">
          <Button
            :label="$t('saveRepositoryTool')"
            severity="secondary"
            size="small"
            :disabled="store.busy || !tool"
            @click="configure"
          /><Button
            :label="$t('detectTools')"
            text
            size="small"
            :disabled="store.busy"
            @click="reloadTools"
          />
        </div>
        <div v-if="data" class="actions">
          <Button
            :label="$t('launchMergeTool')"
            icon="pi pi-external-link"
            :disabled="
              store.busy ||
              !ready ||
              !data.oursPresent ||
              !data.theirsPresent ||
              !data.externalSupported
            "
            @click="launch"
          /><Button
            v-if="toolRunning"
            :label="$t('cancelTool')"
            severity="secondary"
            @click="cancelTool"
          />
        </div>
        <p v-if="toolRunning" role="status">{{ $t("toolRunning") }}</p>
        <template v-if="data"
          ><hr />
          <p class="muted">{{ $t("conflictQuickActions") }}</p>
          <div class="actions">
            <Button
              :label="$t('markResolved')"
              severity="secondary"
              :disabled="store.busy"
              @click="resolve('mark')"
            /><Button
              :label="$t('useOurs')"
              severity="secondary"
              :disabled="store.busy || !data.oursPresent"
              @click="confirm = 'ours'"
            /><Button
              :label="$t('useTheirs')"
              severity="secondary"
              :disabled="store.busy || !data.theirsPresent"
              @click="confirm = 'theirs'"
            /><Button
              :label="$t('resolveDeleted')"
              severity="secondary"
              :disabled="store.busy"
              @click="confirm = 'delete'"
            />
          </div>
        </template>
      </template>
      <div v-if="confirm" class="conflict-confirm">
        <p>{{ $t("confirmConflictSide", { mode: confirm }) }}</p>
        <div class="actions">
          <Button
            :label="$t('confirmResolution')"
            severity="danger"
            :disabled="store.busy"
            @click="resolve(confirm)"
          /><Button
            :label="$t('cancel')"
            severity="secondary"
            :disabled="store.busy"
            @click="confirm = ''"
          />
        </div>
      </div>
      <div class="actions">
        <Button
          v-if="data"
          :label="$t('reloadConflict')"
          severity="secondary"
          :disabled="store.busy || loading"
          @click="load"
        /><Button
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
import type { ConflictData, MergeTool } from "../domain/models";
@Component({ components: { Button, Dialog } })
class ConflictDialog extends Vue {
  data: ConflictData | null = null;
  tools: MergeTool[] = [];
  tool = "";
  executable = "";
  trustExit = false;
  loading = false;
  toolRunning = false;
  confirm: "" | "ours" | "theirs" | "delete" = "";
  private generation = 0;
  get store() {
    return container.repository;
  }
  get selectedTool() {
    return this.tools.find((t) => t.name === this.tool);
  }
  get customTool() {
    return this.selectedTool?.custom ?? false;
  }
  get ready() {
    return !!this.selectedTool?.available;
  }
  // immediate: the dialog loads lazily, so it may mount already requested.
  @Watch("store.conflictFile", { immediate: true })
  async fileChanged() {
    this.generation++;
    this.data = null;
    this.confirm = "";
    if (this.store.conflictFile) await this.load();
  }
  // immediate: the dialog loads lazily, so it may mount already requested.
  @Watch("store.toolSettings", { immediate: true })
  async settingsChanged() {
    if (this.store.toolSettings && !this.store.conflictFile) {
      this.loading = true;
      this.store.error = "";
      try {
        this.tools = await container.api.mergeTools(this.store.path);
        this.tool =
          container.preferences.mergeTool ||
          this.tools.find((t) => t.default)?.name ||
          this.tools.find((t) => t.available)?.name ||
          "";
        this.selectTool();
      } catch (error) {
        this.store.error = String(error);
      } finally {
        this.loading = false;
      }
    }
  }
  @Watch("store.path")
  changed() {
    this.generation++;
    this.store.conflictFile = "";
    this.store.toolSettings = false;
    this.data = null;
  }
  async load() {
    const file = this.store.conflictFile,
      path = this.store.path,
      token = ++this.generation;
    if (!file) return;
    this.loading = true;
    this.store.error = "";
    try {
      const [data, tools] = await Promise.all([
        container.api.conflict(path, file),
        container.api.mergeTools(path),
      ]);
      if (
        token !== this.generation ||
        file !== this.store.conflictFile ||
        path !== this.store.path
      )
        return;
      this.data = data;
      this.tools = tools;
      this.tool =
        container.preferences.mergeTool ||
        tools.find((t) => t.default)?.name ||
        tools.find((t) => t.available)?.name ||
        "";
      if (!tools.some((t) => t.name === this.tool)) this.tool = "";
      this.selectTool();
    } catch (error) {
      if (token === this.generation) this.store.error = String(error);
    } finally {
      if (token === this.generation) this.loading = false;
    }
  }
  selectTool() {
    this.executable = this.selectedTool?.path ?? "";
    this.trustExit = this.selectedTool?.trustExit ?? false;
  }
  async reloadTools() {
    try {
      this.tools = await container.api.mergeTools(this.store.path);
      this.selectTool();
    } catch (error) {
      this.store.error = String(error);
    }
  }
  async configure() {
    if (
      await this.store.execute(() =>
        container.api.configureMergeTool(
          this.store.path,
          this.tool,
          this.customTool ? "" : this.executable,
          this.trustExit,
        ),
      )
    ) {
      container.preferences.setMergeTool(this.tool);
      await this.reloadTools();
    }
  }
  async launch() {
    this.toolRunning = true;
    container.preferences.setMergeTool(this.tool);
    await this.store.execute(() =>
      container.api.runMergeTool(
        this.store.path,
        this.store.conflictFile,
        this.tool,
      ),
    );
    this.toolRunning = false;
    if (
      !this.store.snapshot?.files.some(
        (f) => f.path === this.store.conflictFile && f.conflict,
      )
    )
      this.close();
    else {
      const error = this.store.error;
      await this.load();
      this.store.error = error;
    }
  }
  async cancelTool() {
    try {
      await container.api.cancelMergeTool();
    } catch (error) {
      this.store.error = String(error);
    }
  }
  async resolve(mode: "mark" | "ours" | "theirs" | "delete") {
    if (!this.data) return;
    const file = this.store.conflictFile;
    if (
      await this.store.execute(() =>
        container.api.resolveConflict(
          this.store.path,
          file,
          this.data!.token,
          mode,
        ),
      )
    ) {
      this.confirm = "";
      this.close();
    }
  }
  close() {
    if (!this.store.busy) {
      this.generation++;
      this.loading = false;
      this.store.conflictFile = "";
      this.store.toolSettings = false;
      this.data = null;
    }
  }
}
export default toNative(ConflictDialog);
</script>
<style lang="scss" scoped>
.conflict-dialog {
  min-width: 460px;
  max-width: 600px;
  font-size: calc(var(--font-size-base) * 13 / 13);
  hr {
    border: 0;
    border-top: 1px solid var(--color-border);
    width: 100%;
    margin: 2px 0;
  }
}
.conflict-confirm {
  border: 1px solid var(--color-warning);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
