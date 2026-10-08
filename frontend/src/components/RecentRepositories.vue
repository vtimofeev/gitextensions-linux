<template>
  <div class="repository-list">
    <input
      v-if="store.recent.length > 10"
      v-model="filter"
      :aria-label="$t('filterRepositories')"
      :placeholder="$t('filterRepositories')"
      @keydown.enter.stop.prevent="openFirst"
    />
    <div class="repository-scroll">
      <section
        v-for="section in sections"
        :key="section.key"
        :aria-label="$t(section.key)"
      >
        <h3>{{ $t(section.key) }}</h3>
        <div
          v-for="repo in section.repos"
          :key="repo.path"
          class="repository-row"
          :class="{ missing: store.repositoryExists[repo.path] === false }"
          :data-path="repo.path"
        >
          <button
            class="repository-open"
            :role="menu ? 'menuitem' : undefined"
            :disabled="store.busy"
            @click="$emit('open', repo.path)"
          >
            <b
              >{{ repo.path === store.path ? "✓ " : ""
              }}{{ basename(repo.path) }}</b
            >
            <small>{{ shorten(repo.path) }}</small>
            <small class="opened" :title="fullDate(repo.lastOpened)">{{
              $t("repositoryOpened", { time: relative(repo.lastOpened) })
            }}</small>
            <small v-if="store.repositoryExists[repo.path] === false">{{
              $t("repositoryNotFound")
            }}</small>
          </button>
          <button
            class="favorite-toggle"
            :class="{ starred: repo.favorite }"
            :aria-pressed="repo.favorite"
            :aria-label="
              $t(repo.favorite ? 'removeFavorite' : 'addFavorite') +
              ': ' +
              repo.path
            "
            :title="$t(repo.favorite ? 'removeFavorite' : 'addFavorite')"
            @click.stop="store.toggleFavorite(repo.path)"
          >
            {{ repo.favorite ? "★" : "☆" }}
          </button>
          <button
            class="remove-recent"
            :aria-label="$t('removeRecent') + ': ' + repo.path"
            :title="$t('removeRecent')"
            @click.stop="store.removeRecent(repo.path)"
          >
            ×
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
<script lang="ts">
import { Component, Vue, Prop, Watch, toNative } from "vue-facing-decorator";
import { container } from "../store/container";
import type { RecentRepo } from "../store/recent-repos";
import type { MessageKey } from "../i18n/en";
@Component({ emits: ["open"] })
class RecentRepositories extends Vue {
  @Prop({ default: false }) readonly menu!: boolean;
  filter = "";
  now = Date.now();
  private timer?: ReturnType<typeof setInterval>;
  get store() {
    return container.repository;
  }
  get paths() {
    return this.store.recent.map((repo) => repo.path).join("\n");
  }
  @Watch("paths", { immediate: true })
  checkPaths() {
    void this.store.checkRecentRepositories();
  }
  get matches() {
    const query = this.filter.trim().toLocaleLowerCase();
    return this.store.recent.filter((repo) =>
      repo.path.toLocaleLowerCase().includes(query),
    );
  }
  get sections() {
    const sections: { key: MessageKey; repos: RecentRepo[] }[] = [];
    if (this.store.recent.some((repo) => repo.favorite))
      sections.push({
        key: "favorites",
        repos: this.matches.filter((repo) => repo.favorite),
      });
    sections.push({
      key: "recentSection",
      repos: this.matches.filter((repo) => !repo.favorite),
    });
    return sections;
  }
  openFirst() {
    if (!this.store.busy && this.matches[0])
      this.$emit("open", this.matches[0].path);
  }
  basename(path: string) {
    return path.split("/").filter(Boolean).pop() || path;
  }
  shorten(path: string) {
    const home =
      this.store.snapshot?.homePath ||
      path.match(/^\/home\/[^/]+|^\/root(?=\/|$)/)?.[0];
    return home && (path === home || path.startsWith(home + "/"))
      ? "~" + path.slice(home.length)
      : path;
  }
  fullDate(date: string) {
    return container.i18n.date(date);
  }
  relative(date: string) {
    const seconds = Math.min(0, (Date.parse(date) - this.now) / 1000);
    const units: [Intl.RelativeTimeFormatUnit, number][] = [
      ["year", 31536000],
      ["month", 2592000],
      ["day", 86400],
      ["hour", 3600],
      ["minute", 60],
      ["second", 1],
    ];
    const [unit, size] =
      units.find(([, size]) => Math.abs(seconds) >= size) ||
      units[units.length - 1]!;
    return new Intl.RelativeTimeFormat(container.preferences.locale, {
      numeric: "always",
    }).format(Math.round(seconds / size), unit);
  }
  mounted() {
    this.timer = setInterval(() => {
      this.now = Date.now();
    }, 60000);
  }
  beforeUnmount() {
    clearInterval(this.timer);
  }
}
export default toNative(RecentRepositories);
</script>
<style lang="scss" scoped>
.repository-list {
  width: 100%;
  min-width: 0;
}
input {
  width: 100%;
  margin-bottom: 6px;
}
.repository-scroll {
  max-height: 60vh;
  overflow: auto;
}
h3 {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  margin: 8px 0;
}
.repository-row {
  display: flex;
  align-items: center;
  button {
    border: 0;
    background: transparent;
    color: var(--color-text);
    padding: 8px;
    border-radius: var(--radius-sm);
    &:hover,
    &:focus-visible {
      background: var(--color-selection);
    }
  }
  .repository-open {
    flex: 1;
    min-width: 0;
    text-align: left;
    b,
    small {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    small {
      color: var(--color-text-secondary);
      font-size: var(--text-xs);
    }
    small:not(.opened) {
      font-family: var(--font-code);
    }
  }
  .favorite-toggle,
  .remove-recent {
    width: 30px;
    flex: none;
    opacity: 0;
    text-align: center;
  }
  .starred {
    opacity: 1;
    color: var(--color-accent);
  }
  &:hover,
  &:focus-within {
    .favorite-toggle,
    .remove-recent {
      opacity: 1;
    }
  }
  &.missing .repository-open {
    color: var(--color-text-secondary);
    opacity: 0.65;
  }
}
</style>
