<script setup lang="ts">
import { useRequestFeedback } from "../../../src";

import Section from "./Section.vue";

const requestFeedback = useRequestFeedback();
</script>

<template>
  <Section title="Request Feedback">
    <div style="display: flex; gap: 10px; flex-wrap: wrap">
      <button
        @click="
          (e) =>
            requestFeedback({
              flagKey: 'demo-feature',
              title: 'How satisfied are you with this feature?',
              position: {
                type: 'POPOVER',
                anchor: e.currentTarget as HTMLElement,
              },
            })
        "
      >
        Request Feedback (Popover)
      </button>

      <button
        @click="
          requestFeedback({
            flagKey: 'demo-feature',
            title: 'How was your experience?',
            position: {
              type: 'MODAL',
            },
          })
        "
      >
        Request Feedback (Modal)
      </button>

      <button
        @click="
          requestFeedback({
            flagKey: 'demo-feature',
            title: 'What do you think about our product?',
            position: {
              type: 'MODAL',
            },
            openWithCommentVisible: true,
          })
        "
      >
        Request Feedback (Modal with Comment)
      </button>
    </div>
  </Section>
</template>
