import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { selectReleases } from "./docs-release-plan.mjs";

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

test("workflow scopes documentation by release and delegates version routing to the docs importer", () => {
  const release = fs.readFileSync(
    new URL("../.github/workflows/publish.yml", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(release, /rm -rf|cp -R dist\/docs|echo "No docs changes/);
  assert.match(release, /steps\.changesets\.outputs\.publishedPackages/);
  assert.match(release, /steps\.docs\.outputs\.has_docs == 'true'/);
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
