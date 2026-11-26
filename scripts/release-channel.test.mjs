import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
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

import getReleasePlan from "@changesets/get-release-plan";

import { releaseChannel } from "./release-channel.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");

test("next prereleases do not promote stable docs", () => {
  assert.equal(releaseChannel({ mode: "pre", tag: "next" }), "next");
});

test("stable docs resume after explicitly exiting prerelease mode", () => {
  assert.equal(releaseChannel({ mode: "exit", tag: "next" }), "latest");
  assert.equal(releaseChannel(undefined), "latest");
});

test("malformed or unexpected release channels fail closed", () => {
  for (const state of [
    null,
    {},
    { mode: "pre" },
    { mode: "pre", tag: "latest" },
    { mode: "pre", tag: "beta" },
    { mode: "invalid", tag: "next" },
  ]) {
    assert.throws(() => releaseChannel(state), /prerelease state/);
  }
});

test("the channel command produces only the GitHub Actions output", () => {
  const path = join(root, ".changeset/pre.json");
  const state = existsSync(path) ? JSON.parse(readFileSync(path)) : undefined;
  const output = execFileSync(
    process.execPath,
    [join(root, "scripts/release-channel.mjs")],
    { encoding: "utf8" },
  );
  assert.equal(output, `prerelease=${releaseChannel(state) === "next"}\n`);
});

test("CLI v1 releases use main and require an explicit publish request", () => {
  const workflow = read(".github/workflows/publish.yml");
  assert.doesNotMatch(workflow, /workflow_dispatch:/);
  assert.match(workflow, /repository_dispatch:\s+types: \[release-cli-v1\]/);
  assert.match(
    workflow,
    /release:\s+if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/,
  );
  assert.match(
    workflow,
    /build-cli-v1:\s+if: github\.event_name == 'repository_dispatch' && github\.ref == 'refs\/heads\/main'/,
  );
  assert.match(
    workflow,
    /publish-cli-v1:\s+needs: build-cli-v1\s+if: \$\{\{ toJSON\(github\.event\.client_payload\.publish\) == 'true' \}\}/,
  );
});

test("all stable-doc publication steps require a stable release channel", () => {
  const workflow = read(".github/workflows/publish.yml").split(
    "\n  build-cli-v1:",
  )[0];
  assert.match(
    workflow,
    /id: release-channel\s+run: node scripts\/release-channel\.mjs >> "\$GITHUB_OUTPUT"/,
  );
  const conditions = workflow
    .split("\n")
    .filter((line) => line.startsWith("        if: "))
    .map((line) => line.trim());
  assert.equal(conditions.length, 7);
  for (const condition of conditions) {
    assert.ok(
      condition.startsWith(
        "if: steps.changesets.outputs.published == 'true' && steps.release-channel.outputs.prerelease == 'false'",
      ),
      `Missing stable release guard: ${condition}`,
    );
  }
  assert.match(workflow, /version: yarn version-packages/);
  assert.match(workflow, /publish: yarn release-packages/);
  assert.match(
    read(".github/workflows/package-ci.yml"),
    /run: yarn test:release/,
  );
});

test("the real Changesets release plan follows the selected channel", async () => {
  // Use the planner directly: `changeset status` also checks git changes, which
  // can reject a correctly versioned release PR with no unconsumed changesets.
  const plan = await getReleasePlan(root);
  const path = join(root, ".changeset/pre.json");
  const state = existsSync(path) ? JSON.parse(readFileSync(path)) : undefined;
  const channel = releaseChannel(state);
  for (const release of plan.releases.filter((item) => item.type !== "none")) {
    assert.match(
      release.newVersion,
      channel === "next" ? /^\d+\.\d+\.\d+-next\.\d+$/ : /^\d+\.\d+\.\d+$/,
      `Unexpected ${channel} version for ${release.name}`,
    );
  }
  // The first version PR must cover the complete v2 SDK family, not Node only.
  // After versioning, consumed changesets need not produce another release.
  if (channel === "next" && state.changesets.length === 0) {
    for (const name of [
      "@reflag/node-sdk",
      "@reflag/browser-sdk",
      "@reflag/react-sdk",
      "@reflag/vue-sdk",
      "@reflag/react-native-sdk",
    ]) {
      assert.ok(
        plan.releases.some(
          (release) => release.name === name && release.type !== "none",
        ),
        `Missing initial prerelease for ${name}`,
      );
    }
  }
});

for (const skipped of ["ignored", "private"]) {
  test(`prerelease exit preserves ${skipped} and unversioned workspaces`, async () => {
    // Backport of changesets/changesets#2092: an absent prerelease counter must
    // not become a patch release of our private, unpublished @reflag/tsconfig.
    const directory = mkdtempSync(join(tmpdir(), "reflag-pre-exit-"));
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
        ignore: skipped === "ignored" ? ["@reflag/tsconfig"] : [],
        privatePackages: { version: skipped !== "private", tag: false },
      });
      writeJSON("packages/sdk/package.json", {
        name: "@reflag/browser-sdk",
        version: "2.0.0-next.1",
        devDependencies: { "@reflag/tsconfig": "0.0.2" },
      });
      writeJSON("packages/tsconfig/package.json", {
        name: "@reflag/tsconfig",
        version: "0.0.2",
        private: true,
      });
      writeJSON("packages/example/package.json", {
        name: "unversioned-example",
        private: true,
      });
      writeJSON(".changeset/pre.json", {
        mode: "exit",
        tag: "next",
        initialVersions: {
          "@reflag/browser-sdk": "2.0.0-next.0",
          "@reflag/tsconfig": "0.0.2",
        },
        changesets: ["sdk-major"],
      });
      writeFileSync(
        join(directory, ".changeset/sdk-major.md"),
        '---\n"@reflag/browser-sdk": major\n---\n\nSDK v2\n',
      );
      const plan = await getReleasePlan(directory);
      assert.deepEqual(
        plan.releases.map(({ name, newVersion }) => ({ name, newVersion })),
        [{ name: "@reflag/browser-sdk", newVersion: "2.0.0" }],
      );
      execFileSync(
        process.execPath,
        [
          fileURLToPath(import.meta.resolve("@changesets/cli/bin.js")),
          "version",
        ],
        { cwd: directory, stdio: "pipe" },
      );
      assert.equal(readJSON("packages/sdk/package.json").version, "2.0.0");
      assert.equal(
        readJSON("packages/sdk/package.json").devDependencies[
          "@reflag/tsconfig"
        ],
        "0.0.2",
      );
      assert.equal(readJSON("packages/tsconfig/package.json").version, "0.0.2");
      assert.equal(
        readJSON("packages/example/package.json").version,
        undefined,
      );
      assert.equal(existsSync(join(directory, ".changeset/pre.json")), false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
