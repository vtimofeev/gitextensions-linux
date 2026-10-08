<template>
  <Popover
    ref="popover"
    @hide="
      query = '';
      active = 0;
      goto = false;
    "
    ><div
      class="command-palette"
      @keydown="navigate"
      @keydown.esc.prevent="close"
    >
      <form v-if="goto" @submit.prevent="go">
        <label
          >{{ $t("goToCommit")
          }}<input
            ref="gotoInput"
            v-model="revision"
            :aria-label="$t('shaRef')"
            :placeholder="$t('shaRef')" /></label
        ><Button type="submit" :label="$t('goToCommit')" />
      </form>
      <template v-else
        ><input
          ref="search"
          v-model="query"
          :aria-label="$t('searchCommands')"
          :placeholder="$t('searchCommands')"
          role="combobox"
          aria-controls="command-results"
          aria-expanded="true"
          :aria-activedescendant="
            matches[active] ? 'command-' + matches[active]!.id : undefined
          "
        />
        <div id="command-results" role="listbox">
          <button
            v-for="(command, index) in matches"
            :key="command.id"
            :id="'command-' + command.id"
            role="option"
            :aria-selected="index === active"
            :class="{ active: index === active }"
            @mousemove="active = index"
            @click="run(command.id)"
          >
            <span>{{ command.label }}</span
            ><kbd>{{ command.shortcut }}</kbd>
          </button>
        </div>
        <p v-if="!matches.length" class="muted">{{ $t("noCommands") }}</p>
      </template>
    </div></Popover
  >
</template>
<script lang="ts">
import { Component, Prop, Vue, Watch, toNative } from "vue-facing-decorator";
import Popover from "primevue/popover";
import Button from "primevue/button";
import { CommandRegistry } from "../commands/registry";
import { container } from "../store/container";
@Component({ components: { Popover, Button } })
class CommandPalette extends Vue {
  @Prop({ required: true }) registry!: CommandRegistry;
  query = "";
  active = 0;
  goto = false;
  revision = "";
  get matches() {
    return this.registry.search(this.query);
  }
  @Watch("query")
  reset() {
    this.active = 0;
  }
  open(event: Event, go = false) {
    this.goto = go;
    this.query = "";
    this.active = 0;
    (this.$refs.popover as InstanceType<typeof Popover>).show(event);
    this.$nextTick(() =>
      (this.$refs[go ? "gotoInput" : "search"] as HTMLInputElement)?.focus(),
    );
  }
  close() {
    (this.$refs.popover as InstanceType<typeof Popover>).hide();
  }
  run(id: string) {
    if (id === "goto") {
      this.goto = true;
      this.$nextTick(() => (this.$refs.gotoInput as HTMLInputElement)?.focus());
      return;
    }
    this.close();
    void this.registry.run(id);
  }
  navigate(event: KeyboardEvent) {
    if (this.goto) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      this.active =
        (this.active +
          (event.key === "ArrowDown" ? 1 : -1) +
          this.matches.length) %
        Math.max(1, this.matches.length);
      this.$nextTick(() =>
        document
          .getElementById("command-" + this.matches[this.active]?.id)
          ?.scrollIntoView({ block: "nearest" }),
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = this.matches[this.active];
      if (command) this.run(command.id);
    }
  }
  go() {
    const store = container.repository;
    const revision = this.revision.trim();
    const branch = store.snapshot?.branches.find((b) => b.name === revision);
    const commit = store.snapshot?.commits.find(
      (c) =>
        c.hash === branch?.hash ||
        c.hash === revision ||
        (revision.length >= 4 && c.hash.startsWith(revision)) ||
        (revision === "HEAD" && /(^|, )HEAD(?: ->|$|,)/.test(c.refs)) ||
        c.refs
          .split(", ")
          .some((ref) => ref === revision || ref === "tag: " + revision),
    );
    if (!commit) {
      store.error = this.$t("notLoadedHistory");
      return;
    }
    this.close();
    store.graphFocus = {
      hash: commit.hash,
      request: store.graphFocus.request + 1,
    };
    void store.selectCommit(commit);
  }
}
export default toNative(CommandPalette);
</script>
<style lang="scss" scoped>
.command-palette {
  width: 480px;
  max-width: calc(100vw - 40px);
  display: flex;
  flex-direction: column;
  gap: 8px;
  [role="listbox"] {
    max-height: 400px;
    overflow: auto;
  }
  button[role="option"] {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    border: 0;
    background: transparent;
    color: var(--color-text);
    text-align: left;
    padding: 8px;
    border-radius: var(--radius-sm);
    &.active {
      background: var(--color-selection);
    }
  }
  kbd {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    white-space: nowrap;
  }
}
</style>
