<script setup lang="ts">
import { ref } from "vue";

import { ReflagProvider } from "../../src";

import Events from "./components/Events.vue";
import MissingKeyMessage from "./components/MissingKeyMessage.vue";
import RequestFeedback from "./components/RequestFeedback.vue";
import Section from "./components/Section.vue";
import StartHuddleButton from "./components/StartHuddleButton.vue";
import Track from "./components/Track.vue";

const user = ref({ id: "123", name: "John Doe" });
const publishableKey = import.meta.env.VITE_PUBLISHABLE_KEY || "";
</script>

<template>
  <div v-if="!publishableKey">
    <MissingKeyMessage />
  </div>
  <ReflagProvider
    v-else
    :publishable-key="publishableKey"
    :user="user"
    :company="{ id: 'acme_inc', plan: 'pro' }"
  >
    <template #loading>......loading......</template>
    <StartHuddleButton />
    <Track />
    <RequestFeedback />

    <Section title="Set User ID">
      <input v-model="user.id" />
    </Section>
    <Events />
  </ReflagProvider>
</template>
