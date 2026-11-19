import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

for (const exitCode of [0, 17]) {
  test(`uses the example's Next CLI, preserves arguments and exits with ${exitCode}`, (t) => {
    const root = mkdtempSync(join(tmpdir(), "reflag-next-cli-test-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));

    function stubNext(directory) {
      const entrypoint = join(directory, "node_modules/next/dist/bin/next");
      mkdirSync(dirname(entrypoint), { recursive: true });
      writeFileSync(
        entrypoint,
        `console.log(JSON.stringify({ entrypoint: __filename, args: process.argv.slice(2) }));
process.exitCode = ${exitCode};`,
      );
      return realpathSync(entrypoint);
    }

    const example = join(root, "example");
    stubNext(root);
    const expectedEntrypoint = stubNext(example);
    const launcher = join(example, "next.cjs");
    copyFileSync(new URL("./next.cjs", import.meta.url), launcher);

    // Launch outside the example so resolving from cwd would select the wrong CLI.
    const args = ["dev", "--hostname", "127.0.0.1", "--port", "3001"];
    const result = spawnSync(process.execPath, [launcher, ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: 5000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.equal(result.status, exitCode, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      entrypoint: expectedEntrypoint,
      args,
    });
  });
}
