import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import * as legacy from "@reflag/flag-evaluation-v1";

import nodeSdk from "../../node-sdk/package.json";
import openfeature from "../../openfeature-node-provider/package.json";

describe("v1/v2 release isolation", () => {
  it("resolves the legacy alias to the published package, not this workspace", () => {
    // Catches Yarn transparent workspace linking even before dist is rebuilt.
    expect(require.resolve("@reflag/flag-evaluation-v1/package.json")).not.toBe(
      resolve(__dirname, "../package.json"),
    );
    expect(typeof legacy.evaluateFlagRules).toBe("function");
  });

  it("moves the v2 Node SDK onto the collection evaluator", () => {
    expect(nodeSdk.dependencies["@reflag/flag-evaluation"]).toBe("workspace:*");
    expect(nodeSdk.dependencies).not.toHaveProperty(
      "@reflag/flag-evaluation-v1",
    );
  });

  it("keeps the unchanged OpenFeature provider on published Node SDK v1", () => {
    expect(openfeature.dependencies["@reflag/node-sdk-v1"]).toBe(
      "npm:@reflag/node-sdk@1.8.0",
    );
    expect(openfeature.dependencies).not.toHaveProperty("@reflag/node-sdk");
  });
});
