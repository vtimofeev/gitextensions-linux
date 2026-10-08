<template>
  <div class="stack profiles-settings">
    <p class="muted">{{ $t("identityLocal") }}</p>
    <p class="muted">{{ $t("profileRulesSaved") }}</p>
    <fieldset v-for="profile in preferences.profiles" :key="profile.id">
      <legend>{{ profile.label }}</legend>
      <div class="profile-fields">
        <label
          >{{ $t("profileLabel")
          }}<input
            v-model="profile.label"
            :aria-label="$t('profileLabel')" /></label
        ><label
          >{{ $t("profileName")
          }}<input
            v-model="profile.name"
            :aria-label="$t('profileName')" /></label
        ><label
          >{{ $t("profileEmail")
          }}<input
            v-model="profile.email"
            type="email"
            :aria-label="$t('profileEmail')" /></label
        ><label
          >{{ $t("avatarColor")
          }}<select
            v-model="profile.color"
            :style="{ color: profile.color }"
            :aria-label="$t('avatarColor')"
          >
            <option
              v-for="color in [...new Set([profile.color, ...colors])]"
              :key="color"
              :value="color"
            >
              {{ color }}
            </option>
          </select></label
        >
      </div>
      <details class="profile-repositories">
        <summary :title="repositories(profile.id).join('\n')">
          {{ $t("profileUsedBy", { n: repositories(profile.id).length }) }}
        </summary>
        <div
          v-for="path in repositories(profile.id)"
          :key="path"
          class="repository-row"
        >
          <span>{{ path }}</span>
          <Button
            :label="$t('forget')"
            text
            :aria-label="$t('forget') + ': ' + path"
            @click="preferences.rememberProfile(path)"
          />
        </div>
      </details>
      <div class="actions">
        <Button
          :label="$t('duplicate')"
          text
          @click="duplicate(profile)"
        /><Button
          :label="$t('delete')"
          text
          severity="danger"
          @click="remove(profile.id)"
        />
      </div>
    </fieldset>
    <Button :label="$t('addProfile')" severity="secondary" @click="add" />
    <h3>{{ $t("pathRules") }}</h3>
    <p class="muted">{{ $t("rulesHint") }}</p>
    <div
      v-for="(rule, index) in preferences.rules"
      :key="index"
      class="rule-row"
    >
      <input
        v-model="rule.pattern"
        :placeholder="$t('rulePattern')"
        :aria-label="$t('rulePattern')"
      /><span>→</span
      ><select v-model="rule.profileId" :aria-label="$t('profiles')">
        <option
          v-for="profile in preferences.profiles"
          :key="profile.id"
          :value="profile.id"
        >
          {{ profile.label }}
        </option></select
      ><Button
        icon="pi pi-trash"
        text
        :aria-label="$t('delete')"
        :title="$t('delete')"
        @click="preferences.rules.splice(index, 1)"
      />
    </div>
    <Button
      :label="$t('addRule')"
      severity="secondary"
      :disabled="!preferences.profiles.length"
      @click="
        preferences.rules.push({
          pattern: '',
          profileId: preferences.profiles[0]!.id,
        })
      "
    />
  </div>
</template>
<script lang="ts">
import { Component, Vue, toNative } from "vue-facing-decorator";
import Button from "primevue/button";
import { container } from "../store/container";
import { ThemeService } from "../theme/theme-service";
import type { IdentityProfile } from "../store/preferences";
@Component({ components: { Button } })
class ProfilesSettings extends Vue {
  get preferences() {
    return container.preferences;
  }
  repositories(id: string) {
    return this.preferences.repositoriesForProfile(id);
  }
  get colors() {
    const p = this.preferences;
    const colors = new ThemeService().colors(p.preset, p.custom, p.dark);
    return Array.from({ length: 8 }, (_, i) => colors[`graph-lane-${i + 1}`]!);
  }
  id() {
    return crypto.randomUUID();
  }
  add() {
    this.preferences.profiles.push({
      id: this.id(),
      label: "",
      name: "",
      email: "",
      color: this.colors[0]!,
    });
  }
  duplicate(profile: IdentityProfile) {
    this.preferences.profiles.push({ ...profile, id: this.id() });
  }
  remove(id: string) {
    this.preferences.profiles = this.preferences.profiles.filter(
      (p) => p.id !== id,
    );
    this.preferences.rules = this.preferences.rules.filter(
      (r) => r.profileId !== id,
    );
  }
}
export default toNative(ProfilesSettings);
</script>
<style lang="scss" scoped>
.profiles-settings {
  gap: 12px;
  fieldset {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }
}
.profile-repositories {
  margin-top: 8px;
  font-size: var(--text-xs);
  summary {
    cursor: pointer;
    color: var(--color-text-secondary);
  }
}
.repository-row {
  display: flex;
  align-items: center;
  gap: 8px;
  span {
    flex: 1;
    overflow-wrap: anywhere;
  }
}
.profile-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.rule-row {
  display: flex;
  gap: 8px;
  align-items: center;
  input {
    flex: 2;
  }
  select {
    flex: 1;
  }
}
</style>
