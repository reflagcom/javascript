import { input } from "@inquirer/prompts";
import chalk from "chalk";
import { Command } from "commander";
import { relative } from "node:path";
import ora, { Ora } from "ora";

import { App, getApp, getOrg } from "../services/bootstrap.js";
import { createFlag, Flag, listFlags } from "../services/flags.js";
import { configStore } from "../stores/config.js";
import {
  handleError,
  MissingAppIdError,
  MissingEnvIdError,
} from "../utils/errors.js";
import {
  genFlagKey,
  genTypes,
  indentLines,
  KeyFormatPatterns,
  writeTypesToFile,
} from "../utils/gen.js";
import {
  appIdOption,
  flagKeyOption,
  flagNameArgument,
  typesFormatOption,
  typesOutOption,
} from "../utils/options.js";
import { baseUrlSuffix, featureUrl } from "../utils/urls.js";

type CreateFlagOptions = {
  key?: string;
};

export const createFlagAction = async (
  name: string | undefined,
  { key }: CreateFlagOptions,
) => {
  const { baseUrl, appId } = configStore.getConfig();
  let spinner: Ora | undefined;

  if (!appId) {
    handleError(new MissingAppIdError(), "Flags Create");
  }

  let app: App;
  try {
    app = getApp(appId);
  } catch (error) {
    handleError(error, "Flags Create");
  }

  const production = app.environments.find((e) => e.isProduction);

  try {
    const org = getOrg();
    console.log(
      `Creating flag for app ${chalk.cyan(app.name)}${baseUrlSuffix(baseUrl)}.`,
    );

    if (!name) {
      name = await input({
        message: "New flag name:",
        validate: (text) => text.length > 0 || "Name is required.",
      });
    }

    if (!key) {
      const keyFormat = org.featureKeyFormat;
      const keyValidator = KeyFormatPatterns[keyFormat];
      key = await input({
        message: "New flag key:",
        default: genFlagKey(name, keyFormat),
        validate: (str) => keyValidator.regex.test(str) || keyValidator.message,
      });
    }

    spinner = ora(`Creating flag...`).start();
    const flag = await createFlag(appId, { name, key });

    spinner.succeed(
      `Created flag ${chalk.cyan(flag.name)} with key ${chalk.cyan(flag.key)}:`,
    );
    if (production) {
      console.log(
        indentLines(chalk.magenta(featureUrl(baseUrl, production, flag))),
      );
    }
  } catch (error) {
    spinner?.fail("Flag creation failed.");
    handleError(error, "Flags Create");
  }
};

export const listFlagsAction = async () => {
  const { baseUrl, appId } = configStore.getConfig();
  let spinner: Ora | undefined;

  if (!appId) {
    handleError(new MissingAppIdError(), "Flags Create");
  }

  try {
    const app = getApp(appId);
    const production = app.environments.find((e) => e.isProduction);
    if (!production) {
      handleError(new MissingEnvIdError(), "Flags Types");
    }

    spinner = ora(
      `Loading flags of app ${chalk.cyan(app.name)}${baseUrlSuffix(baseUrl)}...`,
    ).start();

    const flagsResponse = await listFlags(appId, {
      envId: production.id,
    });

    spinner.succeed(
      `Loaded flags of app ${chalk.cyan(app.name)}${baseUrlSuffix(baseUrl)}.`,
    );

    console.table(
      flagsResponse.data.map(({ key, name, stage }) => ({
        name,
        key,
        stage: stage?.name,
      })),
    );
  } catch (error) {
    spinner?.fail("Loading flags failed.");
    handleError(error, "Flags List");
  }
};

export const generateTypesAction = async () => {
  const { baseUrl, appId } = configStore.getConfig();
  const typesOutput = configStore.getConfig("typesOutput");

  let spinner: Ora | undefined;
  let flags: Flag[] = [];

  if (!appId) {
    handleError(new MissingAppIdError(), "Flags Types");
  }

  let app: App;
  try {
    app = getApp(appId);
  } catch (error) {
    handleError(error, "Flags Types");
  }

  const production = app.environments.find((e) => e.isProduction);
  if (!production) {
    handleError(new MissingEnvIdError(), "Flags Types");
  }

  try {
    spinner = ora(
      `Loading flags of app ${chalk.cyan(app.name)}${baseUrlSuffix(baseUrl)}...`,
    ).start();

    flags = await listFlags(appId, {
      envId: production.id,
      includeRemoteConfigs: true,
    }).then((res) => res.data);

    spinner.succeed(
      `Loaded flags of app ${chalk.cyan(app.name)}${baseUrlSuffix(baseUrl)}.`,
    );
  } catch (error) {
    spinner?.fail("Loading flags failed.");
    handleError(error, "Flags Types");
  }

  try {
    spinner = ora(`Generating flag types...`).start();
    const projectPath = configStore.getProjectPath();

    // Generate types for each output configuration
    for (const output of typesOutput) {
      const types = genTypes(flags, output.format);

      const outPath = await writeTypesToFile(types, output.path, projectPath);
      spinner.succeed(
        `Generated ${output.format} types in ${chalk.cyan(relative(projectPath, outPath))}.`,
      );
    }
  } catch (error) {
    spinner?.fail("Type generation failed.");
    handleError(error, "Flags Types");
  }
};

export function registerFlagCommands(cli: Command) {
  const flagsCommand = new Command("flags").description("Manage flags.");

  flagsCommand
    .command("create")
    .description("Create a new flag.")
    .addOption(appIdOption)
    .addOption(flagKeyOption)
    .addArgument(flagNameArgument)
    .action(createFlagAction);

  flagsCommand
    .command("list")
    .alias("ls")
    .description("List all flags.")
    .addOption(appIdOption)
    .action(listFlagsAction);

  flagsCommand
    .command("types")
    .description("Generate flag types.")
    .addOption(appIdOption)
    .addOption(typesOutOption)
    .addOption(typesFormatOption)
    .action(generateTypesAction);

  // Update the config with the cli override values
  flagsCommand.hook("preAction", (_, command) => {
    const { appId, out, format } = command.opts();
    configStore.setConfig({
      appId,
      typesOutput: out ? [{ path: out, format: format || "react" }] : undefined,
    });
  });

  cli.addCommand(flagsCommand);
}
