import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function releaseChannel(preState) {
  if (preState === undefined) return "latest";
  if (
    !preState ||
    !["pre", "exit"].includes(preState.mode) ||
    preState.tag !== "next"
  ) {
    throw new Error("Expected Changesets prerelease state with tag next");
  }
  return preState.mode === "pre" ? "next" : "latest";
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const path = new URL("../.changeset/pre.json", import.meta.url);
  const preState = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8"))
    : undefined;
  console.log(`prerelease=${releaseChannel(preState) === "next"}`);
}
