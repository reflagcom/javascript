import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const planPath = "releases/v1.json";
const npmRegistry = "https://registry.npmjs.org";
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function extendReleasePlan(plan, packages, previousVersion) {
  return Object.fromEntries(
    packages
      .filter(
        ({ name, version, path }) =>
          plan[name] === version || previousVersion(path) !== version,
      )
      .map(({ name, version }) => [name, version])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

export async function checkReleasePlan(
  plan,
  packages,
  { isPublished, latest },
) {
  const local = new Map(packages.map(({ name, version }) => [name, version]));
  for (const [name, version] of Object.entries(plan)) {
    if (
      typeof version !== "string" ||
      !stableVersion.test(version) ||
      local.get(name) !== version
    ) {
      throw new Error(
        `Approved version ${name}@${version} does not match a stable public workspace version`,
      );
    }
  }

  const results = await Promise.all(
    packages.map(async ({ name, version }) => {
      if (await isPublished(name, version)) return null;
      if (!Object.hasOwn(plan, name)) {
        throw new Error(`Unapproved unpublished version: ${name}@${version}`);
      }
      const current = await latest(name);
      const stable = typeof current === "string" && stableVersion.exec(current);
      const expected = stable
        ? `${stable[1]}.${stable[2]}.${BigInt(stable[3]) + 1n}`
        : null;
      if (version !== expected) {
        throw new Error(
          `Refusing ${name}@${version}: npm latest is ${current}; expected its next stable patch`,
        );
      }
      return `${name}@${version}`;
    }),
  );
  return results.filter(Boolean).sort();
}

function readWorkspaces() {
  return execFileSync("yarn", ["workspaces", "list", "--json"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .flatMap(({ location }) => {
      const path = `${location}/package.json`;
      const {
        name,
        version,
        private: isPrivate,
      } = JSON.parse(readFileSync(path, "utf8"));
      return isPrivate ? [] : [{ name, version, path }];
    });
}

async function registryGet(path) {
  return fetch(`${npmRegistry}/${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
}

const registry = {
  async isPublished(name, version) {
    const response = await registryGet(
      `${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
    );
    await response.body?.cancel();
    if (response.ok) return true;
    if (response.status === 404) return false;
    throw new Error(
      `Could not check ${name}@${version} (HTTP ${response.status})`,
    );
  },
  async latest(name) {
    const response = await registryGet(
      `-/package/${encodeURIComponent(name)}/dist-tags`,
    );
    if (!response.ok)
      throw new Error(
        `Could not read tags for ${name} (HTTP ${response.status})`,
      );
    return (await response.json()).latest;
  },
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (existsSync(".changeset/pre.json")) {
    throw new Error(
      "The v1 workflow must not run in Changesets prerelease mode",
    );
  }
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new Error(`Expected a package-to-version map in ${planPath}`);
  }
  const packages = readWorkspaces();
  switch (process.argv[2]) {
    case "plan": {
      const updated = extendReleasePlan(
        plan,
        packages,
        (path) =>
          JSON.parse(
            execFileSync("git", ["show", `HEAD:${path}`], { encoding: "utf8" }),
          ).version,
      );
      writeFileSync(planPath, `${JSON.stringify(updated, null, 2)}\n`);
      break;
    }
    case "check": {
      const pending = await checkReleasePlan(plan, packages, registry);
      console.error(
        pending.length
          ? `Approved npm latest candidates:\n${pending.join("\n")}`
          : "No unpublished v1 releases",
      );
      console.log(`pending=${pending.length > 0}`);
      break;
    }
    default:
      throw new Error("Expected plan or check");
  }
}
