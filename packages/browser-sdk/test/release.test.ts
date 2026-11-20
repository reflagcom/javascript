import { createRequire } from "node:module";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import openfeature from "../../openfeature-browser-provider/package.json";
import native from "../../react-native-sdk/package.json";
import bootstrap from "../../react-sdk/dev/nextjs-bootstrap-demo/package.json";
import react from "../../react-sdk/package.json";
import vue from "../../vue-sdk/package.json";
import browser from "../package.json";

const nativeRequire = createRequire(
  resolve(__dirname, "../../react-native-sdk/package.json"),
);
const openfeatureRequire = createRequire(
  resolve(__dirname, "../../openfeature-browser-provider/package.json"),
);
const bootstrapRequire = createRequire(
  resolve(__dirname, "../../react-sdk/dev/nextjs-bootstrap-demo/package.json"),
);

describe("framework v1/v2 release isolation", () => {
  test("uses workspace v2 for React, Vue and React Native", () => {
    expect(browser.version).toMatch(/^2\.\d+\.\d+(?:-next\.\d+)?$/);
    expect(react.dependencies["@reflag/browser-sdk"]).toBe(
      `^${browser.version}`,
    );
    expect(vue.dependencies["@reflag/browser-sdk"]).toBe(`^${browser.version}`);
    expect(native.version).toMatch(/^2\.\d+\.\d+(?:-next\.\d+)?$/);
    expect(native.dependencies["@reflag/react-sdk"]).toBe(`^${react.version}`);
    expect(nativeRequire.resolve("@reflag/react-sdk")).toBe(
      resolve(__dirname, "../../react-sdk/dist/reflag-react-sdk.umd.js"),
    );
  });

  test("uses matching workspace Node v2 for the React bootstrap demo", () => {
    expect(bootstrap.dependencies["@reflag/node-sdk"]).toBe("workspace:^");
    expect(bootstrap.dependencies).not.toHaveProperty("@reflag/node-sdk-v1");
    expect(bootstrapRequire.resolve("@reflag/node-sdk")).toBe(
      resolve(__dirname, "../../node-sdk/dist/src/index.js"),
    );
  });

  test("keeps the unchanged OpenFeature Browser provider on published v1", () => {
    expect(openfeature.dependencies["@reflag/browser-sdk"]).toBe("1.7.4");
    expect(openfeatureRequire.resolve("@reflag/browser-sdk")).not.toBe(
      resolve(__dirname, "../dist/reflag-browser-sdk.umd.js"),
    );
  });
});
