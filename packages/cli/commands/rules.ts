import { confirm } from "@inquirer/prompts";
import chalk from "chalk";
import { Command } from "commander";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import ora from "ora";

import { getCopilotInstructions, getCursorRules } from "../services/rules.js";
import { configStore } from "../stores/config.js";
import { handleError } from "../utils/errors.js";
import { fileExists } from "../utils/file.js";
import { rulesFormatOption, yesOption } from "../utils/options.js";

type RulesArgs = {
  format?: string;
  yes?: boolean;
};

const REFLAG_SECTION_START = "<!-- REFLAG_START -->";
const REFLAG_SECTION_END = "<!-- REFLAG_END -->";

async function confirmOverwrite(
  filePath: string,
  yes: boolean,
  append: boolean = false,
): Promise<boolean> {
  if (yes) return true;

  if (await fileExists(filePath)) {
    const projectPath = configStore.getProjectPath();
    const relativePath = relative(projectPath, filePath);

    return await confirm({
      message: `Rules ${chalk.cyan(relativePath)} already exists. ${
        append ? "Append rules?" : "Overwrite rules?"
      }`,
      default: false,
    });
  }

  return true;
}

function wrapInMarkers(content: string): string {
  return `${REFLAG_SECTION_START}\n\n${content}\n\n${REFLAG_SECTION_END}`;
}

function replaceOrAppendSection(
  existingContent: string,
  newContent: string,
): string {
  const wrappedContent = wrapInMarkers(newContent);
  const sectionRegex = new RegExp(
    `${REFLAG_SECTION_START}[\\s\\S]*?${REFLAG_SECTION_END}`,
    "g",
  );

  if (sectionRegex.test(existingContent)) {
    return existingContent.replace(sectionRegex, wrappedContent);
  }

  return `${existingContent}\n\n${wrappedContent}`;
}

export const rulesAction = async ({
  format = "cursor",
  yes = false,
}: RulesArgs = {}) => {
  const projectPath = configStore.getProjectPath();
  const appendFormats = ["copilot"];
  let destPath: string;
  let content: string;

  // Determine destination and content based on format
  if (format === "cursor") {
    destPath = join(projectPath, ".cursor", "rules", "reflag.mdc");
    content = getCursorRules();
  } else if (format === "copilot") {
    destPath = join(projectPath, ".github", "copilot-instructions.md");
    content = getCopilotInstructions();
  } else {
    console.error(`No rules added. Invalid format ${chalk.cyan(format)}.`);
    return;
  }

  // Check for overwrite and write file
  if (await confirmOverwrite(destPath, yes, appendFormats.includes(format))) {
    const spinner = ora("Adding rules...").start();
    try {
      await mkdir(dirname(destPath), { recursive: true });

      if (appendFormats.includes(format) && (await fileExists(destPath))) {
        const existingContent = await readFile(destPath, "utf-8");
        content = replaceOrAppendSection(existingContent, content);
      }

      await writeFile(destPath, content);
      spinner.succeed(
        `Rules added to ${chalk.cyan(relative(projectPath, destPath))}.
${chalk.grey("These rules should be committed to your project's version control.")}`,
      );
    } catch (error) {
      spinner.fail("Failed to add rules.");
      handleError(error, "Rules");
    }
  } else {
    console.log("Skipping adding rules.");
  }
};

export function registerRulesCommand(cli: Command) {
  cli
    .command("rules")
    .description("Add Reflag LLM rules to your project.")
    .addOption(rulesFormatOption)
    .addOption(yesOption)
    .action(rulesAction);
}
