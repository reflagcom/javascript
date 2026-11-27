import assert from "node:assert/strict";
import { test } from "node:test";

import { checkReleasePlan, extendReleasePlan } from "./v1-release.mjs";

const cli = {
  name: "@reflag/cli",
  version: "1.0.5",
  path: "packages/cli/package.json",
};
const sdk = {
  name: "@reflag/node-sdk",
  version: "1.8.4",
  path: "packages/node-sdk/package.json",
};
const plan = { [cli.name]: cli.version, [sdk.name]: sdk.version };
const registry = {
  isPublished: async () => false,
  latest: async (name) => (name === cli.name ? "1.0.4" : "1.8.3"),
};

test("keeps the already versioned CLI and adds versions changed by Changesets", () => {
  const previous = { [cli.path]: cli.version, [sdk.path]: "1.8.3" };
  assert.deepEqual(
    extendReleasePlan(
      { [cli.name]: cli.version },
      [cli, sdk],
      (path) => previous[path],
    ),
    plan,
  );
});

test("approves only the next stable patches in the release plan", async () => {
  assert.deepEqual(await checkReleasePlan(plan, [cli, sdk], registry), [
    "@reflag/cli@1.0.5",
    "@reflag/node-sdk@1.8.4",
  ]);
});

test("does not republish an approved version that is already on npm", async () => {
  const pending = await checkReleasePlan(plan, [cli, sdk], {
    ...registry,
    isPublished: async (name) => name === cli.name,
  });
  assert.deepEqual(pending, ["@reflag/node-sdk@1.8.4"]);
});

test("rejects an unrelated unpublished workspace", async () => {
  await assert.rejects(
    checkReleasePlan({ [sdk.name]: sdk.version }, [cli, sdk], registry),
    /Unapproved unpublished version: @reflag\/cli@1\.0\.5/,
  );
});

test("rejects a plan that differs from the checked-out packages or specifies a prerelease", async () => {
  for (const version of ["1.0.6", "1.0.5-next.0"]) {
    await assert.rejects(
      checkReleasePlan({ ...plan, [cli.name]: version }, [cli, sdk], registry),
      /does not match a stable public workspace/,
    );
  }
});

test("does not move latest backward or skip a patch", async () => {
  for (const latest of [
    undefined,
    "0.9.9",
    "2.0.0",
    "1.0.5",
    "1.0.3",
    "1.0.4-next.0",
  ]) {
    await assert.rejects(
      checkReleasePlan({ [cli.name]: cli.version }, [cli], {
        ...registry,
        latest: async () => latest,
      }),
      /expected its next stable patch/,
    );
  }
});
