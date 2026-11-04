import { createRequire } from "node:module";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import openfeature from "../../openfeature-browser-provider/package.json";
import native from "../../react-native-sdk/package.json";
import react from "../../react-sdk/package.json";
import vue from "../../vue-sdk/package.json";
import browser from "../package.json";

const nativeRequire = createRequire(
  resolve(__dirname, "../../react-native-sdk/package.json"),
);
const openfeatureRequire = createRequire(
  resolve(__dirname, "../../openfeature-browser-provider/package.json"),
);

describe("framework v1/v2 release isolation", () => {
  test("uses workspace Browser v2 for React and Vue", () => {
    expect(browser.version).toBe("2.0.0-next.0");
    expect(react.dependencies["@reflag/browser-sdk"]).toBe("workspace:^");
    expect(vue.dependencies["@reflag/browser-sdk"]).toBe("workspace:^");
  });

  test("keeps unchanged React Native and OpenFeature Browser consumers on published v1", () => {
    expect(native.dependencies["@reflag/react-sdk"]).toBe("1.7.0");
    expect(openfeature.dependencies["@reflag/browser-sdk"]).toBe("1.7.0");
    expect(nativeRequire.resolve("@reflag/react-sdk")).not.toBe(
      resolve(__dirname, "../../react-sdk/dist/reflag-react-sdk.umd.js"),
    );
    expect(openfeatureRequire.resolve("@reflag/browser-sdk")).not.toBe(
      resolve(__dirname, "../dist/reflag-browser-sdk.umd.js"),
    );
  });
});
