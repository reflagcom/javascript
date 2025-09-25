<script setup lang="ts">
import { computed, ref } from "vue";

import { ReflagBootstrappedProvider, ReflagProvider } from "../../src";

import Events from "./components/Events.vue";
import FlagsList from "./components/FlagsList.vue";
import MissingKeyMessage from "./components/MissingKeyMessage.vue";
import RequestFeedback from "./components/RequestFeedback.vue";
import Section from "./components/Section.vue";
import StartHuddlesButton from "./components/StartHuddlesButton.vue";
import Track from "./components/Track.vue";

// Initial context
const initialUser = { id: "demo-user", email: "demo-user@example.com" };
const initialCompany = { id: "demo-company", name: "Demo Company" };
const initialOtherContext = { test: "test" };

const user = ref(initialUser);
const publishableKey = import.meta.env.VITE_PUBLISHABLE_KEY || "";
const apiBaseUrl = import.meta.env.VITE_REFLAG_API_BASE_URL;

// Check for bootstrapped query parameter
const isBootstrapped = computed(() => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("bootstrapped") !== null;
});
</script>

<template>
  <div v-if="!publishableKey">
    <MissingKeyMessage />
  </div>

  <!-- Bootstrapped Provider -->
  <ReflagBootstrappedProvider
    v-else-if="isBootstrapped"
    :publishable-key="publishableKey"
    :flags="{
      context: {
        user: initialUser,
        company: initialCompany,
        otherContext: initialOtherContext,
      },
      flags: {
        huddles: {
          key: 'huddles',
          isEnabled: true,
        },
      },
    }"
    :api-base-url="apiBaseUrl"
  >
    <template #loading>......loading......</template>
    <h1>Vue SDK (Bootstrapped)</h1>
    <StartHuddlesButton />
    <Track />
    <RequestFeedback />

    <Section title="Set User ID">
      <input v-model="user.id" />
    </Section>
    <Events />
    <FlagsList />
  </ReflagBootstrappedProvider>

  <!-- Regular Provider -->
  <ReflagProvider
    v-else
    :publishable-key="publishableKey"
    :user="user"
    :company="initialCompany"
    :other-context="initialOtherContext"
    :api-base-url="apiBaseUrl"
  >
    <template #loading>......loading......</template>
    <h1>Vue SDK</h1>
    <StartHuddlesButton />
    <Track />
    <RequestFeedback />

    <Section title="Set User ID">
      <input v-model="user.id" />
    </Section>
    <Events />
    <FlagsList />
  </ReflagProvider>
</template>
