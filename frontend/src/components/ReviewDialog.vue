<template>
  <Dialog
    :visible="review.visible"
    modal
    :closable="!review.starting"
    :close-on-escape="!review.starting"
    :header="$t('codeReview')"
    :style="{ width: '680px' }"
    @update:visible="review.close()"
  >
    <form
      class="dialog-form review-form"
      @submit.prevent="start"
      @keydown.ctrl.enter.prevent.stop="start"
    >
      <p class="review-target">
        {{
          review.commit
            ? review.commit.hash.slice(0, 8) + " " + review.commit.subject
            : $t("uncommittedChanges")
        }}
      </p>
      <label
        >{{ $t("reviewTool")
        }}<select
          v-model="review.tool"
          :aria-label="$t('reviewTool')"
          :disabled="review.busy"
        >
          <option v-for="name in names" :key="name" :value="name">
            {{ labels[name] }}
          </option>
        </select></label
      >
      <label
        >{{ $t("reviewInstructions")
        }}<textarea
          v-model="review.instructions"
          :aria-label="$t('reviewInstructions')"
          rows="7"
          :disabled="review.busy"
        />
      </label>
      <label class="check"
        ><input
          v-model="review.saveDefault"
          type="checkbox"
          :disabled="review.busy"
        />{{ $t("reviewSaveDefault") }}</label
      >
      <label
        >{{ $t("reviewDetails")
        }}<textarea
          v-model="review.details"
          :aria-label="$t('reviewDetails')"
          rows="4"
          :disabled="review.busy"
        />
      </label>
      <ErrorNotification :message="review.error" @dismiss="review.error = ''" />
      <div class="actions">
        <Button
          :label="$t('cancel')"
          severity="secondary"
          :disabled="review.busy"
          @click="review.close()"
        /><Button
          type="submit"
          :label="$t('reviewStart')"
          :disabled="!review.canStart"
        />
      </div>
    </form>
  </Dialog>
</template>
<script lang="ts">
import ErrorNotification from "./ErrorNotification.vue";
import { Component, Vue, toNative } from "vue-facing-decorator";
import Dialog from "primevue/dialog";
import Button from "primevue/button";
import { container } from "../store/container";
import { reviewToolNames, reviewToolLabels } from "../domain/review";
@Component({ components: { ErrorNotification, Dialog, Button } })
class ReviewDialog extends Vue {
  names = reviewToolNames;
  labels = reviewToolLabels;
  get review() {
    return container.review;
  }
  async start() {
    const label = this.review.toolLabel;
    const result = await this.review.start();
    if (result !== null) {
      container.repository.reviewStatus = this.$t("reviewStarted", {
        tool: label,
      });
      if (result === "details-truncated")
        container.repository.notice = this.$t("reviewTruncated");
    }
  }
}
export default toNative(ReviewDialog);
</script>
<style lang="scss" scoped>
.review-target {
  overflow-wrap: anywhere;
  margin: 0;
}
.review-form textarea {
  resize: vertical;
}
</style>
