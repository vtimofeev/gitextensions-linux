<template>
  <details
    class="commit-details"
    :open="open"
    :aria-label="$t('commitDetails')"
    @toggle="toggled"
    @contextmenu.prevent.stop="menu"
    @keydown.shift.f10.prevent.stop="menu"
  >
    <summary class="panel-heading">
      <h2>{{ $t("commitDetails") }}</h2>
      <span v-if="!open && details" class="collapsed-subject" :title="subject">
        <code>{{ details.hash.slice(0, 8) }}</code> {{ subject }}</span
      >
      <span v-if="copied" role="status">{{ $t("copyDone") }}</span>
    </summary>
    <p v-if="store.detailsLoading">{{ $t("loading") }}</p>
    <div v-else-if="details" class="commit-summary">
      <dl>
        <dt>SHA</dt>
        <dd :title="details.hash">{{ details.hash }}</dd>
        <dt>{{ $t("author") }}</dt>
        <dd
          :title="authorText"
          :style="{ color: authorColor(details.authorEmail || details.author) }"
        >
          <AuthorAvatar :name="details.author" :email="details.authorEmail" />
          {{ authorText }}
        </dd>
        <dt>{{ $t("committer") }}</dt>
        <dd
          :title="committerText"
          :style="{
            color: authorColor(details.committerEmail || details.committer),
          }"
        >
          <AuthorAvatar
            :name="details.committer"
            :email="details.committerEmail"
          />
          {{ committerText }}
        </dd>
        <dt>{{ $t("parents") }}</dt>
        <dd>
          <button
            v-for="hash in details.parents"
            :key="hash"
            :title="hash"
            @click="store.focusBranch(hash)"
          >
            {{ hash.slice(0, 12) }}
          </button>
        </dd>
        <dt>{{ $t("references") }}</dt>
        <dd :title="details.refs">{{ details.refs || "—" }}</dd>
      </dl>
      <div class="message">
        <p class="message-subject" :title="subject">{{ subject }}</p>
        <pre v-if="body" :class="{ clamped: !expanded }">{{ body }}</pre>
        <button
          v-if="body && longBody"
          class="more"
          @click.stop="expanded = !expanded"
        >
          {{ $t(expanded ? "showLess" : "showMore") }}
        </button>
      </div>
    </div>
  </details>
  <Teleport to="body"
    ><div
      v-if="context"
      class="ref-menu"
      role="menu"
      :style="{ left: context.x + 'px', top: context.y + 'px' }"
    >
      <button role="menuitem" @click="copy('info')">{{ $t("copyInfo") }}</button
      ><button role="menuitem" @click="copy('hash')">
        {{ $t("copyHash") }}</button
      ><button role="menuitem" @click="copy('message')">
        {{ $t("copyMessage") }}
      </button>
    </div></Teleport
  >
