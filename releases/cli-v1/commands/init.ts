import { relative } from "node:path";

import { input, select } from "@inquirer/prompts";
import chalk from "chalk";
import { Command } from "commander";
import ora, { Ora } from "ora";

import { getApp, listOrganizations } from "../services/apps.js";
import { configStore, typeFormats } from "../stores/config.js";
import { DEFAULT_TYPES_OUTPUT } from "../utils/constants.js";
import { handleError } from "../utils/errors.js";
import { appIdOption, overwriteOption } from "../utils/options.js";

type InitArgs = {
  appId?: string;
  overwrite?: boolean;
};

export const initAction = async ({
  appId: requestedAppId,
  overwrite,
}: InitArgs = {}) => {
  let spinner: Ora | undefined;

  try {
    // Check if config already exists
    const configPath = configStore.getConfigPath();
    if (configPath && !overwrite) {
      throw new Error(
        "Reflag is already initialized. Use --overwrite to overwrite.",
      );
    }

    console.log("\nWelcome to ◪ Reflag!\n");
    spinner = ora("Loading organizations and apps...").start();
    let appId = requestedAppId;
    if (appId !== undefined) {
      await getApp(appId);
      spinner.stop();
    } else {
      const orgs = await listOrganizations();
      spinner.stop();
      if (!orgs.length) throw new Error("No accessible organizations found.");

      const org =
        orgs.length === 1
          ? orgs[0]
          : await select({
              message: "Select an organization",
              choices: orgs.map((candidate) => ({
                name: `${candidate.name} (${candidate.id})`,
                value: candidate,
              })),
            });

      if (!org.apps.length) {
        throw new Error(
          `No apps found in '${org.name}'. Choose another organization or create an app.`,
        );
      }

      appId = await select({
        message: `Select an app in ${org.name}`,
        default: org.apps.find((app) => !app.demo)?.id,
        choices: org.apps.map((app) => ({
          name: `${app.name}${app.demo ? " [Demo]" : ""} (${app.id})`,
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
    await configStore.saveConfigFile(overwrite);

    spinner.succeed(
      `Configuration created at ${chalk.cyan(relative(process.cwd(), configStore.getConfigPath()!))}.`,
    );
  } catch (error) {
    if (spinner?.isSpinning) spinner.fail();
    handleError(error, "Initialization");
  }
};

export function registerInitCommand(cli: Command) {
  cli
    .command("init")
    .description("Initialize a new Reflag configuration.")
    .addOption(overwriteOption)
    .addOption(appIdOption)
    .action(initAction);
}
