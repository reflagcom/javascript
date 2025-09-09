import { Argument, Option } from "commander";

import { CONFIG_FILE_NAME } from "./constants.js";

// Define supported editors directly here or import from a central place if needed elsewhere
const SUPPORTED_EDITORS = ["cursor", "vscode"] as const; // Add more later: "claude", "cline", "windsurf"

export const debugOption = new Option("--debug", "Enable debug mode.");

export const baseUrlOption = new Option(
  "--base-url [url]",
  `Reflag service URL (useful if behind a proxy). Falls back to baseUrl value in ${CONFIG_FILE_NAME}.`,
);

export const apiUrlOption = new Option(
  "--api-url [url]",
  `Reflag API URL (useful if behind a proxy). Falls back to apiUrl value in ${CONFIG_FILE_NAME} or baseUrl with /api appended.`,
);

export const apiKeyOption = new Option(
  "--api-key [key]",
  `Reflag API key. Can be used in CI/CD pipelines where logging in is not possible.`,
);

export const appIdOption = new Option(
  "-a, --appId [appId]",
  `Reflag App ID. Falls back to appId value in ${CONFIG_FILE_NAME}.`,
);

export const overwriteOption = new Option(
  "--overwrite",
  "Force initialization and overwrite existing configuration.",
);

export const typesOutOption = new Option(
  "-o, --out [path]",
  `Single output path for generated flag types. Falls back to typesOutput value in ${CONFIG_FILE_NAME}.`,
);

export const typesFormatOption = new Option(
  "-f, --format [format]",
  "Single output format for generated flag types",
).choices(["react", "node"]);

export const flagNameArgument = new Argument(
  "[name]",
  "Flag's name. If not provided, you'll be prompted to enter one.",
);

export const flagKeyOption = new Option(
  "-k, --key [flag key]",
  "Flag key. If not provided, a key is generated from the flag's name.",
);

export const editorOption = new Option(
  "-e, --editor [editor]",
  "Specify the editor to configure for MCP.",
).choices(SUPPORTED_EDITORS);

export const configScopeOption = new Option(
  "-s, --scope [scope]",
  "Specify whether to use local or global configuration.",
).choices(["local", "global"]);

export const rulesFormatOption = new Option(
  "-f, --format [format]",
  "Format to copy rules in",
)
  .choices(["cursor", "copilot"])
  .default("cursor");

export const yesOption = new Option(
  "-y, --yes",
  "Skip confirmation prompts and overwrite existing files without asking.",
);
