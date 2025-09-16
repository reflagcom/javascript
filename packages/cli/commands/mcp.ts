import { select } from "@inquirer/prompts";
import chalk from "chalk";
import { Command } from "commander";
import { parse as parseJSON, stringify as stringifyJSON } from "comment-json";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import ora, { type Ora } from "ora";

import {
  ConfigPaths,
  getServersConfig,
  resolveConfigPath,
  SupportedEditor,
  SupportedEditors,
} from "../services/mcp.js";
import { configStore } from "../stores/config.js";
import { handleError } from "../utils/errors.js";
import { fileExists } from "../utils/file.js";
import { configScopeOption, editorOption } from "../utils/options.js";

export const mcpAction = async (options: {
  editor?: SupportedEditor;
  scope?: "local" | "global";
}) => {
  const config = configStore.getConfig();
  let spinner: Ora | undefined;
  let selectedEditor = options.editor;

  // Select Editor/Client
  if (!selectedEditor) {
    selectedEditor = await select<SupportedEditor>({
      message: "Which editor do you want to configure?",
      choices: SupportedEditors.map((value) => ({
        value,
        name: ConfigPaths[value].name,
      })),
    });
  }

  // Determine Config Path
  const projectPath = configStore.getProjectPath();
  const globalPath = resolveConfigPath(selectedEditor, false);
  const localPath = resolveConfigPath(selectedEditor, true);
  const fullLocalPath = localPath ? join(projectPath, localPath) : undefined;

  if (!globalPath) {
    throw new Error(`Unsupported platform for editor: ${selectedEditor}`);
  }

  let configPathType: "global" | "local" = "global";
  if (fullLocalPath) {
    if (options.scope) {
      configPathType = options.scope;
    } else {
      configPathType = await select<"global" | "local">({
        message: "Configure global or project-local settings?",
        choices: [
          {
            name: `Local (${relative(projectPath, fullLocalPath)})`,
            value: "local",
          },
          { name: `Global (${globalPath})`, value: "global" },
        ],
      });
    }
  }
  const configPath = configPathType === "local" ? fullLocalPath! : globalPath;
  const displayConfigPath =
    configPathType === "local" ? relative(projectPath, configPath) : configPath;

  // Read/Parse Config File
  spinner = ora(
    `Reading configuration file: ${chalk.cyan(displayConfigPath)}...`,
  ).start();

  let editorConfig: any = {};
  if (await fileExists(configPath)) {
    const content = await readFile(configPath, "utf-8");
    // Attempt to parse JSON, handle potential comments if needed
    try {
      editorConfig = parseJSON(content);
    } catch {
      spinner.fail(
        `Failed to parse configuration file ${chalk.cyan(displayConfigPath)}.`,
      );
    }
    spinner.succeed(
      `Read configuration file ${chalk.cyan(displayConfigPath)}.`,
    );
  } else {
    spinner.info("Configuration file not found, will create a new one.");
    editorConfig = {}; // Initialize empty config if file doesn't exist
  }

  // Ensure MCP servers object exists
  const serversConfig = getServersConfig(
    editorConfig,
    selectedEditor,
    configPathType,
  );

  // Check for existing Reflag servers
  const existingReflagEntries = Object.keys(serversConfig).filter((key) =>
    /reflag/i.test(key),
  );

  // Prompt for Add/Update
  let targetEntryKey: string;
  const defaultNewKey = `Reflag`;

  if (existingReflagEntries.length === 0) {
    targetEntryKey = defaultNewKey;
    console.log(`Adding new MCP server entry: ${chalk.cyan(targetEntryKey)}`);
  } else {
    const choices = [
      { name: `Add: ${defaultNewKey}`, value: "add_new" },
      ...existingReflagEntries.map((key) => ({
        name: `Update: ${key}`,
        value: key,
      })),
    ];

    const choice = await select({
      message: "Add a new MCP server or update an existing one?",
      choices,
    });

    if (choice === "add_new") {
      targetEntryKey = defaultNewKey;
      console.log(`Adding new MCP server entry: ${chalk.cyan(targetEntryKey)}`);
    } else {
      targetEntryKey = choice;
      console.log(
        `Updating existing MCP server entry: ${chalk.cyan(targetEntryKey)}`,
      );
    }
  }

  // Construct the MCP endpoint URL
  const newEntryValue = {
    url: config.apiUrl + "/mcp",
  };

  // Update Config Object
  serversConfig[targetEntryKey] = newEntryValue;

  // Write Config File
  spinner = ora(
    `Writing configuration to ${chalk.cyan(displayConfigPath)}...`,
  ).start();

  try {
    // Ensure the directory exists before writing
    await mkdir(dirname(configPath), { recursive: true });
    const configString = stringifyJSON(editorConfig, null, 2);

    await writeFile(configPath, configString);
    spinner.succeed(
      `Configuration updated successfully in ${chalk.cyan(displayConfigPath)}.`,
    );

    console.log(
      chalk.grey(
        "You may need to restart your editor for changes to take effect.",
      ),
    );
  } catch (error) {
    spinner.fail(
      `Failed to write configuration file ${chalk.cyan(displayConfigPath)}.`,
    );

    handleError(error, "MCP Configuration");
  }
};

export function registerMcpCommand(cli: Command) {
  cli
    .command("mcp")
    .description("Configure Reflag's remote MCP server for your AI assistant.")
    .addOption(editorOption)
    .addOption(configScopeOption)
    .action(mcpAction);

  // Update the config with the cli override values
  cli.hook("preAction", (_, command) => {
    const { appId } = command.opts();
    configStore.setConfig({
      appId,
    });
  });
}
