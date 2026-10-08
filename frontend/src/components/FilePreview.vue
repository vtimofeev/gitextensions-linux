<template>
  <div class="file-preview">
    <div
      v-if="imageSource && !content.binary"
      class="preview-tabs"
      role="tablist"
      :aria-label="$t('filePreview')"
    >
      <Button
        :label="$t('image')"
        role="tab"
        :aria-selected="!source"
        :severity="source ? 'secondary' : 'primary'"
        size="small"
        @click="source = false"
      />
      <Button
        :label="$t('source')"
        role="tab"
        :aria-selected="source"
        :severity="source ? 'primary' : 'secondary'"
        size="small"
        @click="source = true"
      />
    </div>
    <ImageViewer
      v-if="imageSource && !source"
      :key="imageSource"
      :src="imageSource"
      :file-name="fileName"
    />
    <p v-else-if="content.binary" class="empty">{{ $t("binaryFile") }}</p>
    <CodeViewer v-else :text="content.text" :file-name="fileName" />
  </div>
</template>
<script lang="ts">
import { Component, Vue, Prop, Watch, toNative } from "vue-facing-decorator";
import Button from "primevue/button";
import CodeViewer from "./CodeViewer.vue";
import ImageViewer from "./ImageViewer.vue";
import type { FileContent } from "../domain/models";
@Component({ components: { Button, CodeViewer, ImageViewer } })
class FilePreview extends Vue {
  @Prop({ required: true }) readonly content!: FileContent;
  @Prop({ required: true }) readonly fileName!: string;
  source = false;
  get imageSource() {
    const { imageMime, imageBase64 } = this.content;
    if (
      !imageBase64 ||
      !/^image\/(png|jpeg|gif|webp|bmp|x-icon|svg\+xml)$/.test(imageMime ?? "")
    )
      return "";
    return `data:${imageMime};base64,${imageBase64}`;
  }
  @Watch("content")
  reset() {
    this.source = false;
  }
}
export default toNative(FilePreview);
</script>
<style scoped>
.file-preview {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.preview-tabs {
  display: flex;
  gap: 0.5rem;
  padding: 0.25rem;
  flex-shrink: 0;
}
</style>
