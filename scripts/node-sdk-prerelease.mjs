import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PACKAGE = "@reflag/node-sdk";
export const TAG = "next";
export const EVALUATOR_VERSION = "2.0.0";
const registry = "https://registry.npmjs.org";
const toolsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function validateInputs(version, sha) {
  assert.match(
    version ?? "",
    /^2\.0\.0-next\.(0|[1-9]\d*)$/,
    "Expected 2.0.0-next.N",
  );
  assert.match(
    sha ?? "",
    /^[a-f0-9]{40}$/,
    "An exact lowercase commit SHA is required",
  );
}

export function assertSuccessfulChecks(pages, sha) {
  const checks = pages.flatMap((page) => page.check_runs ?? []);
  const builds = checks.filter(
    (check) =>
      check.name === "Build & Test" && check.app?.slug === "github-actions",
  );
  assert.ok(builds.length, "No Package CI Build & Test check found");
  assert.ok(
    builds.every(
      (check) =>
        check.head_sha === sha &&
        check.status === "completed" &&
        check.conclusion === "success",
    ),
    "All Build & Test checks on the exact source commit must pass first",
  );
}

export function assertPublicationEnvironment(environment) {
  assert.equal(environment.name, "npm-node-prerelease");
  assert.ok(
    environment.protection_rules?.some(
      (rule) =>
        rule.type === "required_reviewers" && rule.reviewers?.length > 0,
    ),
    "Configure required reviewers on npm-node-prerelease before publishing",
  );
}

export function validateManifest(manifest, version, packed = false) {
  assert.equal(manifest.name, PACKAGE);
  assert.equal(manifest.version, version);
  assert.notEqual(manifest.private, true);
  assert.equal(
    manifest.repository?.url,
    "https://github.com/reflagcom/javascript.git",
  );
  assert.equal(manifest.publishConfig?.access, "public");
  assert.ok(
    !manifest.publishConfig?.tag || manifest.publishConfig.tag === TAG,
    "Unsafe publishConfig.tag",
  );
  assert.ok(
    !manifest.publishConfig?.registry ||
      manifest.publishConfig.registry === registry,
    "Unexpected registry",
  );
  assert.equal(
    manifest.dependencies?.["@reflag/flag-evaluation"],
    packed ? EVALUATOR_VERSION : "workspace:*",
    "The prerelease must use the already-published evaluator 2.0.0",
  );
  if (packed) {
    for (const field of [
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
    ]) {
      for (const specification of Object.values(manifest[field] ?? {})) {
        assert.ok(
          !/^(workspace:|file:|link:|portal:)/.test(specification),
          "Unresolved local dependency in tarball",
        );
      }
    }
  }
}

export function validateRegistry(metadata, version, baseline, integrity) {
  const latest = metadata["dist-tags"]?.latest;
  assert.match(
    latest ?? "",
    /^1\.\d+\.\d+$/,
    "latest must remain on stable v1",
  );
  if (baseline !== undefined)
    assert.equal(
      latest,
      baseline,
      "latest changed; stop and inspect before continuing",
    );
  if (integrity === undefined) {
    assert.ok(
      !Object.hasOwn(metadata.versions ?? {}, version),
      `${version} is already published; do not overwrite or retag it`,
    );
  } else {
    assert.equal(
      metadata["dist-tags"]?.[TAG],
      version,
      "next does not point to the published candidate",
    );
    assert.equal(
      metadata.versions?.[version]?.dist?.integrity,
      integrity,
      "Registry artifact differs from the verified tarball",
    );
  }
  return latest;
}

function run(command, args, cwd, capture = false) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", capture ? "pipe" : "inherit", "inherit"],
    maxBuffer: 16 * 1024 * 1024,
  });
}

