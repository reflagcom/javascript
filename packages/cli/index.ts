#!/usr/bin/env node
import chalk from "chalk";
import { program } from "commander";
import ora from "ora";

import { registerAppCommands } from "./commands/apps.js";
import { registerAuthCommands } from "./commands/auth.js";
import { registerFlagCommands } from "./commands/flags.js";
import { registerInitCommand } from "./commands/init.js";
import { registerMcpCommand } from "./commands/mcp.js";
import { registerNewCommand } from "./commands/new.js";
import { registerRulesCommand } from "./commands/rules.js";
import { bootstrap, getReflagUser } from "./services/bootstrap.js";
import { authStore } from "./stores/auth.js";
import { configStore } from "./stores/config.js";
import { commandName } from "./utils/commander.js";
import { handleError } from "./utils/errors.js";
import {
  apiKeyOption,
  apiUrlOption,
  baseUrlOption,
  debugOption,
} from "./utils/options.js";
import { stripTrailingSlash } from "./utils/urls.js";
import { checkLatest as checkLatestVersion } from "./utils/version.js";

const skipBootstrapCommands = [/^login/, /^logout/, /^rules/];

type Options = {
  debug?: boolean;
  baseUrl?: string;
  apiUrl?: string;
  apiKey?: string;
};

async function main() {
  // Start a version check in the background
  const cliVersionCheckPromise = checkLatestVersion();

  // Must load tokens and config before anything else
  await authStore.initialize();
  await configStore.initialize();

  // Global options
  program.addOption(debugOption);
  program.addOption(baseUrlOption);
  program.addOption(apiUrlOption);
  program.addOption(apiKeyOption);

  // Pre-action hook
  program.hook("preAction", async (_, actionCommand) => {
    const {
      debug,
      baseUrl,
      apiUrl,
      apiKey: explicitApiKey,
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

    // Set baseUrl and apiUrl in config store, will skip if undefined
    configStore.setConfig({
      baseUrl: cleanedBaseUrl,
      apiUrl: cleanedApiUrl || (cleanedBaseUrl && `${cleanedBaseUrl}/api`),
    });

    // Skip bootstrapping for commands that don't require it
    if (
      !skipBootstrapCommands.some((cmd) => cmd.test(commandName(actionCommand)))
    ) {
      const spinner = ora("Bootstrapping...").start();

      try {
        // Load bootstrap data if not already loaded
        await bootstrap();
        spinner.stop();
      } catch (error) {
        spinner.fail("Bootstrap failed.");
        handleError(error, "Connect");
      }
    }

    try {
      const { latestVersion, currentVersion, isNewerAvailable } =
        await cliVersionCheckPromise;

      if (isNewerAvailable) {
        console.info(
          `A new version of the CLI is available: ${chalk.yellow(
            currentVersion,
          )} -> ${chalk.green(latestVersion)}. Update to ensure you have the latest features and bug fixes.`,
        );
      }
    } catch {
      // Ignore errors
    }

    if (debug) {
      console.debug(chalk.cyan("\nDebug mode enabled."));
      const user = getReflagUser();
      console.debug(`Logged in as ${chalk.cyan(user.name ?? user.email)}.`);
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
