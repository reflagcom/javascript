<script setup lang="ts">
import { onMounted, provide, ref, watch } from "vue";

import { ProviderSymbol, useOnEvent, useReflagClient } from "./hooks";
import type { ReflagBootstrappedProps } from "./types";

const {
  flags,
  initialLoading = false,
  enableTracking = true,
  logger,
  debug,
  enableLiveFlagUpdates = undefined,
  ...config
} = defineProps<ReflagBootstrappedProps>();

const client = useReflagClient({
  ...config,
  enableTracking,
  enableLiveFlagUpdates,
  bootstrappedState: flags,
  debug,
  logger,
});

const isLoading = ref(
  client.getState() !== "initialized" ? initialLoading : false,
);
useOnEvent(
  "stateUpdated",
  (state) => {
    isLoading.value = state === "initializing";
  },
  client,
);

// Initialize the client if it is not already initialized
onMounted(() => {
  if (client.getState() !== "idle") return;
  void client.initialize().catch((e) => {
    client.logger.error("failed to initialize client", e);
  });
});

// Update the bootstrapped state if it changes
watch(
  () => flags,
  (newFlags) => {
    client.applyBootstrappedState(newFlags);
  },
  { deep: true },
);

provide(ProviderSymbol, {
  isLoading,
  client,
});
</script>

<template>
  <slot v-if="isLoading && $slots.loading" name="loading" />
  <slot v-else />
</template>