export function inspectTarball(tarball, version) {
  const entries = run("tar", ["-tzf", tarball], undefined, true)
    .trim()
    .split("\n");
  assert.equal(
    new Set(entries).size,
    entries.length,
    "Duplicate archive entries",
  );
  for (const entry of entries) {
    assert.ok(
      !isAbsolute(entry) && !entry.split("/").includes(".."),
      "Unsafe archive path",
    );
    assert.match(entry, /^[A-Za-z0-9_./@,+-]+$/, "Unexpected archive filename");
    assert.ok(
      entry === "package/" ||
        entry.startsWith("package/dist/") ||
        /^package\/(package\.json|README\.md|CHANGELOG\.md|LICEN[CS]E(?:\.(?:md|txt))?)$/.test(
          entry,
        ),
      `Unexpected published file: ${entry}`,
    );
  }
  const listing = run("tar", ["-tvzf", tarball], undefined, true)
    .trim()
    .split("\n");
  assert.ok(
    listing.every((entry) => /^[d-]/.test(entry)),
    "Links and special archive entries are not allowed",
  );
  const manifest = JSON.parse(
    run("tar", ["-xOzf", tarball, "package/package.json"], undefined, true),
  );
  validateManifest(manifest, version, true);
  for (const path of [manifest.main, manifest.types, "./dist/package.json"]) {
    assert.ok(
      typeof path === "string" && path.startsWith("./dist/"),
      "Missing compiled package entry point",
    );
    assert.ok(
      entries.includes(`package/${path.slice(2)}`),
      `Missing packed entry point: ${path}`,
    );
  }
  const compiledManifest = JSON.parse(
    run(
      "tar",
      ["-xOzf", tarball, "package/dist/package.json"],
      undefined,
      true,
    ),
  );
  assert.equal(
    compiledManifest.version,
    version,
    "Compiled SDK version header would be stale",
  );
  const bytes = readFileSync(tarball);
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
  };
}

async function registryMetadata() {
  const response = await fetch(`${registry}/@reflag%2fnode-sdk`, {
    headers: { "cache-control": "no-cache" },
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(
    response.status,
    200,
    "Cannot verify registry state; refusing to continue",
  );
  return response.json();
}

function checkConsumer(tarball, version) {
  const consumer = mkdtempSync(
    join(tmpdir(), "reflag-node-prerelease-consumer-"),
  );
  try {
    writeFileSync(
      join(consumer, "package.json"),
      JSON.stringify({
        private: true,
        dependencies: { [PACKAGE]: pathToFileURL(tarball).href },
        devDependencies: { typescript: "5.7.3", "@types/node": "22.12.0" },
      }),
    );
    run(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
        "--registry",
        registry,
      ],
      consumer,
    );
    const fixtures = join(toolsRoot, "scripts/fixtures/node-sdk-prerelease");
    for (const name of ["unregistered.cts", "registered.cts"]) {
      writeFileSync(join(consumer, name), readFileSync(join(fixtures, name)));
      run(
        process.execPath,
        [
          join(consumer, "node_modules/typescript/bin/tsc"),
          "--noEmit",
          "--strict",
          "--module",
          "NodeNext",
          "--moduleResolution",
          "NodeNext",
          "--target",
          "ES2022",
          name,
        ],
        consumer,
      );
    }
    writeFileSync(
      join(consumer, "runtime.cjs"),
      readFileSync(join(fixtures, "runtime.cjs")),
    );
    run(process.execPath, ["runtime.cjs", version], consumer);
  } finally {
    rmSync(consumer, { recursive: true, force: true });
  }
}

export async function prepare({ source, output, version, sha }) {
  validateInputs(version, sha);
  source = realpathSync(source);
  output = resolve(output);
  assert.equal(
    run("git", ["rev-parse", "HEAD"], source, true).trim(),
    sha,
    "Source checkout is not the requested commit",
  );
  assert.equal(
    run("git", ["status", "--porcelain"], source, true).trim(),
    "",
    "Source checkout must be clean",
  );
  const sdk = join(source, "packages/node-sdk");
  validateManifest(
    JSON.parse(readFileSync(join(sdk, "package.json"))),
    version,
  );
  assert.equal(
    JSON.parse(
      readFileSync(join(source, "packages/flag-evaluation/package.json")),
    ).version,
    EVALUATOR_VERSION,
  );
  assert.ok(
    relative(source, output).startsWith(
      `..${process.platform === "win32" ? "\\" : "/"}`,
    ) || isAbsolute(relative(source, output)),
    "Write artifacts outside the source checkout",
  );
  assert.ok(
    !existsSync(output),
    "Output directory already exists; refusing to overwrite an artifact",
  );
  const latest = validateRegistry(await registryMetadata(), version);
  mkdirSync(output, { recursive: false });
  run("yarn", ["install", "--immutable"], source);
  // tsc does not remove obsolete output. Never pack leftovers from an older build.
  rmSync(join(source, "packages/flag-evaluation/dist"), {
    recursive: true,
    force: true,
  });
  rmSync(join(sdk, "dist"), { recursive: true, force: true });
  run("yarn", ["workspace", "@reflag/flag-evaluation", "build"], source);
  run("yarn", ["workspace", PACKAGE, "test"], source);
  run("yarn", ["workspace", PACKAGE, "build"], source);
  const tarball = join(output, `reflag-node-sdk-${version}.tgz`);
  run("yarn", ["workspace", PACKAGE, "pack", "--out", tarball], source);
  const hashes = inspectTarball(tarball, version);
  checkConsumer(tarball, version);
  assert.equal(
    run("git", ["status", "--porcelain"], source, true).trim(),
    "",
    "Preparation changed the source checkout",
  );
  const candidate = {
    name: PACKAGE,
    version,
    tag: TAG,
    sourceSha: sha,
    evaluatorVersion: EVALUATOR_VERSION,
    latestBefore: latest,
    ...hashes,
  };
  writeFileSync(
    join(output, "candidate.json"),
    `${JSON.stringify(candidate, null, 2)}\n`,
  );
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `sha256=${hashes.sha256}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Verified Node prerelease (not published)\n\n- Package: \`${PACKAGE}@${version}\`\n- Tag: \`${TAG}\` (latest remains \`${latest}\`)\n- Source: \`${sha}\`\n- Tarball SHA-256: \`${hashes.sha256}\`\n\nClean installed-package runtime and both strict TypeScript consumers passed.\n`,
    );
  return candidate;
}

