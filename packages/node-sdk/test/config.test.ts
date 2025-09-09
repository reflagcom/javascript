import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config";

describe("config tests", () => {
  it("should load config file", () => {
    const config = loadConfig("test/testConfig.json");

    expect(config).toEqual({
      flagOverrides: {
        myFlag: {
          isEnabled: true,
        },
        myFlagFalse: false,
        myFlagWithConfig: {
          isEnabled: true,
          config: {
            key: "config-1",
            payload: { something: "else" },
          },
        },
      },
      secretKey: "mySecretKey",
      offline: true,
      apiBaseUrl: "http://localhost:3000",
    });
  });

  it("should load ENV VARS", () => {
    process.env.REFLAG_SECRET_KEY = "mySecretKeyFromEnv";
    process.env.REFLAG_OFFLINE = "true";
    process.env.REFLAG_API_BASE_URL = "http://localhost:4999";
    process.env.REFLAG_FLAGS_ENABLED = "myNewFlag";
    process.env.REFLAG_FLAGS_DISABLED = "myNewFlagFalse";

    const config = loadConfig("test/testConfig.json");
    expect(config).toEqual({
      flagOverrides: {
        myFlag: {
          isEnabled: true,
        },
        myFlagFalse: false,
        myNewFlag: true,
        myNewFlagFalse: false,
        myFlagWithConfig: {
          isEnabled: true,
          config: {
            key: "config-1",
            payload: { something: "else" },
          },
        },
      },
      secretKey: "mySecretKeyFromEnv",
      offline: true,
      apiBaseUrl: "http://localhost:4999",
    });
  });
});
