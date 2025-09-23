import { defineConfig } from "vite";
import { defaultExclude } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: [...defaultExclude, "**/examples/**"],
  },
});
