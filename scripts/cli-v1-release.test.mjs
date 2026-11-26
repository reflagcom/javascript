import assert from "node:assert/strict";
import { test } from "node:test";

import { assertCliV1Release } from "./cli-v1-release.mjs";

const cli = { name: "@reflag/cli", version: "1.0.5" };

test("accepts the next stable CLI v1 patch", () => {
  assert.doesNotThrow(() => assertCliV1Release(cli, "1.0.5", "1.0.4"));
});

test("does not let a maintenance release move latest if it no longer points at a stable v1", () => {
  for (const latest of [undefined, "0.9.9", "1.0.4-next.1", "2.0.0"]) {
    assert.throws(
      () => assertCliV1Release(cli, "1.0.5", latest),
      /not a stable CLI v1/,
    );
  }
});

test("rejects skipped patches, already released versions, and downgrades", () => {
  for (const latest of ["1.0.3", "1.0.5", "1.0.6", "1.1.1"]) {
    assert.throws(
      () => assertCliV1Release(cli, "1.0.5", latest),
      /Expected the next CLI v1 patch/,
    );
  }
});

test("rejects unconfirmed, prerelease, and different package versions", () => {
  for (const version of [undefined, "1.0.6", "1.0.5-next.0", "2.0.0"]) {
    assert.throws(
      () => assertCliV1Release(cli, version, "1.0.4"),
      /must match the packaged version/,
    );
  }
});

test("rejects building a different or private package", () => {
  for (const manifest of [
    { ...cli, name: "@reflag/node-sdk" },
    { ...cli, private: true },
  ]) {
    assert.throws(
      () => assertCliV1Release(manifest, "1.0.5", "1.0.4"),
      /Expected the public @reflag\/cli package/,
    );
  }
});
