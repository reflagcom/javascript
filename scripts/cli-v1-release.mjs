import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageName = "@reflag/cli";
const stableV1 = /^1\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseReleaseRequest(request) {
  if (
    !request ||
    typeof request.version !== "string" ||
    !stableV1.test(request.version) ||
    (Object.hasOwn(request, "publish") &&
      typeof request.publish !== "boolean") ||
    Object.keys(request).some((key) => key !== "version" && key !== "publish")
  ) {
    throw new Error(
      "Expected a stable CLI v1 version and an optional publish boolean",
    );
  }
  return { version: request.version, publish: request.publish ?? false };
}

export function assertCliV1Release(manifest, requestedVersion, latest) {
  if (manifest.name !== packageName || manifest.private) {
    throw new Error(`Expected the public ${packageName} package`);
  }
  if (
    typeof requestedVersion !== "string" ||
    !stableV1.test(requestedVersion) ||
    manifest.version !== requestedVersion
  ) {
    throw new Error(
      "The requested stable CLI v1 version must match the packaged version",
    );
  }

  const current = typeof latest === "string" && stableV1.exec(latest);
  if (!current) {
    throw new Error(
      `Refusing to update npm latest: '${latest}' is not a stable CLI v1 version`,
    );
  }
  const expected = `1.${current[1]}.${BigInt(current[2]) + 1n}`;
  if (requestedVersion !== expected) {
    throw new Error(
      `Expected the next CLI v1 patch (${expected}), not ${requestedVersion}`,
    );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  switch (process.argv[2]) {
    case "request": {
      const { version, publish } = parseReleaseRequest(
        JSON.parse(readFileSync("releases/cli-v1.json", "utf8")),
      );
      console.log(`version=${version}\npublish=${publish}`);
      break;
    }
    case "check": {
      const manifest = JSON.parse(readFileSync(0, "utf8"));
      const response = await fetch(
        `https://registry.npmjs.org/-/package/${encodeURIComponent(packageName)}/dist-tags`,
        { signal: AbortSignal.timeout(10_000), cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error(
          `Could not read npm dist-tags (HTTP ${response.status})`,
        );
      }
      const { latest, next } = await response.json();
      assertCliV1Release(manifest, process.env.CLI_VERSION, latest);
      console.log(
        `Verified ${packageName} can move npm latest from ${latest} to ${manifest.version} (next: ${next ?? "unset"})`,
      );
      break;
    }
    default:
      throw new Error("Expected request or check");
  }
}