export async function verify({
  output,
  version,
  sha,
  sha256,
  published = false,
}) {
  validateInputs(version, sha);
  assert.match(
    sha256 ?? "",
    /^[a-f0-9]{64}$/,
    "Expected the preparation job's SHA-256",
  );
  const candidate = JSON.parse(readFileSync(join(output, "candidate.json")));
  assert.equal(candidate.name, PACKAGE);
  assert.equal(candidate.version, version);
  assert.equal(candidate.tag, TAG);
  assert.equal(candidate.sourceSha, sha);
  assert.equal(candidate.evaluatorVersion, EVALUATOR_VERSION);
  assert.equal(candidate.sha256, sha256);
  const hashes = inspectTarball(
    join(output, `reflag-node-sdk-${version}.tgz`),
    version,
  );
  assert.equal(hashes.sha256, sha256, "Artifact changed after verification");
  assert.equal(hashes.integrity, candidate.integrity);
  validateRegistry(
    await registryMetadata(),
    version,
    candidate.latestBefore,
    published ? candidate.integrity : undefined,
  );
  return candidate;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    assert.ok(
      [
        "--source",
        "--output",
        "--version",
        "--sha",
        "--sha256",
        "--checks",
        "--environment",
        "--published",
      ].includes(key),
      `Unknown option: ${key}`,
    );
    assert.ok(
      !Object.hasOwn(options, key.slice(2)),
      `Duplicate option: ${key}`,
    );
    options[key.slice(2)] = key === "--published" ? true : args[++i];
  }
  if (command === "validate") validateInputs(options.version, options.sha);
  else if (command === "ci") {
    validateInputs(options.version, options.sha);
    assertSuccessfulChecks(
      JSON.parse(readFileSync(options.checks)),
      options.sha,
    );
  } else if (command === "environment")
    assertPublicationEnvironment(JSON.parse(readFileSync(options.environment)));
  else if (command === "prepare")
    console.log(JSON.stringify(await prepare(options), null, 2));
  else if (command === "verify")
    console.log(JSON.stringify(await verify(options), null, 2));
  else
    throw new Error(
      "Use validate, ci, environment, prepare or verify. Publication is only in the manually approved workflow.",
    );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
