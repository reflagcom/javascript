<script setup lang="ts">
import { provide, ref } from "vue";

import type { ReflagClient } from "@reflag/browser-sdk";

import { ProviderSymbol, useClientEvent } from "./hooks";

/**
 * Props for the ReflagClientProvider.
 */
export type ReflagClientProviderProps = {
  /**
   * A pre-initialized ReflagClient to use.
   */
  client: ReflagClient;
};

const props = defineProps<ReflagClientProviderProps>();

const isLoading = ref(props.client.getState() === "initializing");
useClientEvent(
  "stateUpdated",
  (state) => {
    isLoading.value = state === "initializing";
  },
  props.client,
);

provide(ProviderSymbol, {
  isLoading,
  client: props.client,
});
</script>

<template>
  <slot v-if="isLoading && $slots.loading" name="loading" />
  <slot v-else />
</template>
