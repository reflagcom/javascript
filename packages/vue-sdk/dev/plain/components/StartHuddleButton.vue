<script setup lang="ts">
import { useFlag } from "../../../src";

import Section from "./Section.vue";

const { isLoading, isEnabled, config, requestFeedback, track } =
  useFlag("huddle");
</script>
<template>
  <Section title="Huddle">
    <div style="display: flex; gap: 10px; flex-wrap: wrap">
      <div>Huddle enabled: {{ isEnabled }}</div>
      <div v-if="isLoading">Loading...</div>
      <div v-else style="display: flex; gap: 10px; flex-wrap: wrap">
        <div>
          <button @click="track()">
            {{ config?.payload?.buttonTitle ?? "Start Huddle (track event)" }}
          </button>
        </div>
        <div>
          <button
            @click="
              (e) =>
                requestFeedback({
                  title: 'Do you like huddles?',
                })
            "
          >
            Trigger survey
          </button>
        </div>
      </div>
    </div>
  </Section>
</template>
