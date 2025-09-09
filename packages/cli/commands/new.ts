import { Command } from "commander";
import { findUp } from "find-up";

import { configStore } from "../stores/config.js";
import { CONFIG_FILE_NAME } from "../utils/constants.js";
import {
  appIdOption,
  flagKeyOption,
  flagNameArgument,
  typesFormatOption,
  typesOutOption,
} from "../utils/options.js";

import { createFlagAction, generateTypesAction } from "./flags.js";
import { initAction } from "./init.js";

type NewArgs = {
  appId?: string;
  out: string;
  key?: string;
};

export const newAction = async (name: string | undefined, { key }: NewArgs) => {
  if (!(await findUp(CONFIG_FILE_NAME))) {
    await initAction();
  }
  await createFlagAction(name, {
    key,
  });
  await generateTypesAction();
};

export function registerNewCommand(cli: Command) {
  cli
    .command("new")
    .description(
      "Initialize the Reflag CLI, authenticates, and creates a new flag.",
    )
    .addOption(appIdOption)
    .addOption(typesOutOption)
    .addOption(typesFormatOption)
    .addOption(flagKeyOption)
    .addArgument(flagNameArgument)
    .action(newAction);

  // Update the config with the cli override values
  cli.hook("preAction", (command) => {
    const { appId, out, format } = command.opts();
    configStore.setConfig({
      appId,
      typesOutput: out ? [{ path: out, format: format || "react" }] : undefined,
    });
  });
}
