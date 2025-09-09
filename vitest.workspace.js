import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "./packages/openfeature-browser-provider/vite.config.js",
  "./packages/browser-sdk/vitest.config.ts",
  "./packages/openfeature-node-provider/vite.config.js",
  "./packages/node-sdk/vite.config.js",
  "./packages/react-sdk/vite.config.mjs",
  "./packages/vue-sdk/vite.config.mjs",
  "./packages/cli/vite.config.js",
]);
