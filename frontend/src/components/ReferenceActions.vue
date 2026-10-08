<template>
  <Teleport to="body">
    <div
      v-if="store.refMenu"
      ref="menu"
      class="ref-menu"
      role="menu"
      :aria-label="$t('referenceActions')"
      :style="menuPosition"
      @keydown="menuKeys"
      @contextmenu.prevent
    >
      <div class="ref-menu-target">{{ store.refMenu.target.name }}</div>
      <div
        v-for="item in items"
        :key="item.action + ':' + item.label"
        class="ref-menu-item"
        :class="{ separator: item.separator }"
        @mouseenter="hoverItem($event, item)"
        @mouseleave="submenu = null"
      >
        <button
          role="menuitem"
          :disabled="item.disabled"
          :aria-haspopup="item.children ? 'menu' : undefined"
          :aria-expanded="item.children ? submenu === item.action : undefined"
          @click="activate($event, item)"
          @keydown.right.prevent.stop="openSubmenu($event, item, true)"
        >
          {{ itemLabel(item)
          }}<span v-if="item.children" class="ref-menu-arrow">▸</span>
        </button>
        <div
          v-if="submenu === item.action && item.children"
          class="ref-menu ref-submenu"
          role="menu"
          :aria-label="$t(item.label)"
          :style="submenuPosition"
        >
          <button
            v-for="child in item.children"
            :key="child.target.kind + ':' + child.target.name"
            role="menuitem"
            :disabled="child.disabled"
            @click="run(child)"
          >
            {{ child.target.current ? "✓ " : "" }}{{ child.target.name }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
  <Dialog
    :visible="!!action"
    modal
    :header="title"
    :closable="!store.busy"
    @update:visible="close"
  >
    <form v-if="action" class="dialog-form" @submit.prevent="submit">
      <p class="ref-summary">
        <template v-if="action === 'create-tag'"
          >{{ target?.hash.slice(0, 12) }} {{ commitSubject }}</template
        >
        <template v-else>{{ target?.name }}</template>
        <code v-if="target && action !== 'create-tag'">{{
          target.hash.slice(0, 12)
        }}</code>
      </p>
      <p
        v-if="['merge', 'rebase', 'cherry-pick', 'revert'].includes(action)"
        class="muted"
      >
        {{
          $t(action === "rebase" ? "rebaseInto" : "applyInto", {
            branch: store.snapshot?.branch ?? "HEAD",
          })
        }}
      </p>
      <p
        v-if="action === 'cherry-pick' && target?.kind !== 'commit'"
        class="muted"
      >
        {{ $t("pickTip") }}
      </p>
      <p
        v-if="
          action === 'checkout' &&
          ['commit', 'tag'].includes(target?.kind ?? '')
        "
        class="muted"
      >
        {{ $t("checkoutDetachedHint") }}
      </p>
      <label
        v-if="
          ['create', 'rename'].includes(action) ||
          (action === 'checkout' && target?.kind === 'remote')
        "
        >{{ $t("branchName")
        }}<input v-model="options.name" required :disabled="store.busy"
      /></label>
      <template v-if="action === 'create-tag'">
        <label
          >{{ $t("tagName")
          }}<input
            ref="tagNameInput"
            v-model="options.name"
            required
            autofocus
            :disabled="store.busy"
        /></label>
        <fieldset class="tag-types" :disabled="store.busy">
          <legend>{{ $t("tagType") }}</legend>
          <label v-for="type in tagTypes" :key="type.value" class="check">
            <input
              v-model="options.tagType"
              type="radio"
              name="tagType"
              :value="type.value"
              @change="rememberTagChoices"
            />{{ $t(type.label) }}
          </label>
        </fieldset>
        <label
          >{{ $t("tagMessage")
          }}<textarea
            v-model="options.message"
            rows="3"
            :disabled="store.busy || options.tagType === 'lightweight'"
          />
        </label>
        <label class="check"
          ><input
            v-model="options.force"
            type="checkbox"
            :disabled="store.busy"
          />{{ $t("tagForce") }}</label
        >
      </template>
      <label v-if="action === 'create'" class="check">
        <input
          v-model="options.checkout"
          type="checkbox"
          :disabled="store.busy"
        />
        {{ $t("switchNew") }}
      </label>
      <div
        v-if="action === 'create-tag' || action === 'delete-tag'"
        class="tag-remote"
      >
        <label class="check"
          ><input
            v-model="options.push"
            type="checkbox"
            :disabled="store.busy || !remotes.length"
            @change="rememberTagChoices"
          />{{
            $t(action === "create-tag" ? "pushTagTo" : "deleteTagFrom")
          }}</label
        >
        <select
          v-model="options.remoteName"
          :aria-label="$t('remote')"
          :disabled="store.busy || !options.push || !remotes.length"
        >
          <option v-for="remote in remotes" :key="remote" :value="remote">
            {{ remote }}
          </option>
        </select>
      </div>
      <template v-if="action === 'merge'">
        <label
          >{{ $t("mergeMode")
          }}<select
            v-model="options.mode"
            :aria-label="$t('mergeMode')"
            :disabled="store.busy || options.squash"
          >
            <option value="ff">{{ $t("mergeFF") }}</option>
            <option value="ff-only">{{ $t("ffOnly") }}</option>
            <option value="no-ff">{{ $t("mergeNoFF") }}</option>
          </select></label
        >
        <label class="check"
          ><input
            v-model="options.squash"
            type="checkbox"
            :disabled="store.busy"
            @change="
              options.mode = 'ff';
              options.noCommit = options.squash;
            "
          />{{ $t("squashMerge") }}</label
        >
        <label
          >{{ $t("optionalMessage")
          }}<textarea
            v-model="options.message"
            rows="2"
            :disabled="store.busy || options.squash"
          />
        </label>
      </template>
      <label
        v-if="['merge', 'cherry-pick', 'revert'].includes(action)"
        class="check"
        ><input
          v-model="options.noCommit"
          type="checkbox"
          :disabled="store.busy || options.squash"
        />{{ $t("noCommit") }}</label
      >
      <p v-if="action === 'merge' && options.noCommit" class="muted">
        {{ $t("noCommitHint") }}
      </p>
      <label v-if="action === 'cherry-pick'" class="check"
        ><input
          v-model="options.recordOrigin"
          type="checkbox"
          :disabled="store.busy"
        />{{ $t("recordOrigin") }}</label
      >
      <label v-if="['cherry-pick', 'revert'].includes(action)"
        >{{ $t("mainlineParent")
        }}<input
          v-model.number="options.mainline"
          type="number"
          min="0"
          max="1000"
          required
          :disabled="store.busy"
      /></label>
      <label v-if="action === 'rebase'" class="check"
        ><input
          v-model="options.rebaseMerges"
          type="checkbox"
          :disabled="store.busy"
        />{{ $t("preserveMerges") }}</label
      >
      <p v-if="action === 'rebase'" class="muted">{{ $t("rebaseWarning") }}</p>
      <template v-if="action === 'delete'">
        <p>{{ $t("confirmDelete", { name: target?.name ?? "" }) }}</p>
        <label class="check"
          ><input
            v-model="options.force"
            type="checkbox"
            :disabled="store.busy"
          />{{ $t("forceDelete") }}</label
        >
        <p v-if="options.force" class="muted">{{ $t("deleteWarning") }}</p>
      </template>
      <p v-if="['continue', 'skip', 'abort'].includes(action)" class="muted">
        {{
          $t(
            action === "abort"
              ? "abortHint"
              : action === "skip"
                ? "skipHint"
                : "continueHint",
          )
        }}
      </p>
      <div class="actions">
        <Button
          type="submit"
          :label="title"
          :severity="
            ['delete', 'delete-tag', 'abort'].includes(action)
              ? 'danger'
              : 'primary'
          "
          :loading="store.busy"
          :disabled="!canSubmit"
        /><Button
          :label="$t('cancel')"
          severity="secondary"
          :disabled="store.busy"
          @click="close"
        />
      </div>
    </form>
  </Dialog>
  <div v-if="store.snapshot?.operation" class="operation-controls">
    <Button
      :label="$t('continueOperation')"
      size="small"
      :disabled="store.busy"
      @click="launch('continue')"
    />
    <Button
      v-if="store.snapshot.operation !== 'merge'"
      :label="$t('skipOperation')"
      severity="secondary"
      size="small"
      :disabled="store.busy"
      @click="launch('skip')"
    />
    <Button
      :label="$t('abortOperation')"
      severity="secondary"
      size="small"
      :disabled="store.busy"
      @click="launch('abort')"
    />
  </div>
</template>
<script lang="ts">
import { Component, Vue, Watch, toNative } from "vue-facing-decorator";
import { nextTick } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import { container } from "../store/container";
import type { RefAction, RefOptions, RefTarget } from "../domain/models";
import {
  buildRefMenu,
  refActionLabels,
  type RefMenuItem,
} from "../domain/ref-menu";
@Component({ components: { Button, Dialog } })
class ReferenceActions extends Vue {
  action: RefAction | "" = "";
  submenu: RefMenuItem["action"] | null = null;
  submenuPosition = { left: "0px", top: "0px" };
  menuX = 4;
  menuY = 4;
  target: RefTarget | null = null;
  options: RefOptions = {
    action: "checkout",
    target: "",
    name: "",
    mode: "ff",
    message: "",
    remote: false,
    detach: false,
    noCommit: false,
    squash: false,
    recordOrigin: true,
    mainline: 0,
    rebaseMerges: false,
    force: false,
  };
  tagTypes = [
    { value: "lightweight", label: "tagLightweight" },
    { value: "annotated", label: "tagAnnotated" },
    { value: "signed", label: "tagSigned" },
  ] as const;
  get remotes() {
    return this.store.snapshot?.remotes ?? [];
  }
  get commitSubject() {
    return (
      this.store.snapshot?.commits.find((c) => c.hash === this.target?.hash)
        ?.subject ??
      this.target?.name ??
      ""
    );
  }
  get canSubmit() {
    return (
      !this.store.busy &&
      (this.action !== "create-tag" ||
        (!!this.options.name.trim() &&
          (this.options.tagType === "lightweight" ||
            !!this.options.message.trim()))) &&
      (!this.options.push ||
        this.remotes.includes(this.options.remoteName ?? ""))
    );
  }
  rememberTagChoices() {
    if (this.action !== "create-tag") return;
    localStorage.setItem(
      "gitextensions.tag.type",
      this.options.tagType ?? "lightweight",
    );
    localStorage.setItem("gitextensions.tag.push", String(!!this.options.push));
  }
  @Watch("store.createTagRequested")
  createTagRequested() {
    const commit = this.store.selectedCommit;
    if (commit)
      this.launch("create-tag", {
        name: commit.subject,
        hash: commit.hash,
        kind: "commit",
        current: false,
        parents: commit.parents.length,
      });
  }
  get store() {
    return container.repository;
  }
  get title() {
    return this.action ? container.i18n.t(refActionLabels[this.action]) : "";
  }
  get menuPosition() {
    return { left: `${this.menuX}px`, top: `${this.menuY}px` };
  }
  get items() {
    const target = this.store.refMenu?.target;
    return target
      ? buildRefMenu(
          target,
          this.store.busy || !!this.store.snapshot?.operation,
          this.store.snapshot?.detached,
        )
      : [];
  }
  itemLabel(item: RefMenuItem) {
    const label = container.i18n.t(item.label);
    return `${item.target.current && !item.children && item.action === "checkout" ? "✓ " : ""}${label}${item.name ? ` "${item.name}"` : ""}`;
  }
  hoverItem(event: MouseEvent, item: RefMenuItem) {
    this.submenu = null;
    if (item.children && !item.disabled) void this.openSubmenu(event, item);
  }
  async openSubmenu(event: Event, item: RefMenuItem, focus = false) {
    if (!item.children || item.disabled) return;
    const element = event.currentTarget as HTMLElement;
    const parent = element.matches("button")
      ? element
      : element.querySelector("button")!;
    const rect = parent.getBoundingClientRect();
    this.submenu = item.action;
    await nextTick();
    const flyout =
      parent.parentElement?.querySelector<HTMLElement>(".ref-submenu");
    if (!flyout || this.submenu !== item.action) return;
    this.submenuPosition = {
      left: `${Math.max(4, rect.right + flyout.offsetWidth > window.innerWidth - 4 ? rect.left - flyout.offsetWidth : rect.right)}px`,
      top: `${Math.max(4, Math.min(rect.top, window.innerHeight - flyout.offsetHeight - 4))}px`,
    };
    if (focus)
      flyout.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }
  activate(event: MouseEvent, item: RefMenuItem) {
    if (item.children) void this.openSubmenu(event, item, true);
    else this.run(item);
  }
  run(item: RefMenuItem) {
    if (item.disabled) return;
    if (item.action === "review") {
      const hash = item.target.hash;
      this.dismiss();
      void this.openReview(hash);
    } else if (item.action === "reset") this.store.openReset(item.target.hash);
    else if (item.immediate) {
      this.dismiss();
      void this.store.checkout(item.target.name);
    } else this.launch(item.action, item.target);
  }
  async openReview(hash: string) {
    const path = this.store.path;
    try {
      const commit =
        this.store.snapshot?.commits.find((c) => c.hash === hash) ??
        (await container.api.commitInfo(path, hash));
      if (this.store.path === path) await container.review.open(path, commit);
    } catch (e) {
      this.store.error = String(e);
    }
  }
  mounted() {
    document.addEventListener("click", this.outside);
    document.addEventListener("keydown", this.escape);
    window.addEventListener("resize", this.dismiss);
  }
  beforeUnmount() {
    document.removeEventListener("click", this.outside);
    document.removeEventListener("keydown", this.escape);
    window.removeEventListener("resize", this.dismiss);
  }
  outside(event: MouseEvent) {
    if (!(event.target as HTMLElement)?.closest(".ref-menu")) this.dismiss();
  }
  dismiss() {
    this.submenu = null;
    this.store.refMenu = null;
  }
  escape(event: KeyboardEvent) {
    if (event.key === "Escape") this.dismiss();
  }
  @Watch("store.refMenu")
  async focusMenu() {
    this.submenu = null;
    this.menuX = Math.max(
      4,
      Math.min(this.store.refMenu?.x ?? 0, window.innerWidth - 304),
    );
    this.menuY = 4;
    await nextTick();
    const menu = this.$refs.menu as HTMLElement | undefined;
    this.menuY = Math.max(
      4,
      Math.min(
        this.store.refMenu?.y ?? 0,
        window.innerHeight - (menu?.offsetHeight ?? 0) - 4,
      ),
    );
    (this.$refs.menu as HTMLElement | undefined)
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
  }
  @Watch("store.path")
  repositoryChanged() {
    this.dismiss();
    this.close();
  }
  menuKeys(event: KeyboardEvent) {
    const menu = (event.target as HTMLElement).closest<HTMLElement>(
      '[role="menu"]',
    );
    if (!menu) return;
    if (["ArrowLeft", "Escape"].includes(event.key) && this.submenu) {
      event.preventDefault();
      event.stopPropagation();
      const parent = (
        this.$refs.menu as HTMLElement
      ).querySelector<HTMLButtonElement>('button[aria-expanded="true"]');
      this.submenu = null;
      parent?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (menu === this.$refs.menu) this.submenu = null;
    const buttons = Array.from(
      menu.querySelectorAll<HTMLButtonElement>(
        ":scope > button:not(:disabled), :scope > .ref-menu-item > button:not(:disabled)",
      ),
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
            buttons.length;
    buttons[next]?.focus();
  }
  launch(action: RefAction, target = this.store.refMenu?.target ?? null) {
    if (this.store.busy) return;
    this.target = target;
    this.options = {
      action,
      target: this.target?.hash ?? "",
      name:
        this.target?.kind === "remote"
          ? this.target.name.split("/").slice(1).join("/")
          : "",
      mode: "ff",
      message: "",
      remote: this.target?.kind === "remote",
      detach: this.target?.kind === "commit" || this.target?.kind === "tag",
      noCommit: false,
      squash: false,
      recordOrigin: true,
      mainline: (this.target?.parents ?? 0) > 1 ? 1 : 0,
      rebaseMerges: false,
      force: false,
      checkout: action === "create",
    };
    if (
      ["checkout", "merge", "rebase", "create", "rename", "delete"].includes(
        action,
      ) &&
      this.target?.kind !== "commit"
    )
      this.options.target = this.target?.name ?? "";
    if (action === "create-tag" || action === "delete-tag") {
      const savedType = localStorage.getItem("gitextensions.tag.type");
      this.options.tagType =
        savedType === "annotated" || savedType === "signed"
          ? savedType
          : "lightweight";
      this.options.push =
        action === "create-tag" &&
        this.remotes.length > 0 &&
        localStorage.getItem("gitextensions.tag.push") === "true";
      const upstream =
        this.store.snapshot?.branches.find((b) => b.current)?.upstream ?? "";
      this.options.remoteName =
        [...this.remotes]
          .sort((a, b) => b.length - a.length)
          .find((r) => upstream.startsWith(r + "/")) ??
        (this.remotes.includes("origin") ? "origin" : (this.remotes[0] ?? ""));
      if (action === "delete-tag")
        this.options.target = this.target?.name ?? "";
    }
    this.action = action;
    this.store.error = "";
    this.dismiss();
    if (action === "create-tag")
      void nextTick(() =>
        (this.$refs.tagNameInput as HTMLInputElement | undefined)?.focus(),
      );
  }
  close() {
    if (!this.store.busy) {
      this.action = "";
      this.target = null;
    }
  }
  async submit() {
    if (!this.canSubmit) return;
    this.rememberTagChoices();
    const options = {
      ...this.options,
      message:
        this.action === "create-tag" && this.options.tagType === "lightweight"
          ? ""
          : this.options.message,
    };
    if (await this.store.refAction(options)) {
      if (this.action === "create-tag")
        this.store.output = container.i18n.t("tagCreated", {
          name: options.name,
        });
      this.close();
    }
  }
}
export default toNative(ReferenceActions);
</script>
<style lang="scss">
.tag-types {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  margin: 0;
  legend {
    color: var(--color-text-secondary);
  }
}
.tag-remote {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ref-menu {
  position: fixed;
  z-index: 1100;
  width: 300px;
  max-width: calc(100vw - 8px);
  max-height: calc(100vh - 8px);
  overflow-y: auto;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-level-200);
  padding: 3px;
  button {
    display: block;
    width: 100%;
    padding: 5px 8px;
    text-align: left;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text);
    &:hover,
    &:focus-visible {
      background: var(--color-selection);
    }
    &:disabled {
      opacity: 0.45;
    }
  }
}
.ref-menu-item.separator {
  border-top: 1px solid var(--color-border-subtle);
  margin-top: 3px;
  padding-top: 3px;
}
.ref-menu-arrow {
  float: right;
}
.ref-menu-target {
  padding: 4px 8px;
  border-bottom: 1px solid var(--color-border-subtle);
  font-size: calc(var(--font-size-base) * 12 / 13);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-secondary);
}
.ref-summary {
  overflow-wrap: anywhere;
  code {
    color: var(--color-text-secondary);
    margin-left: 8px;
  }
}
.operation-controls {
  display: flex;
  gap: 4px;
  padding: 4px 12px;
  margin: 0 12px 6px;
  justify-content: flex-end;
  background: var(--color-level-200);
  border: 1px solid var(--color-border);
  z-index: 10;
}
</style>
