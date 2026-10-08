<template>
  <Teleport to="#error-notifications">
    <div v-if="message" class="error-notification" role="alert">
      <div class="error-message">{{ message }}</div>
      <div class="error-actions">
        <slot />
        <Button
          icon="pi pi-times"
          text
          severity="secondary"
          :aria-label="$t('closeError')"
          :title="$t('closeError')"
          @click="$emit('dismiss')"
        />
      </div>
    </div>
  </Teleport>
</template>
<script lang="ts">
import { Component, Prop, Vue, toNative } from "vue-facing-decorator";
import Button from "primevue/button";
@Component({ components: { Button }, emits: ["dismiss"] })
class ErrorNotification extends Vue {
  @Prop({ required: true }) readonly message!: string;
}
export default toNative(ErrorNotification);
</script>
<style lang="scss" scoped>
.error-notification {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--color-negative);
  border-radius: var(--radius-md);
  background: var(--color-level-200);
  color: var(--color-negative);
  box-shadow: var(--shadow-sm);
  pointer-events: auto;
}
.error-message {
  flex: 1;
  min-width: 0;
  max-height: 25vh;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
}
.error-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
</style>
