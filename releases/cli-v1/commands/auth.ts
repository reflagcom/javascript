import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";

import { authStore } from "../stores/auth.js";
import { configStore } from "../stores/config.js";
import { waitForAccessToken } from "../utils/auth.js";
import { handleError } from "../utils/errors.js";

export const loginAction = async () => {
  const { baseUrl, apiUrl } = configStore.getConfig();
  const { token, isApiKey } = authStore.getToken(baseUrl);

  if (isApiKey) {
    handleError(
      "Login is not allowed when an API token was supplied.",
      "Login",
    );
  }

  if (token) {
    console.log("Already logged in, nothing to do.");
    return;
  }

  try {
    const { accessToken } = await waitForAccessToken(baseUrl, apiUrl);
    await authStore.setToken(baseUrl, accessToken);

    console.log(`Logged in to ${chalk.cyan(baseUrl)} successfully!`);
  } catch (error) {
    console.error("Login failed.");
    handleError(error, "Login");
  }
};

export const logoutAction = async () => {
  const baseUrl = configStore.getConfig("baseUrl");

  const { token, isApiKey } = authStore.getToken(baseUrl);

  if (isApiKey) {
    handleError(
      "Logout is not allowed when an API token was supplied.",
      "Logout",
    );
  }

  if (!token) {
    console.log("Not logged in, nothing to do.");
    return;
  }

  const spinner = ora("Logging out...").start();

  try {
    await authStore.setToken(baseUrl, null);

    spinner.succeed("Logged out successfully!");
  } catch (error) {
    spinner.fail("Logout failed.");
    handleError(error, "Logout");
  }
};

export function registerAuthCommands(cli: Command) {
  cli.command("login").description("Login to Reflag.").action(loginAction);

  cli.command("logout").description("Logout from Reflag.").action(logoutAction);
}
