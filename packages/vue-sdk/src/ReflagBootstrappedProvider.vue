<script setup lang="ts">
import { onMounted, provide, ref, watch } from "vue";

import { ProviderSymbol, useOnEvent, useReflagClient } from "./hooks";
import type { ReflagBootstrappedProps } from "./types";

const {
  flags,
  initialLoading = false,
  enableTracking = true,
  debug,
  ...config
} = defineProps<ReflagBootstrappedProps>();

const client = useReflagClient(
  {
    ...config,
    ...flags?.context,
    enableTracking,
    bootstrappedFlags: flags?.flags,
  },
  debug,
);

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

// Update the context if it changes
watch(
  () => flags.context,
  (newContext) => {
    void client.setContext(newContext);
  },
  { deep: true },
);

// Update the flags if they change
watch(
  () => flags.flags,
  (newFlags) => {
    client.updateFlags(newFlags);
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
