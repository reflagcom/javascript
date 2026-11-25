import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const assertions = `
  assert.equal(typeof ReflagNodeProvider, "function");
  assert.equal(typeof defaultContextTranslator, "function");
  assert.equal(
    defaultContextTranslator({ targetingKey: "user-1" }).user.id,
    "user-1",
  );
`;

const consumers = {
  commonjs: `
    const assert = require("node:assert/strict");
    const {
      ReflagNodeProvider,
      defaultContextTranslator,
    } = require("@reflag/openfeature-node-provider");
    ${assertions}
  `,
  module: `
    import assert from "node:assert/strict";
    import { createRequire } from "node:module";
    import provider, {
      ReflagNodeProvider,
      defaultContextTranslator,
    } from "@reflag/openfeature-node-provider";
    ${assertions}
    const required = createRequire(import.meta.url)("@reflag/openfeature-node-provider");
    const imported = await import("@reflag/openfeature-node-provider");
    assert.equal(imported.ReflagNodeProvider, ReflagNodeProvider);
    assert.equal(ReflagNodeProvider, required.ReflagNodeProvider);
    assert.equal(defaultContextTranslator, required.defaultContextTranslator);
    assert.equal(provider.ReflagNodeProvider, ReflagNodeProvider);
  `,
};

for (const [mode, source] of Object.entries(consumers)) {
  test(`loads the built provider through native Node.js ${mode} resolution`, () => {
    execFileSync(process.execPath, [`--input-type=${mode}`, "--eval", source], {
      cwd,
      timeout: 10000,
      stdio: "pipe",
    });
  });
}
