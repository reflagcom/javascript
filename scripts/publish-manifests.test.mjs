import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertPublishableManifest,
  checkPublishManifests,
} from "./publish-manifests.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

for (const field of [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "devDependencies",
]) {
  test(`rejects workspace ranges in published ${field}`, () => {
    for (const range of ["workspace:*", "workspace:^", "workspace:~2.0.0"]) {
      assert.throws(
        () =>
          assertPublishableManifest({
            name: "@reflag/example",
            [field]: { "@reflag/browser-sdk": range },
          }),
        (error) =>
          error.message.includes(
            `@reflag/example: ${field}.@reflag/browser-sdk uses ${range}`,
          ),
      );
    }
  });
}

test("accepts registry versions and preserves explicit v1 aliases", () => {
  assert.doesNotThrow(() =>
    assertPublishableManifest({
      name: "@reflag/example",
      dependencies: {
        "@reflag/flag-evaluation": "2.0.0",
        "@reflag/browser-sdk": "^2.0.0-next.1",
        "@reflag/node-sdk-v1": "npm:@reflag/node-sdk@1.8.3",
      },
    }),
  );
  assert.doesNotThrow(() =>
    assertPublishableManifest({ name: "no-dependencies" }),
  );
});

test("private examples can continue to require workspace dependencies", () => {
  assert.doesNotThrow(() =>
    assertPublishableManifest({
      name: "private-example",
      private: true,
      dependencies: { "@reflag/node-sdk": "workspace:^" },
    }),
  );
});

test("all publishable workspace manifests are registry-compatible", () => {
  checkPublishManifests(root);
});

test("the normal release path checks source manifests before publication", () => {
  const { scripts } = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );
  assert.equal(
    scripts["check:publish-manifests"],
    "node scripts/publish-manifests.mjs",
  );
  assert.equal(
    scripts.release,
    "yarn check:publish-manifests && changeset publish",
  );
  assert.ok(
    scripts["test:release"].includes("scripts/publish-manifests.test.mjs"),
  );
});

test("Changesets advances registry-compatible ranges with the next prerelease", () => {
  const directory = mkdtempSync(join(tmpdir(), "reflag-registry-ranges-"));
  const writeJSON = (path, value) => {
    const file = join(directory, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value));
  };
  const readJSON = (path) =>
    JSON.parse(readFileSync(join(directory, path), "utf8"));
  try {
    writeJSON("package.json", {
      name: "release-fixture",
      private: true,
      packageManager: "yarn@4.10.3",
      workspaces: ["packages/*"],
    });
    writeFileSync(join(directory, "yarn.lock"), "");
    writeJSON(".changeset/config.json", {
      changelog: false,
      commit: false,
      fixed: [],
      linked: [],
      access: "public",
      baseBranch: "main",
      updateInternalDependencies: "patch",
      ignore: [],
    });
    writeJSON("packages/browser-sdk/package.json", {
      name: "@reflag/browser-sdk",
      version: "2.0.0-next.1",
    });
    writeJSON("packages/react-sdk/package.json", {
      name: "@reflag/react-sdk",
      version: "2.0.0-next.1",
      dependencies: { "@reflag/browser-sdk": "^2.0.0-next.1" },
    });
    writeJSON(".changeset/pre.json", {
      mode: "pre",
      tag: "next",
      initialVersions: {
        "@reflag/browser-sdk": "2.0.0-next.0",
        "@reflag/react-sdk": "2.0.0-next.0",
      },
      changesets: ["sdk-major"],
    });
    for (const [name, type] of [
      ["sdk-major", "major"],
      ["packaging-fix", "patch"],
    ]) {
      writeFileSync(
        join(directory, `.changeset/${name}.md`),
        `---\n"@reflag/browser-sdk": ${type}\n"@reflag/react-sdk": ${type}\n---\n\nSDK release\n`,
      );
    }
    execFileSync(
      process.execPath,
      [fileURLToPath(import.meta.resolve("@changesets/cli/bin.js")), "version"],
      { cwd: directory, stdio: "pipe" },
    );
    assert.equal(
      readJSON("packages/browser-sdk/package.json").version,
      "2.0.0-next.2",
    );
    const react = readJSON("packages/react-sdk/package.json");
    assert.equal(react.version, "2.0.0-next.2");
    assert.equal(react.dependencies["@reflag/browser-sdk"], "^2.0.0-next.2");
    assertPublishableManifest(react);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