</template>
<script lang="ts">
import { Component, Vue, Watch, toNative } from "vue-facing-decorator";
import AuthorAvatar from "./AuthorAvatar.vue";
import { authorColor } from "../domain/author-color";
import { container } from "../store/container";
const OPEN_KEY = "gitextensions.commitDetails.open";
function readOpen() {
  try {
    return localStorage.getItem(OPEN_KEY) !== "false";
  } catch {
    return true;
  }
}
@Component({ components: { AuthorAvatar } })
class CommitDetails extends Vue {
  authorColor = authorColor;
  context: { x: number; y: number } | null = null;
  copied = false;
  expanded = false;
  // Collapsed state persists like the operation output panel.
  open = readOpen();
  toggled(event: Event) {
    this.open = (event.target as HTMLDetailsElement).open;
    try {
      localStorage.setItem(OPEN_KEY, String(this.open));
    } catch {
      // Storage may be unavailable; the panel still toggles.
    }
  }
  get subject() {
    return this.details?.message.split("\n")[0] ?? "";
  }
  get body() {
    return this.details?.message.split("\n").slice(1).join("\n").trim() ?? "";
  }
  get longBody() {
    return this.body.split("\n").length > 4 || this.body.length > 400;
  }
  // Full locale date + time instead of raw ISO, as elsewhere in the app.
  when(value: string) {
    return value ? container.i18n.date(value) : "";
  }
  get authorText() {
    const d = this.details;
    return d ? `${d.author} <${d.authorEmail}> · ${this.when(d.date)}` : "";
  }
  get committerText() {
    const d = this.details;
    return d
      ? `${d.committer} <${d.committerEmail}> · ${this.when(d.committerDate)}`
      : "";
  }
  @Watch("store.details.hash")
  changed() {
    this.copied = false;
    this.expanded = false;
    this.dismiss();
  }
  get store() {
    return container.repository;
  }
  get details() {
    return this.store.details;
  }
  mounted() {
    document.addEventListener("click", this.dismiss);
    document.addEventListener("keydown", this.key);
  }
  beforeUnmount() {
    document.removeEventListener("click", this.dismiss);
    document.removeEventListener("keydown", this.key);
  }
  dismiss() {
    this.context = null;
  }
  key(e: KeyboardEvent) {
    if (e.key === "Escape") this.dismiss();
  }
  menu(e: MouseEvent | KeyboardEvent) {
    if (!this.details) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.copied = false;
    this.context = {
      x: Math.min(
        e instanceof MouseEvent ? e.clientX : r.left,
        window.innerWidth - 320,
      ),
      y: Math.min(
        e instanceof MouseEvent ? e.clientY : r.bottom,
        window.innerHeight - 110,
      ),
    };
  }
  async copy(mode: string) {
    const d = this.details;
    this.dismiss();
    if (!d) return;
    const text =
      mode === "hash"
        ? d.hash
        : mode === "message"
          ? d.message
          : `commit ${d.hash}\nAuthor: ${d.author} <${d.authorEmail}>\nAuthor date: ${d.date}\nCommitter: ${d.committer} <${d.committerEmail}>\nCommit date: ${d.committerDate}\nParents: ${d.parents.join(" ")}\nRefs: ${d.refs}\n\n${d.message}`;
    try {
      await container.api.copyText(text);
      this.copied = true;
    } catch (e) {
      this.store.error = String(e);
    }
  }
}
export default toNative(CommitDetails);
</script>
<style lang="scss" scoped>
.commit-details {
  flex: 0 0 auto;
  max-height: 40%;
  border-top: 1px solid var(--color-border);
  overflow: auto;
  padding: 0 8px;
  &[open] > summary::before {
    transform: rotate(90deg);
  }
  &[open] {
    flex: 0 0 190px;
    min-height: 65px;
    padding-bottom: 6px;
  }
  > summary {
    cursor: pointer;
    list-style: none;
    &::-webkit-details-marker {
      display: none;
    }
    /* Flex summaries lose the native marker; draw a rotating chevron. */
    &::before {
      content: "▸";
      flex: none;
      width: 1em;
      color: var(--color-text-secondary);
      transition: transform 0.15s;
    }
    justify-content: flex-start;
    padding-left: 0;
    padding-right: 0;
    border-bottom: 0;
    min-width: 0;
    h2 {
      display: inline;
      flex: none;
    }
  }
  .collapsed-subject {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-secondary);
    font-size: calc(var(--font-size-base) * 12 / 13);
    code {
      font-family: var(--font-code);
      color: var(--color-accent);
    }
  }
  .commit-summary {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    gap: 12px;
  }
  dl {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr);
    gap: 3px 8px;
    margin: 6px 0;
    font-size: calc(var(--font-size-base) * 12 / 13);
  }
  dt {
    color: var(--color-text-secondary);
  }
  /* Long values are cut to one line; the full text is in the tooltip. */
  dd {
    margin: 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .message {
    min-width: 0;
    margin: 6px 0;
    font-size: calc(var(--font-size-base) * 12 / 13);
  }
  .message-subject {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: inherit;
    font-size: inherit;
    margin: 4px 0 0;
    &.clamped {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 4;
      overflow: hidden;
    }
  }
  button {
    color: var(--color-accent);
    background: transparent;
    border: 0;
    padding: 0 6px 0 0;
  }
  .more {
    margin-top: 2px;
    font-size: inherit;
  }
}
</style>
