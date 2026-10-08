<template>
  <div class="image-viewer">
    <div class="image-actions">
      <Button
        :label="$t('zoomOut')"
        icon="pi pi-minus"
        text
        size="small"
        :disabled="!ready || scale <= 0.01"
        @click="zoom(1 / 1.25)"
      />
      <output :aria-label="$t('imageZoom')"
        >{{ Math.round(scale * 100) }}%</output
      >
      <Button
        :label="$t('zoomIn')"
        icon="pi pi-plus"
        text
        size="small"
        :disabled="!ready || scale >= 16"
        @click="zoom(1.25)"
      />
      <Button
        :label="$t('imageFit')"
        text
        size="small"
        :disabled="!ready"
        @click="fit"
      />
      <Button
        label="100%"
        text
        size="small"
        :disabled="!ready"
        @click="actualSize"
      />
      <span v-if="ready" class="muted">{{ width }} × {{ height }}</span>
    </div>
    <p v-if="failed" class="empty" role="status">{{ $t("imageFailed") }}</p>
    <div v-else ref="viewport" class="image-viewport" @wheel="wheel">
      <div class="image-canvas">
        <img
          :src="src"
          :alt="fileName"
          :style="
            ready
              ? { width: width * scale + 'px', height: height * scale + 'px' }
              : { visibility: 'hidden' }
          "
          draggable="false"
          @load="loaded"
          @error="failed = true"
        />
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import { Component, Vue, Prop, Watch, toNative } from "vue-facing-decorator";
import Button from "primevue/button";
@Component({ components: { Button } })
class ImageViewer extends Vue {
  @Prop({ required: true }) readonly src!: string;
  @Prop({ required: true }) readonly fileName!: string;
  width = 0;
  height = 0;
  scale = 1;
  fitted = true;
  failed = false;
  private observer?: ResizeObserver;
  get ready() {
    return this.width > 0 && this.height > 0 && !this.failed;
  }
  @Watch("src")
  reset() {
    this.width = this.height = 0;
    this.scale = 1;
    this.fitted = true;
    this.failed = false;
  }
  mounted() {
    this.observer = new ResizeObserver(() => {
      if (this.fitted && this.ready) this.fit();
    });
    this.observer.observe(this.$el);
  }
  beforeUnmount() {
    this.observer?.disconnect();
  }
  loaded(event: Event) {
    const image = event.target as HTMLImageElement;
    this.width = image.naturalWidth;
    this.height = image.naturalHeight;
    this.fit();
  }
  fit() {
    const viewport = this.$refs.viewport as HTMLElement | undefined;
    if (!viewport || !this.ready) return;
    this.fitted = true;
    this.scale = Math.min(
      1,
      Math.max(1, viewport.clientWidth - 32) / this.width,
      Math.max(1, viewport.clientHeight - 32) / this.height,
    );
    viewport.scrollTop = viewport.scrollLeft = 0;
  }
  actualSize() {
    this.fitted = false;
    this.scale = 1;
  }
  zoom(factor: number) {
    this.fitted = false;
    this.scale = Math.max(0.01, Math.min(16, this.scale * factor));
  }
  wheel(event: WheelEvent) {
    if (!event.ctrlKey) return;
    event.preventDefault();
    if (this.ready) this.zoom(event.deltaY < 0 ? 1.25 : 1 / 1.25);
  }
}
export default toNative(ImageViewer);
</script>
<style scoped lang="scss">
.image-viewer {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.image-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
  padding: 0.25rem;
}
.image-viewport {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background-color: var(--color-surface);
  background-image: conic-gradient(
    #8882 25%,
    transparent 0 50%,
    #8882 0 75%,
    transparent 0
  );
  background-size: 20px 20px;
}
.image-canvas {
  display: flex;
  width: max-content;
  min-width: 100%;
  min-height: 100%;
  padding: 16px;
  box-sizing: border-box;
}
img {
  display: block;
  flex-shrink: 0;
  max-width: none;
  max-height: none;
  margin: auto;
}
</style>
