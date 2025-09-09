import { resolve } from "path";
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
    dts({ insertTypesEntry: true, exclude: ["dev"] }),
    preserveDirectives(),
  ],
  build: {
    exclude: ["**/node_modules/**", "test/e2e/**", "dev"],
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, "src/index.tsx"),
      name: "ReflagReactSDK",
      fileName: "reflag-react-sdk",
      formats: ["es", "umd"],
    },
    rollupOptions: {
      external: ["react", "react-dom"],
      output: {
        globals: {
          react: "React",
        },
      },
    },
  },
  server: {
    open: "/dev/plain/index.html",
  },
});
