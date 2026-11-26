#!/usr/bin/env node
import chalk from "chalk";
import { program } from "commander";

import { registerAppCommands } from "./commands/apps.js";
import { registerAuthCommands } from "./commands/auth.js";
import { registerFlagCommands } from "./commands/flags.js";
import { registerInitCommand } from "./commands/init.js";
import { registerMcpCommand } from "./commands/mcp.js";
import { registerNewCommand } from "./commands/new.js";
import { registerRulesCommand } from "./commands/rules.js";
import { authStore } from "./stores/auth.js";
import { configStore } from "./stores/config.js";
import {
  apiKeyOption,
  apiUrlOption,
  baseUrlOption,
  debugOption,
  orgIdOption,
} from "./utils/options.js";
import { stripTrailingSlash } from "./utils/urls.js";
import { checkLatest as checkLatestVersion } from "./utils/version.js";

type Options = {
  debug?: boolean;
  baseUrl?: string;
  apiUrl?: string;
  apiKey?: string;
  orgId?: string;
};

async function main() {
  // Start a version check in the background
  // unhandled promise rejection can happen even without the `await`
  // so we need a `catch` here.
  const cliVersionCheckPromise = checkLatestVersion().catch(() => ({
    latestVersion: "unknown",
    currentVersion: "unknown",
    isNewerAvailable: false,
  }));

  // Must load tokens and config before anything else
  await authStore.initialize();
  await configStore.initialize();

  // Global options
  program.addOption(debugOption);
  program.addOption(baseUrlOption);
  program.addOption(apiUrlOption);
  program.addOption(apiKeyOption);
  program.addOption(orgIdOption);

  // Pre-action hook
  program.hook("preAction", async () => {
    const {
      debug,
      baseUrl,
      apiUrl,
      apiKey: explicitApiKey,
      orgId,
    } = program.opts<Options>();
    const cleanedBaseUrl = stripTrailingSlash(baseUrl?.trim());
    const cleanedApiUrl = stripTrailingSlash(apiUrl?.trim());

    const apiKey = explicitApiKey ?? process.env.REFLAG_API_KEY;

    if (typeof apiKey === "string" && apiKey.length > 0) {
      console.info(
        chalk.yellow(
          "API key supplied. Using it instead of normal personal authentication.",
        ),
      );
      authStore.useApiKey(apiKey);
    }

    configStore.setConfig({
      baseUrl: cleanedBaseUrl,
      apiUrl: cleanedApiUrl || (cleanedBaseUrl && `${cleanedBaseUrl}/api`),
      orgId: orgId?.trim(),
    });

    const { latestVersion, currentVersion, isNewerAvailable } =
      await cliVersionCheckPromise;

    if (isNewerAvailable) {
      console.info(
        `A new version of the CLI is available: ${chalk.yellow(
          currentVersion,
        )} -> ${chalk.green(latestVersion)}. Update to ensure you have the latest features and bug fixes.`,
      );
    }

    if (debug) {
      console.debug(chalk.cyan("\nDebug mode enabled."));
      console.debug(
        "Reading config from:",
        chalk.cyan(configStore.getConfigPath()),
      );
      console.table(configStore.getConfig());
    }
  });

  // Main program
  registerNewCommand(program);
  registerInitCommand(program);
  registerAuthCommands(program);
  registerAppCommands(program);
  registerFlagCommands(program);
  registerMcpCommand(program);
  registerRulesCommand(program);

  program.parse(process.argv);
}

void main();
