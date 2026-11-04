import { expectTypeOf } from "vitest";

import { ReflagClient, type FlagValue } from "../src";

// Deliberately no Flags augmentation or generated declarations.
declare const client: ReflagClient;
const bound = client.bindClient({});

expectTypeOf(client.getFlag({}, "release")).toEqualTypeOf<boolean>();
expectTypeOf(client.getFlag({}, "release", false)).toEqualTypeOf<boolean>();
expectTypeOf(bound.getFlag("release")).toEqualTypeOf<boolean>();
expectTypeOf(client.getFlag({}, "number", 0)).toEqualTypeOf<number>();
expectTypeOf(bound.getFlag("string", "Swift")).toEqualTypeOf<string>();
expectTypeOf(client.getFlag({}, "json", null)).toEqualTypeOf<FlagValue>();
expectTypeOf(bound.getFlag("array", [])).toEqualTypeOf<FlagValue[]>();
expectTypeOf(bound.getFlag("array", [false])).toEqualTypeOf<boolean[]>();
const settings = client.getFlag({}, "settings", {
  model: "Swift",
  temperature: 0.7,
});
expectTypeOf(settings).toEqualTypeOf<{ model: string; temperature: number }>();
const { model } = bound.getFlag("settings", { model: "Swift" });
expectTypeOf(model).toEqualTypeOf<string>();
const frozen = {
  model: "Swift",
  nested: { enabled: false },
  items: [1],
} as const;
expectTypeOf(bound.getFlag("settings", frozen)).toEqualTypeOf<{
  model: string;
  nested: { enabled: boolean };
  items: number[];
}>();

expectTypeOf(client.getFlagRemote("release", undefined, 0, 0)).toEqualTypeOf<
  Promise<boolean>
>();
expectTypeOf(client.getFlagRemote("string", "Swift", 0, 0)).toEqualTypeOf<
  Promise<string>
>();
expectTypeOf(bound.getFlagRemote("release")).toEqualTypeOf<Promise<boolean>>();
expectTypeOf(bound.getFlagRemote("settings", { model: "Swift" })).toEqualTypeOf<
  Promise<{ model: string }>
>();

// @ts-expect-error Boolean reads do not return the legacy wrapper, even with aliases.
const { isEnabled: _legacyAlias } = client.getFlag({}, "release");
const legacyValue = client.getFlag({}, "release");
// @ts-expect-error Assignment does not restore the wrapper type.
const _legacyProperty = legacyValue.isEnabled;

const dictionaryDefault: Record<string, string> = { model: "Swift" };
expectTypeOf(bound.getFlag("settings", dictionaryDefault)).toEqualTypeOf<
  Record<string, string>
>();

// @ts-expect-error Functions are not JSON defaults.
bound.getFlag("settings", () => false);
