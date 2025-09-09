<template>
  <div
    style="
      padding: 20px;
      border: 2px solid #ff6b6b;
      border-radius: 8px;
      background-color: #fff5f5;
      color: #d63031;
      font-family: Arial, sans-serif;
    "
  >
    <h3 style="margin: 0 0 10px 0; color: #d63031">Missing Publishable Key</h3>
    <p style="margin: 0; line-height: 1.5">
      The <code>VITE_PUBLISHABLE_KEY</code> environment variable is not set.
      Please set this variable in your <code>.env</code> file to use the Reflag
      SDK.
    </p>
    <p style="margin: 10px 0 0 0; font-size: 14px; opacity: 0.8">
      Example: <code>VITE_PUBLISHABLE_KEY=your_key_here</code>
    </p>
  </div>
</template>

<script setup lang="ts"></script>
