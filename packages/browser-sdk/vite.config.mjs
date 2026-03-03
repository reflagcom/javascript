import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { defaultExclude } from "vitest/config";

export default defineConfig({
  test: {
    root: __dirname,
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    exclude: [...defaultExclude, "test/e2e/**"],
  },
  plugins: [
    dts({ insertTypesEntry: true }),
    viteStaticCopy({
      targets: [
        {
          src: "src/index.native.js",
          dest: ".",
        },
      ],
    }),
  ],
  build: {
    exclude: ["**/node_modules/**", "test/e2e/**"],
    sourcemap: true,
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, "src/index.ts"),
      name: "ReflagBrowserSDK",
      // the proper extensions will be added
      fileName: "reflag-browser-sdk",
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      // external: ["vue"],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
          ReflagClient: "ReflagClient",
        },
      },
    },
  },
});
