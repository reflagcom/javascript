import { defineConfig } from "vite";

const API_PORT = Number(process.env.PORT ?? 4100);

export default defineConfig({
  root: __dirname,
  server: {
    port: 5183,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://localhost:${API_PORT}`,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
