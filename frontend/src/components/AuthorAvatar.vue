<template>
  <span
    class="author-avatar"
    :style="{ background: color, color: ink }"
    :title="`${name} <${email}>`"
    :aria-label="`${name} <${email}>`"
    >{{ initials }}</span
  >
</template>
<script lang="ts">
import { Component, Vue, Prop, toNative } from "vue-facing-decorator";
import {
  authorColor,
  authorSlot,
  authorInitials,
} from "../domain/author-color";
import { container } from "../store/container";
import { contrast } from "../theme/theme-format";
// Ink (initials colour) per author slot, computed once per applied theme instead
// of rebuilding the palette and contrast for every avatar mounted while scrolling.
let inkCache: { version: number; inks: Map<number, string> } | null = null;
function authorInk(slot: number) {
  const p = container.preferences;
  const version = p.themeService.version;
  if (!inkCache || inkCache.version !== version)
    inkCache = { version, inks: new Map() };
  let ink = inkCache.inks.get(slot);
  if (!ink) {
    const colors = p.themeService.colors(p.preset, p.custom, p.dark);
    const color = colors[`author-${slot}`]!;
    ink =
      contrast(color, colors["author-ink-light"]!) >
      contrast(color, colors["author-ink-dark"]!)
        ? "var(--author-ink-light)"
        : "var(--author-ink-dark)";
    inkCache.inks.set(slot, ink);
  }
  return ink;
}
@Component
class AuthorAvatar extends Vue {
  @Prop({ default: "" }) readonly name!: string;
  @Prop({ default: "" }) readonly email!: string;
  get color() {
    return authorColor(this.email || this.name);
  }
  get initials() {
    return authorInitials(this.name || this.email.split("@")[0] || "");
  }
  get ink() {
    return authorInk(authorSlot(this.email || this.name));
  }
}
export default toNative(AuthorAvatar);
</script>
<style scoped lang="scss">
.author-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.65em;
  height: 1.65em;
  font-size: calc(var(--font-size-base) * 0.76);
  font-weight: 600;
  border-radius: 50%;
  flex: none;
  vertical-align: middle;
  user-select: none;
}
</style>
