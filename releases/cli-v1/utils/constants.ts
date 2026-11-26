import os from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const CLIENT_VERSION_HEADER_NAME = "reflag-sdk-version";
export const CLIENT_VERSION_HEADER_VALUE = (version: string) =>
  `cli/${version}`;

export const CONFIG_FILE_NAME = "reflag.config.json";
export const AUTH_FILE = join(os.homedir(), ".reflag-auth");
export const SCHEMA_URL = `https://unpkg.com/@reflag/cli@latest/schema.json`;

export const DEFAULT_BASE_URL = "https://app.reflag.com";
export const DEFAULT_API_URL = `${DEFAULT_BASE_URL}/api`;
export const DEFAULT_TYPES_OUTPUT = join("gen", "flags.d.ts");

export const DEFAULT_AUTH_TIMEOUT = 60000; // 60 seconds

export const MODULE_ROOT = fileURLToPath(import.meta.url).substring(
  0,
  fileURLToPath(import.meta.url).lastIndexOf("cli") + 3,
);
