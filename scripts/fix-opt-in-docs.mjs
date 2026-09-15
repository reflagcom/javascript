import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Work around TypeDoc Markdown's lost import aliases, optional properties,
// and defaulted parameters in the opt-in reference code blocks.
export function fixOptInDocs(markdown) {
  return markdown
    .replaceAll(
      'type OptInFlag = Omit<OptInFlag, "key">',
      'type OptInFlag = Omit<import("@reflag/browser-sdk").OptInFlag, "key">',
    )
    .replace(
      /(type SetOptInOptions = \{\n\s*optedIn: boolean;\n\s*scope):/g,
      "$1?:",
    )
    .replace(/(type UseOptInFlagsOptions = \{\n\s*suspense):/g, "$1?:")
    .replace(/### useOptInFlags\(\)[\s\S]*?(?=\n\*\*\*|$)/g, (section) =>
      section
        .replace(
          "function useOptInFlags(options: UseOptInFlagsOptions)",
          "function useOptInFlags(options?: UseOptInFlagsOptions)",
        )
        .replace(/`options`(?!\?)/g, "`options`?"),
    );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  for (const path of process.argv.slice(2)) {
    const original = readFileSync(path, "utf8");
    const updated = fixOptInDocs(original);
    if (updated !== original) writeFileSync(path, updated);
  }
}
