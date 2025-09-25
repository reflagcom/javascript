<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from "vue";

import { ProviderSymbol, useClientEvent, useReflagClient } from "./hooks";
import type { ReflagProps } from "./types";

// any optional prop which has boolean as part of the type, will default to false
// instead of `undefined`, so we use `withDefaults` here to pass the undefined
// down into the client.
const props = withDefaults(defineProps<ReflagProps>(), {
  enableTracking: true,
});

const { context, user, company, otherContext, ...config } = props;

const resolvedContext = computed(() => ({
  user,
  company,
  other: otherContext,
  ...context,
}));

const client = useReflagClient({
  ...config,
  ...resolvedContext.value,
});

const isLoading = ref(client.getState() === "initializing");
useClientEvent(
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
watch(resolvedContext, () => {
  void client.updateContext(resolvedContext.value);
});

provide(ProviderSymbol, {
  isLoading,
  client,
});
</script>

<template>
  <slot v-if="isLoading && $slots.loading" name="loading" />
  <slot v-else />
</template>
