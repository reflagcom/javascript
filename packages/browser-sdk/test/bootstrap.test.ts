import { expect, test } from "vitest";

import { isValidBootstrapSnapshot } from "../src/flag/bootstrap";
import { selectedFlag } from "./mocks/handlers";

const snapshot = {
  protocolVersion: 2,
  flags: { flagA: selectedFlag(true) },
};

test.each([
  ["unversioned selections", snapshot, true],
  ["empty flags", { ...snapshot, flags: {} }, true],
  ["snapshot version zero", { ...snapshot, flagStateVersion: 0 }, true],
  [
    "unresolved Node bootstrap",
    {
      ...snapshot,
      flags: {
        flagA: {
          value: undefined,
          resolved: false,
          ruleResults: [],
          errors: [],
        },
      },
    },
    true,
  ],
  ["legacy protocol", { ...snapshot, protocolVersion: 1 }, false],
  ["missing protocol", { ...snapshot, protocolVersion: undefined }, false],
  ["missing flags", { ...snapshot, flags: undefined }, false],
  ["array flags", { ...snapshot, flags: [] }, false],
  [
    "legacy wrappers",
    { ...snapshot, flags: { flagA: { isEnabled: true } } },
    false,
  ],
  ["negative version", { ...snapshot, flagStateVersion: -1 }, false],
  ["fractional version", { ...snapshot, flagStateVersion: 1.5 }, false],
  ["non-numeric version", { ...snapshot, flagStateVersion: "1" }, false],
  ["NaN version", { ...snapshot, flagStateVersion: NaN }, false],
  ["infinite version", { ...snapshot, flagStateVersion: Infinity }, false],
] as const)("validates %s consistently", (_name, input, expected) => {
  expect(isValidBootstrapSnapshot(input)).toBe(expected);
});
