import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  checkReleasePlan,
  extendReleasePlan,
  legacyTagPlan,
} from "./v1-release.mjs";

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
  tags: async (name) => ({
    legacy: name === cli.name ? "1.0.4" : "1.8.3",
    latest: "2.0.0",
  }),
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

test("does not move legacy backward or skip a patch", async () => {
  for (const legacy of [
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
        tags: async () => ({ legacy, latest: "2.0.0" }),
      }),
      /expected its next stable patch/,
    );
  }
});

test("can start legacy publishing while latest still points at v1", async () => {
  assert.deepEqual(
    await checkReleasePlan(plan, [cli, sdk], {
      ...registry,
      tags: async (name) => ({
        latest: name === cli.name ? "1.0.4" : "1.8.3",
      }),
    }),
    ["@reflag/cli@1.0.5", "@reflag/node-sdk@1.8.4"],
  );
});

const legacyWorkspaces = [
  { name: "@reflag/browser-sdk", version: "1.7.4" },
  cli,
  sdk,
  { name: "@reflag/react-native-sdk", version: "0.3.7" },
  { name: "@reflag/react-sdk", version: "1.7.4" },
  { name: "@reflag/vue-sdk", version: "1.5.7" },
];
const tagRegistry = {
  isPublished: async () => true,
  tags: async () => ({ latest: "2.0.0" }),
};

test("seeds only the six coordinated legacy packages, including pre-1.0 Native", async () => {
  assert.deepEqual(
    await legacyTagPlan(
      [
        ...legacyWorkspaces,
        { name: "@reflag/management-sdk", version: "0.1.0" },
      ],
      tagRegistry,
    ),
    legacyWorkspaces.map(({ name, version }) => `${name}@${version}`),
  );
});

test("legacy tag seeding is idempotent and does not use latest as its target", async () => {
  assert.deepEqual(
    await legacyTagPlan(legacyWorkspaces, {
      ...tagRegistry,
      tags: async (name) => ({
        latest: "2.0.0",
        legacy: legacyWorkspaces.find((pkg) => pkg.name === name).version,
      }),
    }),
    [],
  );
});

test("refuses missing, unpublished, prerelease, or v2 legacy tag targets", async () => {
  for (const version of [undefined, "2.0.0", "1.8.4-next.0", "not-a-version"]) {
    const packages = legacyWorkspaces.filter((pkg) => pkg.name !== sdk.name);
    if (version !== undefined) packages.push({ ...sdk, version });
    await assert.rejects(
      legacyTagPlan(packages, tagRegistry),
      /Expected a published pre-v2 workspace version/,
    );
  }
  await assert.rejects(
    legacyTagPlan(legacyWorkspaces, {
      ...tagRegistry,
      isPublished: async (name) => name !== sdk.name,
    }),
    /Expected a published pre-v2 workspace version/,
  );
});

test("never replaces an existing legacy tag during seeding", async () => {
  for (const legacy of ["1.8.3", "1.8.5", "2.0.0"]) {
    await assert.rejects(
      legacyTagPlan(legacyWorkspaces, {
        ...tagRegistry,
        tags: async (name) => ({
          legacy: name === sdk.name ? legacy : undefined,
        }),
      }),
      /Refusing to replace existing npm legacy/,
    );
  }
});

test("the maintenance publisher never selects latest", () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url)),
  );
  assert.equal(
    pkg.scripts["publish-v1-packages"],
    "node scripts/v1-release.mjs check && yarn release --tag legacy",
  );
  const workflow = readFileSync(
    new URL("../.github/workflows/publish.yml", import.meta.url),
    "utf8",
  );
  const seedJob = workflow.split("  legacy-tags:\n")[1];
  assert.match(seedJob, /github\.event_name == 'workflow_dispatch'/);
  assert.match(seedJob, /github\.ref == 'refs\/heads\/maintenance\/v1'/);
  assert.match(seedJob, /vars\.V1_PUBLISH_ENABLED == 'true'/);
  assert.match(seedJob, /environment: npm-v1-release/);
  assert.match(seedJob, /id-token: write/);
  assert.match(
    seedJob,
    /test "\$GITHUB_REF_PROTECTED" = true && test "\$head" = "\$GITHUB_SHA"/,
  );
  assert.match(seedJob, /run: node scripts\/v1-release\.mjs tag-legacy/);
});
