import { resolve } from "path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import preserveDirectives from "rollup-preserve-directives";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  test: {
    environment: "jsdom",
  },
  optimizeDeps: {
    include: ["@reflag/browser-sdk"],
  },
  plugins: [
    svelte(),
    dts({ insertTypesEntry: true, exclude: ["dev"] }),
    preserveDirectives(),
  ],
  build: {
    exclude: ["**/node_modules/**", "test/e2e/**", "dev"],
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "ReflagSvelteSDK",
      fileName: "reflag-svelte-sdk",
      formats: ["es", "umd"],
    },
    rollupOptions: {
      external: ["svelte", "svelte/store"],
      output: {
        globals: {
          svelte: "Svelte",
          "svelte/store": "SvelteStore",
        },
      },
    },
  },
  server: {
    open: "/dev/plain/index.html",
  },
});