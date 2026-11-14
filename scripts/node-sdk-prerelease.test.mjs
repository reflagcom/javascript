import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parse } from "yaml";

import {
  assertSuccessfulChecks,
  assertPublicationEnvironment,
  inspectTarball,
  prepare,
  verify,
  validateInputs,
  validateManifest,
  validateRegistry,
} from "./node-sdk-prerelease.mjs";

const version = "2.0.0-next.0";
const sha = "0809be2b95f43fa1785c6b7b188c03ac8fd40965";
const manifest = {
  name: "@reflag/node-sdk",
  version,
  repository: { url: "https://github.com/reflagcom/javascript.git" },
  publishConfig: { access: "public" },
  main: "./dist/src/index.js",
  types: "./dist/types/src/index.d.ts",
  dependencies: { "@reflag/flag-evaluation": "2.0.0" },
};

function tarballFixture(fn) {
  const root = mkdtempSync(join(tmpdir(), "reflag-prerelease-test-"));
  const directory = join(root, "package");
  mkdirSync(join(directory, "dist/src"), { recursive: true });
  mkdirSync(join(directory, "dist/types/src"), { recursive: true });
  writeFileSync(join(directory, "package.json"), JSON.stringify(manifest));
  writeFileSync(join(directory, "dist/package.json"), JSON.stringify(manifest));
  writeFileSync(join(directory, "dist/src/index.js"), "module.exports = {};\n");
  writeFileSync(join(directory, "dist/types/src/index.d.ts"), "export {};\n");
  writeFileSync(join(directory, "README.md"), "Test fixture\n");
  const archive = join(root, "candidate.tgz");
  const pack = () =>
    execFileSync("tar", ["-czf", archive, "-C", root, "package"]);
  try {
    fn({ directory, archive, pack });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("only explicit next versions and immutable commit SHAs are accepted", () => {
  validateInputs(version, sha);
  validateInputs("2.0.0-next.12", sha);
  for (const invalid of [
    "2.0.0",
    "2.0.0-rc.0",
    "1.8.3",
    "3.0.0-next.0",
    "2.0.0-next.01",
    "2.0.0-next.0\n",
    "next",
    undefined,
  ]) {
    assert.throws(() => validateInputs(invalid, sha));
  }
  for (const invalid of [
    "main",
    "feature/node-sdk-v2",
    sha.slice(0, 7),
    sha.toUpperCase(),
    `${sha};echo bad`,
    undefined,
  ]) {
    assert.throws(() => validateInputs(version, invalid));
  }
});

test("requires successful GitHub Actions Build & Test checks for the exact SHA", () => {
  const check = {
    name: "Build & Test",
    app: { slug: "github-actions" },
    head_sha: sha,
    status: "completed",
    conclusion: "success",
  };
  assertSuccessfulChecks(
    [{ check_runs: [check] }, { check_runs: [check] }],
    sha,
  );
  for (const checks of [
    [],
    [{ ...check, app: { slug: "other-app" } }],
    [{ ...check, head_sha: "a".repeat(40) }],
    [{ ...check, status: "in_progress", conclusion: null }],
    [check, { ...check, conclusion: "failure" }],
    [{ ...check, conclusion: "skipped" }],
  ]) {
    assert.throws(() => assertSuccessfulChecks([{ check_runs: checks }], sha));
  }
});

test("publishing requires an existing environment with required reviewers", () => {
  const environment = {
    name: "npm-node-prerelease",
    protection_rules: [
      { type: "required_reviewers", reviewers: [{ type: "User", id: 123 }] },
    ],
  };
  assertPublicationEnvironment(environment);
  for (const invalid of [
    { ...environment, name: "copilot" },
    { name: environment.name },
    { ...environment, protection_rules: [] },
    {
      ...environment,
      protection_rules: [{ type: "wait_timer", wait_timer: 10 }],
    },
    {
      ...environment,
      protection_rules: [{ type: "required_reviewers", reviewers: [] }],
    },
  ]) {
    assert.throws(() => assertPublicationEnvironment(invalid));
  }
});

test("only the Node prerelease with the published evaluator is packable", () => {
  validateManifest(manifest, version, true);
  validateManifest(
    { ...manifest, dependencies: { "@reflag/flag-evaluation": "workspace:*" } },
    version,
  );
  const invalid = [
    { name: "@reflag/browser-sdk" },
    { version: "2.0.0" },
    { private: true },
    { repository: { url: "https://github.com/another/repository.git" } },
    { publishConfig: { access: "public", tag: "latest" } },
    { publishConfig: { access: "public", registry: "https://example.test" } },
    { dependencies: { "@reflag/flag-evaluation": "2.0.0-next.0" } },
    { dependencies: { "@reflag/flag-evaluation": "workspace:*" } },
    { optionalDependencies: { local: "file:../something" } },
    { peerDependencies: { local: "link:../something" } },
  ];
  for (const value of invalid)
    assert.throws(() =>
      validateManifest({ ...manifest, ...value }, version, true),
    );
});

test("registry preflight refuses existing versions and any stable-tag drift", () => {
  const metadata = { "dist-tags": { latest: "1.8.3" }, versions: {} };
  assert.equal(validateRegistry(metadata, version), "1.8.3");
  assert.throws(() =>
    validateRegistry({ ...metadata, versions: { [version]: {} } }, version),
  );
  assert.throws(() => validateRegistry(metadata, version, "1.8.2"));
  assert.throws(() =>
    validateRegistry(
      { ...metadata, "dist-tags": { latest: version } },
      version,
    ),
  );
  assert.throws(() =>
    validateRegistry({ ...metadata, "dist-tags": {} }, version),
  );
});

test("postpublication verifies next and the exact tarball, without repairing tags", () => {
  const metadata = {
    "dist-tags": { latest: "1.8.3", next: version },
    versions: { [version]: { dist: { integrity: "sha512-fixture" } } },
  };
  validateRegistry(metadata, version, "1.8.3", "sha512-fixture");
  assert.throws(() =>
    validateRegistry(metadata, version, "1.8.3", "sha512-other"),
  );
  assert.throws(() =>
    validateRegistry(
      { ...metadata, "dist-tags": { latest: "1.8.3", next: "2.0.0-next.1" } },
      version,
      "1.8.3",
      "sha512-fixture",
    ),
  );
});

test("tarball inspection checks entry points, build-time version and content hashes", () => {
  tarballFixture(({ directory, archive, pack }) => {
    pack();
    const first = inspectTarball(archive, version);
    assert.match(first.sha256, /^[a-f0-9]{64}$/);
    assert.match(first.integrity, /^sha512-/);
    assert.deepEqual(inspectTarball(archive, version), first);
    writeFileSync(
      join(directory, "dist/src/index.js"),
      "module.exports = { changed: true };\n",
    );
    pack();
    assert.notEqual(inspectTarball(archive, version).sha256, first.sha256);
    writeFileSync(
      join(directory, "dist/package.json"),
      JSON.stringify({ ...manifest, version: "2.0.0-next.1" }),
    );
    pack();
    assert.throws(
      () => inspectTarball(archive, version),
      /version header would be stale/,
    );
  });
});

test("tarball inspection rejects source/demo files, links and missing declarations", () => {
  tarballFixture(({ directory, archive, pack }) => {
    writeFileSync(join(directory, ".env"), "test fixture, not a credential\n");
    pack();
    assert.throws(
      () => inspectTarball(archive, version),
      /Unexpected published file/,
    );
    rmSync(join(directory, ".env"));
    symlinkSync("package.json", join(directory, "dist/link"));
    pack();
    assert.throws(() => inspectTarball(archive, version), /Links and special/);
    rmSync(join(directory, "dist/link"));
    rmSync(join(directory, "dist/types/src/index.d.ts"));
    pack();
    assert.throws(
      () => inspectTarball(archive, version),
      /Missing packed entry point/,
    );
  });
});

test("preparation refuses dirty, moving or already-used checkouts before any build or registry request", async () => {
  const root = mkdtempSync(join(tmpdir(), "reflag-prerelease-source-test-"));
  const source = join(root, "source");
  const output = join(root, "artifact");
  mkdirSync(join(source, "packages/node-sdk"), { recursive: true });
  mkdirSync(join(source, "packages/flag-evaluation"), { recursive: true });
  writeFileSync(
    join(source, "packages/node-sdk/package.json"),
    JSON.stringify({
      ...manifest,
      dependencies: { "@reflag/flag-evaluation": "workspace:*" },
    }),
  );
  writeFileSync(
    join(source, "packages/flag-evaluation/package.json"),
    JSON.stringify({ version: "2.0.0" }),
  );
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: source,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  try {
    git("init", "--quiet");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "add",
      ".",
    );
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    );
    const sourceSha = git("rev-parse", "HEAD").trim();
    await assert.rejects(
      prepare({ source, output, version, sha: "f".repeat(40) }),
      /not the requested commit/,
    );
    writeFileSync(join(source, "untracked.txt"), "not part of the release\n");
    await assert.rejects(
      prepare({ source, output, version, sha: sourceSha }),
      /checkout must be clean/,
    );
    rmSync(join(source, "untracked.txt"));
    mkdirSync(output);
    await assert.rejects(
      prepare({ source, output, version, sha: sourceSha }),
      /already exists/,
    );
    await assert.rejects(
      prepare({
        source,
        output: join(source, "artifact"),
        version,
        sha: sourceSha,
      }),
      /outside the source checkout/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("artifact verification rejects a substituted digest or source identity before registry access", async () => {
  const root = mkdtempSync(join(tmpdir(), "reflag-prerelease-verify-test-"));
  const digest = "a".repeat(64);
  writeFileSync(
    join(root, "candidate.json"),
    JSON.stringify({
      name: manifest.name,
      version,
      tag: "next",
      sourceSha: sha,
      evaluatorVersion: "2.0.0",
      sha256: digest,
    }),
  );
  try {
    await assert.rejects(
      verify({ output: root, version, sha, sha256: "b".repeat(64) }),
    );
    await assert.rejects(
      verify({ output: root, version, sha: "f".repeat(40), sha256: digest }),
    );
    await assert.rejects(
      verify({ output: root, version, sha, sha256: "" }),
      /SHA-256/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("workflow is manually dispatched, defaults to artifact-only and fixes the npm tag", () => {
  const workflow = parse(
    readFileSync(
      new URL("../.github/workflows/node-sdk-prerelease.yml", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.equal(workflow.on.workflow_dispatch.inputs.publish.default, false);
  assert.equal(workflow.on.workflow_dispatch.inputs.version.default, version);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  const prepareJob = workflow.jobs.prepare;
  const publish = workflow.jobs.publish;
  assert.equal(prepareJob.permissions["id-token"], undefined);
  assert.ok(
    prepareJob.steps.some(
      (step) =>
        step.if === "${{ inputs.publish }}" &&
        step.run?.includes("prerelease.mjs environment"),
    ),
  );
  assert.equal(publish.permissions["id-token"], "write");
  assert.match(
    publish.if,
    /inputs\.publish.*github\.ref == 'refs\/heads\/main'/,
  );
  assert.equal(publish.needs, "prepare");
  assert.equal(publish.environment, "npm-node-prerelease");
  const commands = publish.steps.map((step) => step.run ?? "").join("\n");
  assert.match(
    commands,
    /--tag next --access public --provenance --ignore-scripts --registry https:\/\/registry\.npmjs\.org/,
  );
  assert.match(commands, /verify --published/);
  assert.doesNotMatch(
    commands,
    /changeset|dist-tag (?:add|rm)|yarn (?:build|install)|npm (?:run|install)/,
  );
  const checkouts = publish.steps.filter((step) =>
    step.uses?.startsWith("actions/checkout@"),
  );
  assert.equal(checkouts.length, 1);
  assert.equal(checkouts[0].with.ref, "${{ github.sha }}");
  assert.equal(checkouts[0].with["persist-credentials"], false);
  assert.ok(
    publish.steps.some(
      (step) => step.env?.SHA256 === "${{ needs.prepare.outputs.sha256 }}",
    ),
  );
  const packageCI = parse(
    readFileSync(
      new URL("../.github/workflows/package-ci.yml", import.meta.url),
      "utf8",
    ),
  );
  assert.ok(
    packageCI.jobs["build-and-test"].steps.some(
      (step) => step.run === "yarn test:release",
    ),
  );
});
