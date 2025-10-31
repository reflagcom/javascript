import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import preact from "@preact/preset-vite";
import dts from "vite-plugin-dts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    preact(),
    dts(),
    viteStaticCopy({
      targets: [
        {
          src: resolve(__dirname, "lib", "gen", "icons.svg"),
          dest: resolve(__dirname, "dist"),
        },
      ],
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "lib", "index.ts"),
      name: "ReflagIcons",
    },
  },
});
