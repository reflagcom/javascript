import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";

import { listApps } from "../services/apps.js";
import { configStore } from "../stores/config.js";
import { handleError } from "../utils/errors.js";

export const listAppsAction = async () => {
  const baseUrl = configStore.getConfig("baseUrl");
  const spinner = ora(`Loading apps from ${chalk.cyan(baseUrl)}...`).start();

  try {
    const apps = await listApps();
    if (!apps.length) throw new Error("No apps found.");
    spinner.succeed(`Loaded apps from ${chalk.cyan(baseUrl)}.`);
    console.table(
      apps.map(({ name, id, org, demo }) => ({
        name,
        id,
        organization: org.name,
        orgId: org.id,
        demo,
      })),
    );
  } catch (error) {
    spinner.fail("Failed to list apps.");
    handleError(error, "Apps List");
  }
};

export function registerAppCommands(cli: Command) {
  const appsCommand = new Command("apps").description("Manage apps.");

  appsCommand
    .command("list")
    .alias("ls")
    .description("List all available apps.")
    .action(listAppsAction);

  cli.addCommand(appsCommand);
}
