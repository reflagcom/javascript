import { input, select } from "@inquirer/prompts";
import chalk from "chalk";
import { Command } from "commander";
import { relative } from "node:path";
import ora, { Ora } from "ora";

import { App, listApps } from "../services/bootstrap.js";
import { configStore, typeFormats } from "../stores/config.js";
import { DEFAULT_TYPES_OUTPUT } from "../utils/constants.js";
import { handleError } from "../utils/errors.js";
import { overwriteOption } from "../utils/options.js";

type InitArgs = {
  overwrite?: boolean;
};

export const initAction = async (args: InitArgs = {}) => {
  let spinner: Ora | undefined;
  let apps: App[] = [];

  try {
    // Check if config already exists
    const configPath = configStore.getConfigPath();
    if (configPath && !args.overwrite) {
      throw new Error(
        "Reflag is already initialized. Use --overwrite to overwrite.",
      );
    }

    console.log("\nWelcome to ◪ Reflag!\n");
    const baseUrl = configStore.getConfig("baseUrl");

    // Load apps
    spinner = ora(`Loading apps from ${chalk.cyan(baseUrl)}...`).start();
    apps = listApps();
    spinner.succeed(`Loaded apps from ${chalk.cyan(baseUrl)}.`);
  } catch (error) {
    spinner?.fail("Loading apps failed.");
    handleError(error, "Initialization");
  }

  try {
    let appId: string | undefined;
    const nonDemoApp = apps.find((app) => !app.demo);

    if (apps.length === 0) {
      throw new Error("You don't have any apps yet. Please create one.");
    } else {
      const longestName = Math.max(...apps.map((app) => app.name.length));
      appId = await select({
        message: "Select an app",
        default: nonDemoApp?.id,
        choices: apps.map((app) => ({
          name: `${app.name.padEnd(longestName, " ")}${app.demo ? " [Demo]" : ""}`,
          value: app.id,
        })),
      });
    }

    // Get types output path
    const typesOutput = await input({
      message: "Where should we generate the types?",
      default: DEFAULT_TYPES_OUTPUT,
    });

    // Get types output format
    const typesFormat = await select({
      message: "What is the output format?",
      choices: typeFormats.map((format) => ({
        name: format,
        value: format,
      })),
      default: "react",
    });

    // Update config
    configStore.setConfig({
      appId,
      typesOutput: [{ path: typesOutput, format: typesFormat }],
    });

    // Create config file
    spinner = ora("Creating configuration...").start();
    await configStore.saveConfigFile(args.overwrite);

    spinner.succeed(
      `Configuration created at ${chalk.cyan(relative(process.cwd(), configStore.getConfigPath()!))}.`,
    );
  } catch (error) {
    spinner?.fail("Configuration creation failed.");
    handleError(error, "Initialization");
  }
};

export function registerInitCommand(cli: Command) {
  cli
    .command("init")
    .description("Initialize a new Reflag configuration.")
    .addOption(overwriteOption)
    .action(initAction);
}
