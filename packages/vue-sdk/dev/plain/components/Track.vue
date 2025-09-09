<script setup lang="ts">
import { useTrack } from "../../../src";

import Section from "./Section.vue";

const track = useTrack();
</script>

<template>
  <Section title="Custom track event">
    <button @click="track('Huddle Started', { huddleType: 'voice' })">
      Send custom track event
    </button>
  </Section>
</template>
