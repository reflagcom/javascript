<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from "vue";

import type {
  CompanyContext,
  ReflagContext,
  UserContext,
} from "@reflag/browser-sdk";

import { ProviderSymbol, useClientEvent, useReflagClient } from "./hooks";
import type { ReflagInitOptionsBase } from "./types";

/**
 * Props for the ReflagProvider.
 */
export type ReflagProps = ReflagInitOptionsBase & {
  /**
   * The context to use for the ReflagClient containing user, company, and other context.
   */
  context?: ReflagContext;

  /**
   * Company related context. If you provide `id` Reflag will enrich the evaluation context with
   * company attributes on Reflag servers.
   * @deprecated Use `context` instead, this property will be removed in the next major version
   */
  company?: CompanyContext;

  /**
   * User related context. If you provide `id` Reflag will enrich the evaluation context with
   * user attributes on Reflag servers.
   * @deprecated Use `context` instead, this property will be removed in the next major version
   */
  user?: UserContext;

  /**
   * Context which is not related to a user or a company.
   * @deprecated Use `context` instead, this property will be removed in the next major version
   */
  otherContext?: Record<string, string | number | undefined>;
};

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
