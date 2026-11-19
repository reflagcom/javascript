import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["react-native", "node"] },
  test: {
    environment: "node",
    include: ["test/**/*.test.tsx"],
    setupFiles: ["./test/setup.ts"],
  },
});
