import { Ajv, ValidateFunction } from "ajv";
import {
  assign as assignJSON,
  parse as parseJSON,
  stringify as stringifyJSON,
} from "comment-json";
import equal from "fast-deep-equal";
import { findUp } from "find-up";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  CONFIG_FILE_NAME,
  DEFAULT_API_URL,
  DEFAULT_BASE_URL,
  DEFAULT_TYPES_OUTPUT,
  MODULE_ROOT,
  SCHEMA_URL,
} from "../utils/constants.js";
import { ConfigValidationError, handleError } from "../utils/errors.js";
import { stripTrailingSlash } from "../utils/urls.js";
import { current as currentVersion } from "../utils/version.js";

export const typeFormats = ["react", "node"] as const;
export type TypeFormat = (typeof typeFormats)[number];

export type TypesOutput = {
  path: string;
  format: TypeFormat;
};

type Config = {
  $schema: string;
  baseUrl: string;
  apiUrl: string;
  appId: string | undefined;
  typesOutput: TypesOutput[];
};

const defaultConfig: Config = {
  $schema: SCHEMA_URL,
  baseUrl: DEFAULT_BASE_URL,
  apiUrl: DEFAULT_API_URL,
  appId: undefined,
  typesOutput: [{ path: DEFAULT_TYPES_OUTPUT, format: "react" }],
};

// Helper to normalize typesOutput to array format
export function normalizeTypesOutput(
  output?: string | TypesOutput[],
): TypesOutput[] | undefined {
  if (!output) return undefined;
  if (typeof output === "string") {
    return [{ path: output, format: "react" }];
  }
  return output;
}

class ConfigStore {
  protected config: Config = { ...defaultConfig };
  protected configPath: string | undefined;
  protected projectPath: string | undefined;
  protected clientVersion: string | undefined;
  protected validateConfig: ValidateFunction | undefined;

  async initialize() {
    await this.createValidator();
    await this.loadConfigFile();
  }

  protected async createValidator() {
    try {
      // Using current config store file, resolve the schema.json path
      const schemaPath = join(MODULE_ROOT, "schema.json");
      const content = await readFile(schemaPath, "utf-8");
      const parsed = parseJSON(content) as unknown as Config;

      const ajv = new Ajv();
      this.validateConfig = ajv.compile(parsed);
    } catch {
      handleError(new Error("Failed to load the config schema"), "Config");
    }
  }

  protected async loadConfigFile() {
    if (!this.validateConfig) {
      handleError(new Error("Failed to load the config schema"), "Config");
    }

    // Load the client version from the module's package.json metadata
    try {
      const { version } = await currentVersion();
      this.clientVersion = version;
    } catch {
      // Should not be the case, but ignore if no package.json is found
    }

    try {
      const projectMetadataPath = await findUp("package.json");
      this.configPath = await findUp(CONFIG_FILE_NAME);
      this.projectPath = dirname(
        this.configPath ?? projectMetadataPath ?? process.cwd(),
      );

      if (!this.configPath) return;

      const content = await readFile(this.configPath, "utf-8");
      const parsed = parseJSON(content) as unknown as Partial<Config>;

      // Normalize values
      if (parsed.baseUrl)
        parsed.baseUrl = stripTrailingSlash(parsed.baseUrl.trim());
      if (parsed.apiUrl)
        parsed.apiUrl = stripTrailingSlash(parsed.apiUrl.trim());
      if (parsed.typesOutput?.length)
        parsed.typesOutput = normalizeTypesOutput(parsed.typesOutput);

      if (!this.validateConfig!(parsed)) {
        handleError(
          new ConfigValidationError(this.validateConfig!.errors),
          "Config",
        );
      }

      this.config = assignJSON(this.config, parsed);
    } catch {
      // No config file found
    }
  }

  /**
   * Create a new config file with initial values.
   * @param overwrite If true, overwrites existing config file. Defaults to false
   */
  async saveConfigFile(overwrite = false) {
    const configWithoutDefaults: Partial<Config> = assignJSON({}, this.config);

    // Only include non-default values and $schema
    for (const untypedKey in configWithoutDefaults) {
      const key = untypedKey as keyof Config;
      if (
        !["$schema"].includes(key) &&
        equal(configWithoutDefaults[key], defaultConfig[key])
      ) {
        delete configWithoutDefaults[key];
      }
    }

    const configJSON = stringifyJSON(configWithoutDefaults, null, 2);

    if (this.configPath && !overwrite) {
      throw new Error("Config file already exists");
    }

    if (this.configPath) {
      await writeFile(this.configPath, configJSON);
    } else {
      // Write to the project path
      const packageJSONPath = await findUp("package.json");
      this.projectPath = dirname(packageJSONPath ?? process.cwd());
      this.configPath = join(this.projectPath, CONFIG_FILE_NAME);
      await writeFile(this.configPath, configJSON);
    }
  }

  getConfig(): Config;
  getConfig<K extends keyof Config>(key: K): Config[K];
  getConfig<K extends keyof Config>(key?: K) {
    return key ? this.config?.[key] : this.config;
  }

  getConfigPath() {
    return this.configPath;
  }

  getClientVersion() {
    return this.clientVersion;
  }

  getProjectPath() {
    return this.projectPath ?? process.cwd();
  }

  setConfig(newConfig: Partial<Config>) {
    // Update the config with new values skipping undefined values
    for (const untypedKey in newConfig) {
      const key = untypedKey as keyof Config;
      if (newConfig[key] === undefined) continue;
      (this.config as any)[key] = newConfig[key];
    }
  }
}

export const configStore = new ConfigStore();
