import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const documented = new Set([
  "browser-sdk",
  "react-sdk",
  "vue-sdk",
  "node-sdk",
  "react-native-sdk",
  "management-sdk",
  "cli",
]);
const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/;
const git = (source, ...args) =>
  execFileSync("git", ["-C", source, ...args], { encoding: "utf8" }).trim();

export function selectReleases(source, published) {
  assert(Array.isArray(published), "publishedPackages must be an array");
  const seen = new Set();
  const releases = [];
  for (const release of published) {
    assert(
      release && /^@reflag\/[a-z][a-z0-9-]*$/.test(release.name),
      "Invalid published package",
    );
    assert(
      typeof release.version === "string" &&
        versionPattern.test(release.version),
      "Invalid published version",
    );
    assert(!seen.has(release.name), "Duplicate published package");
    seen.add(release.name);
    const name = release.name.slice("@reflag/".length);
    if (!documented.has(name)) continue;
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(source, "packages", name, "package.json"),
        "utf8",
      ),
    );
    assert.equal(pkg.name, release.name);
    assert.equal(
      pkg.version,
      release.version,
      "Published/source version mismatch",
    );
    assert(!pkg.private, "Private published package");
    // A prerelease must not change stable documentation or default navigation.
    if (!versionPattern.exec(release.version)[4])
      releases.push({ name: release.name, version: release.version });
  }
  return releases;
}

export function releasePlan(source, published) {
  assert.equal(
    git(source, "status", "--porcelain", "--untracked-files=no"),
    "",
    "SDK source must be clean",
  );
  const sourceCommit = git(source, "rev-parse", "HEAD");
  const releases = selectReleases(source, published);
  for (const release of releases)
    assert.equal(
      git(
        source,
        "rev-parse",
        `refs/tags/${release.name}@${release.version}^{commit}`,
      ),
      sourceCommit,
      "Release tag/source mismatch",
    );
  return { sourceCommit, releases };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const destination = process.argv[2];
  assert(destination, "Pass the release-plan output filename");
  const plan = releasePlan(
    process.cwd(),
    JSON.parse(process.env.PUBLISHED_PACKAGES),
  );
  fs.writeFileSync(destination, `${JSON.stringify(plan, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `has_docs=${plan.releases.length > 0}\n`,
    );
  console.log(
    `Selected ${plan.releases.length} stable package releases for documentation.`,
  );
}
