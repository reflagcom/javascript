import { Command } from "commander";

import { configStore, type TypeFormat } from "../stores/config.js";
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
  out?: string;
  format?: TypeFormat;
  key?: string;
};

export const newAction = async (
  name: string | undefined,
  { appId, out, format, key }: NewArgs,
) => {
  if (!configStore.getConfigPath()) {
    await initAction({ appId });
  }
  configStore.setConfig({
    appId,
    typesOutput: out ? [{ path: out, format: format || "react" }] : undefined,
  });
  await createFlagAction(name, { key });
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
}
