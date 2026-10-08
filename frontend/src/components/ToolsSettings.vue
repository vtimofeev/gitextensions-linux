<template>
  <div class="stack">
    <p v-if="!store.path" class="muted">{{ $t("noRepoTools") }}</p>
    <template v-else
      ><label
        >{{ $t("mergeTool")
        }}<select
          v-model="tool"
          :aria-label="$t('mergeTool')"
          :disabled="store.busy"
          @change="selectTool"
        >
          <option value="">{{ $t("chooseMergeTool") }}</option>
          <option v-for="entry in tools" :key="entry.name" :value="entry.name">
            {{ entry.name
            }}{{ !entry.available ? " · " + $t("notInstalled") : "" }}
          </option>
        </select></label
      ><label
        >{{ $t("toolExecutable")
        }}<input
          v-model="executable"
          :aria-label="$t('toolExecutable')"
          :disabled="store.busy || custom" /></label
      ><label class="check"
        ><input v-model="trustExit" type="checkbox" :disabled="store.busy" />{{
          $t("trustToolExit")
        }}</label
      >
      <p class="muted">{{ $t("toolConfigHint") }}</p>
      <div class="actions">
        <Button
          :label="$t('saveRepositoryTool')"
          :disabled="store.busy || !tool"
          @click="configure"
        /><Button
          :label="$t('detectTools')"
          severity="secondary"
          :disabled="store.busy"
          @click="reload"
        /></div
    ></template>
  </div>
</template>
<script lang="ts">
import { Component, Vue, toNative } from "vue-facing-decorator";
import Button from "primevue/button";
import { container } from "../store/container";
import type { MergeTool } from "../domain/models";
@Component({ components: { Button } })
class ToolsSettings extends Vue {
  tools: MergeTool[] = [];
  tool = "";
  executable = "";
  trustExit = false;
  get store() {
    return container.repository;
  }
  get selected() {
    return this.tools.find((t) => t.name === this.tool);
  }
  get custom() {
    return !!this.selected?.custom;
  }
  mounted() {
    if (this.store.path) void this.reload();
  }
  async reload() {
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
    }
  }
  selectTool() {
    this.executable = this.selected?.path || "";
    this.trustExit = !!this.selected?.trustExit;
  }
  async configure() {
    if (
      await this.store.execute(() =>
        container.api.configureMergeTool(
          this.store.path,
          this.tool,
          this.custom ? "" : this.executable,
          this.trustExit,
        ),
      )
    ) {
      container.preferences.setMergeTool(this.tool);
      await this.reload();
    }
  }
}
export default toNative(ToolsSettings);
</script>
