<template>
  <Section title="Flags List">
    <div v-if="!client">
      <p>Client not available</p>
    </div>
    <div v-else>
      <p>This list shows all available flags and their current state:</p>
      <ul
        v-if="flagEntries.length > 0"
        style="list-style-type: none; padding: 0"
      >
        <li
          v-for="[flagKey, feature] in flagEntries"
          :key="flagKey"
          style="
            margin-bottom: 10px;
            padding: 10px;
            border: 1px solid #ccc;
            border-radius: 4px;
          "
        >
          <div style="display: flex; align-items: center; gap: 10px">
            <strong>{{ flagKey }}</strong>
            <span
              :style="{
                color:
                  (feature.isEnabledOverride ?? feature.isEnabled)
                    ? 'green'
                    : 'red',
              }"
            >
              {{
                (feature.isEnabledOverride ?? feature.isEnabled)
                  ? "Enabled"
                  : "Disabled"
              }}
            </span>

            <!-- Reset button if override is active -->
            <button
              v-if="feature.isEnabledOverride !== null"
              style="margin-left: 10px; padding: 2px 8px; font-size: 12px"
              @click="() => resetOverride(flagKey)"
            >
              Reset
            </button>

            <!-- Toggle checkbox -->
            <input
              type="checkbox"
              :checked="feature.isEnabledOverride ?? feature.isEnabled"
              style="margin-left: auto"
              @change="(e) => toggleFlag(flagKey, e.target.checked)"
            />
          </div>

          <!-- Show config if available -->
          <div
            v-if="feature.config && feature.config.key"
            style="margin-top: 5px; font-size: 12px; color: #666"
          >
            <strong>Config:</strong>
            <pre
              style="
                margin: 2px 0;
                padding: 4px;
                background: #f5f5f5;
                border-radius: 2px;
                overflow: auto;
              "
              >{{ JSON.stringify(feature.config.payload, null, 2) }}</pre
            >
          </div>
        </li>
      </ul>
      <p v-else style="color: #666; font-style: italic">No flags available</p>
    </div>
  </Section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";

import { useClient } from "../../../src";

import Section from "./Section.vue";

const client = useClient();
const flagsData = ref({});

// Update flags data when flags are updated
function updateFlags() {
  if (client.value) {
    flagsData.value = client.value.getFlags();
  }
}

// Initial load
updateFlags();

// Listen for flag updates
if (client.value) {
  client.value.on("flagsUpdated", updateFlags);
  onBeforeUnmount(() => {
    client.value?.off("flagsUpdated", updateFlags);
  });
}

const flagEntries = computed(() => {
  return Object.entries(flagsData.value);
});

function resetOverride(flagKey: string) {
  if (client.value) {
    client.value.getFlag(flagKey).setIsEnabledOverride(null);
    updateFlags();
  }
}

function toggleFlag(flagKey: string, checked: boolean) {
  if (client.value) {
    // Use simplified logic similar to React implementation
    client.value.getFlag(flagKey).setIsEnabledOverride(checked);
    updateFlags();
  }
}
</script>
