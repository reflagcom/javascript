<script setup lang="ts">
defineProps<{
  title: string;
}>();
</script>
<template>
  <div
    style="
      padding: 20px;
      margin: 10px;
      border: 2px solid;
      border-radius: 8px;

      font-family: Arial, sans-serif;
    "
  >
    <h3 style="margin: 0 0 10px 0">{{ title }}</h3>
    <div style="margin: 10px 0 0 0">
      <slot />
    </div>
  </div>
</template>
