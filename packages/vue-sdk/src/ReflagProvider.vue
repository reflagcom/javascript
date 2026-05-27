<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from "vue";

import { ProviderSymbol, useOnEvent, useReflagClient } from "./hooks";
import type { ReflagProps } from "./types";

const {
  context,
  user,
  company,
  otherContext,
  initialLoading = true,
  enableTracking = true,
  logger,
  debug,
  enableLiveFlagUpdates = undefined,
  ...config
} = defineProps<ReflagProps>();

const resolvedContext = computed(() => ({
  user,
  company,
  other: otherContext,
  ...context,
}));

const client = useReflagClient({
  ...config,
  ...resolvedContext.value,
  enableTracking,
  enableLiveFlagUpdates,
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

// Update the context if it changes
watch(
  () => resolvedContext,
  () => {
    void client.setContext(resolvedContext.value);
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
