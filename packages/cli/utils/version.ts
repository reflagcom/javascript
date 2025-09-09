import { readFile } from "fs/promises";
import { join } from "path";
import { gt } from "semver";

import { MODULE_ROOT } from "./constants.js";

export async function current() {
  try {
    const packageJsonPath = join(MODULE_ROOT, "package.json");
    const packageJsonContent = await readFile(packageJsonPath, "utf-8");
    const packageInfo: {
      version: string;
      name: string;
    } = JSON.parse(packageJsonContent);

    return {
      version: packageInfo.version,
      name: packageInfo.name,
    };
  } catch (error) {
    throw new Error(
      `Failed to read current version: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

async function getLatestVersionFromNpm(packageName: string): Promise<string> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${packageName}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch package info: ${response.status} ${response.statusText}`,
      );
    }

    const data: {
      "dist-tags": {
        latest: string;
      };
    } = await response.json();

    return data["dist-tags"].latest;
  } catch (error) {
    throw new Error(
      `Failed to fetch latest version from npm: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function checkLatest() {
  const { version: currentVersion, name: packageName } = await current();

  const latestVersion = await getLatestVersionFromNpm(packageName);
  const isNewerAvailable = gt(latestVersion, currentVersion);

  return {
    currentVersion,
    latestVersion,
    isNewerAvailable,
  };
}
