<script setup lang="ts">
import {
  useFlag,
  useIsLoading,
  useRequestFeedback,
  useTrack,
} from "../../../src";
import Section from "./Section.vue";

const enabled = useFlag("huddles");
const isLoading = useIsLoading();
const track = useTrack();
const requestFeedback = useRequestFeedback();
</script>

<template>
  <Section title="Huddles">
    <div>huddles enabled: {{ enabled }}</div>
    <div v-if="isLoading">Loading...</div>
    <div v-else-if="enabled">
      <button @click="track('Started huddles')">
        Start Huddles (track event)
      </button>
      <button
        @click="
          requestFeedback({ flagKey: 'huddles', title: 'Do you like huddles?' })
        "
      >
        Trigger survey
      </button>
    </div>
  </Section>
</template>
