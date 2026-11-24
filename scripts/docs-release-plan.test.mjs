import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { releasePlan, selectReleases } from "./docs-release-plan.mjs";

function fixture(t) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "reflag-docs-release-test-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, version] of [
    ["node-sdk", "2.0.0"],
    ["react-sdk", "2.0.0-next.0"],
    ["management-sdk", "1.9.0"],
    ["cli", "1.0.4"],
  ]) {
    const dir = path.join(root, "packages", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: `@reflag/${name}`, version }),
    );
  }
  return root;
}

test("only stable, actually published SDK/tooling packages enter the plan", (t) => {
  const root = fixture(t);
  assert.deepEqual(
    selectReleases(root, [
      { name: "@reflag/node-sdk", version: "2.0.0" },
      { name: "@reflag/react-sdk", version: "2.0.0-next.0" },
      { name: "@reflag/flag-evaluation", version: "2.0.0" },
    ]),
    [{ name: "@reflag/node-sdk", version: "2.0.0" }],
  );
});

test("an independent or CLI-v1 release cannot select unreleased web SDKs", (t) => {
  const root = fixture(t);
  for (const release of [
    { name: "@reflag/management-sdk", version: "1.9.0" },
    { name: "@reflag/cli", version: "1.0.4" },
  ])
    assert.deepEqual(selectReleases(root, [release]), [release]);
  assert.deepEqual(selectReleases(root, []), []);
});

test("source mismatches, malformed inputs and duplicates fail closed", (t) => {
  const root = fixture(t);
  assert.throws(() => selectReleases(root, {}), /array/);
  assert.throws(
    () => selectReleases(root, [{ name: "../../escape", version: "2.0.0" }]),
    /Invalid published package/,
  );
  assert.throws(
    () => selectReleases(root, [{ name: "@reflag/node-sdk", version: "main" }]),
    /Invalid published version/,
  );
  assert.throws(
    () =>
      selectReleases(root, [{ name: "@reflag/node-sdk", version: "2.0.1" }]),
    /version mismatch/,
  );
  const item = { name: "@reflag/node-sdk", version: "2.0.0" };
  assert.throws(() => selectReleases(root, [item, item]), /Duplicate/);
});

test("release planning requires clean source and an exact package tag", (t) => {
  const root = fixture(t);
  const git = (...args) =>
    execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const commit = (message) => {
    git("add", ".");
    git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "--quiet",
      "-m",
      message,
    );
  };
  git("init", "--quiet");
  commit("Source");
  const published = [{ name: "@reflag/node-sdk", version: "2.0.0" }];
  assert.throws(() => releasePlan(root, published), /Command failed/);
  git("tag", "@reflag/node-sdk@2.0.0");
  assert.deepEqual(releasePlan(root, published), {
    sourceCommit: git("rev-parse", "HEAD"),
    releases: published,
  });
  fs.appendFileSync(path.join(root, "packages/node-sdk/package.json"), "\n");
  assert.throws(() => releasePlan(root, published), /must be clean/);
  commit("Later source");
  assert.throws(
    () => releasePlan(root, published),
    /Release tag\/source mismatch/,
  );
});

test("workflow scopes documentation by release and delegates version routing to the docs importer", () => {
  const release = fs.readFileSync(
    new URL("../.github/workflows/publish.yml", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(release, /rm -rf|cp -R dist\/docs|echo "No docs changes/);
  assert.match(release, /steps\.changesets\.outputs\.publishedPackages/);
  assert.match(release, /steps\.docs\.outputs\.has_docs == 'true'/);
  assert.match(release, /sdk-docs\.mjs ready --destination reflag-docs/);
  assert.match(release, /steps\.docs-site\.outputs\.ready == 'true'/);
  const steps = release.split(/\n      - name: /);
  for (const name of [
    "Build docs",
    "Sync only released packages and majors",
    "Check generated documentation",
    "Commit and push changes",
  ]) {
    const step = steps.find((item) => item.startsWith(`${name}\n`));
    assert(step, `Missing documentation step: ${name}`);
    assert.match(step, /steps\.docs-site\.outputs\.ready == 'true'/);
  }
  assert(
    release.indexOf("sdk-docs.mjs ready") < release.indexOf("run: yarn docs"),
  );
  assert.match(
    release,
    /sdk-docs\.mjs release --source \. --destination reflag-docs --plan/,
  );
  assert.match(release, /node \.github\/scripts\/check-sdk-docs\.mjs/);
  const ci = fs.readFileSync(
    new URL("../.github/workflows/package-ci.yml", import.meta.url),
    "utf8",
  );
  assert.match(ci, /yarn test:docs-publishing/);
});
