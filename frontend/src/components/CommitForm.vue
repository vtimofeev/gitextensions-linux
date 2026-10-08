<template>
  <form class="commit-form" @submit.prevent="store.commit()">
    <label
      >{{ $t("commitMessage")
      }}<textarea
        v-model="store.message"
        rows="3"
        required
        :disabled="store.busy"
        :aria-label="$t('commitMessage')"
        @keydown="shortcut"
      />
    </label>
    <p
      v-if="store.identity?.name && store.identity?.email"
      class="muted committing-as"
    >
      {{
        $t("committingAs", {
          name: profile?.label || store.identity.name,
          email: store.identity.email,
        })
      }}
    </p>
    <button
      v-else
      type="button"
      class="identity-error"
      @click="store.settingsTab = 'profiles'"
    >
      {{ $t("identitySetup") }}
    </button>
    <div class="commit-split">
      <Button
        type="submit"
        icon="pi pi-check"
        :label="
          $t(store.pushAfterCommit ? 'commitPushCount' : 'commitFilesCount', {
            n: store.staged.length,
          })
        "
        :severity="store.staged.length ? undefined : 'secondary'"
        :disabled="disabled"
        :loading="store.busy"
      />
      <Button
        type="button"
        icon="pi pi-chevron-down"
        :severity="store.staged.length ? undefined : 'secondary'"
        :aria-label="$t('commit') + ' ' + $t('options')"
        :title="$t('options')"
        :disabled="store.busy"
        @click="toggle"
      />
    </div>
    <Popover ref="menu"
      ><div
        class="toolbar-menu commit-menu"
        role="menu"
        @keydown="navigateMenu"
        @keydown.esc="hide"
      >
        <button
          v-for="push in [false, true]"
          :key="String(push)"
          type="button"
          role="menuitemradio"
          autofocus
          :aria-checked="store.pushAfterCommit === push"
          @click="mode(push)"
        >
          {{ store.pushAfterCommit === push ? "◉ " : "○ "
          }}{{ $t(push ? "commitPush" : "commit")
          }}<kbd>{{ push ? "Ctrl+Shift+Enter" : "Ctrl+Enter" }}</kbd>
        </button>
        <p class="muted">{{ $t("remembered") }}</p>
      </div></Popover
    >
  </form>
</template>
<script lang="ts">
import { Component, Vue, toNative } from "vue-facing-decorator";
import Button from "primevue/button";
import Popover from "primevue/popover";
import { container } from "../store/container";
import { navigateMenu } from "./toolbar/menu-navigation";
@Component({ components: { Button, Popover } })
class CommitForm extends Vue {
  navigateMenu = navigateMenu;
  get store() {
    return container.repository;
  }
  get profile() {
    return this.store.activeProfile;
  }
  get disabled() {
    return (
      this.store.busy ||
      !this.store.message.trim() ||
      !this.store.staged.length ||
      !this.store.identity?.name ||
      !this.store.identity?.email
    );
  }
  toggle(event: Event) {
    (this.$refs.menu as InstanceType<typeof Popover>).toggle(event);
  }
  hide() {
    (this.$refs.menu as InstanceType<typeof Popover>).hide();
  }
  mode(push: boolean) {
    this.store.pushAfterCommit = push;
    this.store.persistPushPreference();
    this.hide();
  }
  shortcut(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      if (!this.disabled) void this.store.commit(event.shiftKey);
    }
  }
}
export default toNative(CommitForm);
</script>
<style lang="scss" scoped>
.commit-form {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  font-size: var(--text-sm);
  textarea {
    resize: vertical;
    min-height: calc(var(--font-size-base) * 60 / 13);
    font-family: var(--font-code);
    font-size: var(--font-size-code);
  }
}
.committing-as {
  font-size: var(--text-xs);
  overflow-wrap: anywhere;
}
.identity-error {
  border: 0;
  background: transparent;
  color: var(--color-negative);
  font-size: var(--text-xs);
  text-align: left;
  padding: 0;
}
.commit-split {
  display: flex;
  :deep(.p-button) {
    height: calc(var(--font-size-base) * 30 / 13);
  }
  :deep(.p-button:first-child) {
    flex: 1;
    justify-content: flex-start;
    border-radius: var(--radius-md) 0 0 var(--radius-md);
  }
  :deep(.p-button:last-child) {
    flex: none;
    width: calc(var(--font-size-base) * 30 / 13);
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
    border-left: 1px solid color-mix(in srgb, currentColor 25%, transparent);
    .pi {
      font-size: calc(var(--font-size-base) * 10 / 13);
    }
  }
}
.commit-menu {
  width: 310px;
}
</style>
