import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function assertPublishableManifest(manifest) {
  if (manifest.private) return;

  // Changesets uses npm to publish directories, not Yarn's pack command.
  // Source manifests must therefore be installable without Yarn rewriting them.
  for (const field of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
    "devDependencies",
  ]) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      if (range.startsWith("workspace:")) {
        throw new Error(
          `${manifest.name}: ${field}.${name} uses ${range}; Changesets does not rewrite workspace ranges. Use a registry-compatible version.`,
        );
      }
    }
  }
}

export function checkPublishManifests(root) {
  const workspaces = execFileSync("yarn", ["workspaces", "list", "--json"], {
    cwd: root,
    encoding: "utf8",
  });
  for (const line of workspaces.trim().split("\n")) {
    const { location } = JSON.parse(line);
    const manifest = JSON.parse(
      readFileSync(join(root, location, "package.json"), "utf8"),
    );
    assertPublishableManifest(manifest);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  checkPublishManifests(fileURLToPath(new URL("../", import.meta.url)));
}
