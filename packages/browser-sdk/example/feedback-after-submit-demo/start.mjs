import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createServer } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));

const api = spawn(process.execPath, [path.join(dir, "server.mjs")], {
  stdio: "inherit",
});

const vite = await createServer({ configFile: path.join(dir, "vite.config.mjs") });
await vite.listen();
vite.printUrls();

function shutdown() {
  api.kill();
  vite.close().finally(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
api.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error(`[mock-api] exited with code ${code}`);
    shutdown();
  }
});
