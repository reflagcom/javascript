import { spawnSync } from "child_process";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

// Use real child processes: mocking process.exit or emitting an EventEmitter
// event cannot verify Node's default signal behavior or event-loop shutdown.
function runProcess(script: string) {
  const flusherPath = resolve(__dirname, "../src/flusher.ts");
  const result = spawnSync(
    process.execPath,
    [
      "-r",
      require.resolve("ts-node/register/transpile-only"),
      "-e",
      `const { subscribe } = require(${JSON.stringify(flusherPath)});
       const flush = async () => {
         await new Promise(resolve => setTimeout(resolve, 20));
         console.log("flushed");
       };
       ${script}`,
    ],
    {
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...process.env,
        TS_NODE_SKIP_PROJECT: "true",
        TS_NODE_COMPILER_OPTIONS: JSON.stringify({
          module: "CommonJS",
          moduleResolution: "Node",
        }),
      },
    },
  );

  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe("");
  return result;
}

describe("flusher process lifecycle", () => {
  it("flushes each client once on natural exit and preserves the exit code", () => {
    const result = runProcess(`
      subscribe(flush);
      subscribe(flush);
      process.exitCode = 7;
    `);

    expect(result.status).toBe(7);
    expect(result.signal).toBeNull();
    expect(result.stdout).toBe("flushed\nflushed\n");
  });

  it("allows an application to flush explicitly and exit without a false warning", () => {
    const result = runProcess(`
      subscribe(flush);
      flush().then(() => process.exit(7));
    `);

    expect(result.status).toBe(7);
    expect(result.signal).toBeNull();
    expect(result.stdout).toBe("flushed\n");
  });

  describe.skipIf(process.platform === "win32")("POSIX signals", () => {
    it.each(["SIGTERM", "SIGINT"])(
      "preserves default termination for unhandled %s",
      (signal) => {
        const result = runProcess(`
          subscribe(flush);
          setInterval(() => {}, 1000);
          setImmediate(() => process.kill(process.pid, "${signal}"));
        `);

        expect(result.status).toBeNull();
        expect(result.signal).toBe(signal);
        expect(result.stdout).toBe("");
      },
    );

    it.each(["before", "after"])(
      "allows async application shutdown registered %s SDK initialization to finish",
      (order) => {
        const registration = `
          process.once("SIGTERM", async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            console.log("shutdown complete");
            process.exitCode = 7;
            clearInterval(keepAlive);
          });
        `;
        const result = runProcess(`
          const keepAlive = setInterval(() => {}, 1000);
          ${order === "before" ? registration : ""}
          subscribe(flush);
          ${order === "after" ? registration : ""}
          setImmediate(() => process.kill(process.pid, "SIGTERM"));
        `);

        expect(result.status).toBe(7);
        expect(result.signal).toBeNull();
        expect(result.stdout).toBe("shutdown complete\nflushed\n");
      },
    );
  });
});
