import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import * as legacy from "@reflag/flag-evaluation-v1";

import nodeSdk from "../../node-sdk/package.json";

describe("v1/v2 release isolation", () => {
  it("resolves the legacy alias to the published package, not this workspace", () => {
    // Catches Yarn transparent workspace linking even before dist is rebuilt.
    expect(require.resolve("@reflag/flag-evaluation-v1/package.json")).not.toBe(
      resolve(__dirname, "../package.json"),
    );
    expect(typeof legacy.evaluateFlagRules).toBe("function");
  });

  it("keeps the unchanged Node SDK off the v2 workspace dependency", () => {
    expect(nodeSdk.dependencies).not.toHaveProperty("@reflag/flag-evaluation");
    expect(nodeSdk.dependencies["@reflag/flag-evaluation-v1"]).toBe(
      "npm:@reflag/flag-evaluation@1.1.1",
    );
  });
});
