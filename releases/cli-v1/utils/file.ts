import { access, constants } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
/**
 * Checks if a file exists at the given path.
 * @param path The path to the file.
 * @returns True if the file exists, false otherwise.
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

// Helper to resolve home directory
export const resolvePath = (p: string) => {
  return join(
    ...p.split("/").map((part) => {
      if (part === "~") {
        return os.homedir();
      } else if (part === "@") {
        return process.env.APPDATA ?? "";
      } else {
        return part;
      }
    }),
  );
};
