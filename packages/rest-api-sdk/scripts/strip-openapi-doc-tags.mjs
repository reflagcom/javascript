// removes @export and @memberof because typedoc doesn't like them
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const generatedRoot = path.resolve("src/generated");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;

    const original = await readFile(fullPath, "utf8");
    const updated = original
      .split("\n")
      .filter(
        (line) =>
          !/^\s*\*\s*@export\s*$/.test(line) &&
          !/^\s*\*\s*@memberof\b/.test(line),
      )
      .join("\n");

    if (updated !== original) {
      await writeFile(fullPath, updated);
    }
  }
}

await walk(generatedRoot);
