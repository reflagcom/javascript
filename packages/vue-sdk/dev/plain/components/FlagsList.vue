<script setup lang="ts">
import { ref } from "vue";
import { useClient, useOnEvent } from "../../../src";
import Section from "./Section.vue";

const client = useClient();
const flags = ref(client.getFlagResults());
useOnEvent("flagsUpdated", () => {
  flags.value = client.getFlagResults();
});
</script>

<template>
  <Section title="Flags List">
    <ul>
      <li v-for="(flag, key) in flags" :key="key">
        <strong>{{ key }}</strong
        >: {{ JSON.stringify(flag.value) }}
        <template v-if="typeof flag.value === 'boolean'">
          <input
            type="checkbox"
            :checked="flag.value"
            @change="
              client.setFlagOverride(
                String(key),
                ($event.target as HTMLInputElement).checked,
              )
            "
          />
          <button
            v-if="client.getFlagOverride(String(key)) !== undefined"
            @click="client.setFlagOverride(String(key), undefined)"
          >
            Reset
          </button>
        </template>
      </li>
    </ul>
  </Section>
</template>
