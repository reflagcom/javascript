import { expectTypeOf } from "vitest";

import { ReflagClient, type FlagValue } from "../src";

interface Prompt {
  tone: string;
}
interface Settings {
  model: string;
  prompt: Prompt;
  methods: string[];
}

declare module "../src" {
  interface Flags {
    release: boolean;
    settings: { model: string } | null;
    "assistant-settings": Settings;
    days: number;
    arbitrary: FlagValue;
    unknownArray: FlagValue[];
    methods: string[];
    model: "Swift" | "Reasoner";
    legacy: { isEnabled: boolean; config: { payload: string } };
  }
}

declare const client: ReflagClient;
const bound = client.bindClient({});

expectTypeOf(client.getFlag({}, "legacy")).toEqualTypeOf<boolean>();
expectTypeOf(bound.getFlag("settings", { model: "Swift" })).toEqualTypeOf<{
  model: string;
}>();
expectTypeOf(bound.getFlag("settings")).toEqualTypeOf<boolean>();
expectTypeOf(client.getFlagRemote("settings")).toEqualTypeOf<
  Promise<boolean>
>();
expectTypeOf(client.getFlags({}).settings).toEqualTypeOf<
  { model: string } | null | undefined
>();
expectTypeOf(bound.getFlag("days", null)).toEqualTypeOf<FlagValue>();
expectTypeOf(bound.getFlag("model", "Swift")).toEqualTypeOf<string>();
expectTypeOf(bound.getFlag("methods", ["standard"] as const)).toEqualTypeOf<
  string[]
>();

const fallback: Settings = {
  model: "Swift",
  prompt: { tone: "concise" },
  methods: ["standard"],
};
expectTypeOf(
  client.getFlag({}, "assistant-settings", fallback),
).toEqualTypeOf<Settings>();
expectTypeOf(
  bound.getFlag("assistant-settings", fallback),
).toEqualTypeOf<Settings>();
expectTypeOf(bound.getFlag("arbitrary", fallback)).toEqualTypeOf<Settings>();
expectTypeOf(bound.getFlag("unknownArray", [fallback])).toEqualTypeOf<
  Settings[]
>();
expectTypeOf(
  client.getFlagRemote("assistant-settings", fallback),
).toEqualTypeOf<Promise<Settings>>();
expectTypeOf(bound.getFlagRemote("assistant-settings", fallback)).toEqualTypeOf<
  Promise<Settings>
>();
const frozen = {
  model: "Swift",
  prompt: { tone: "concise" },
  methods: ["standard"],
} as const;
const mutable = bound.getFlag("assistant-settings", frozen);
mutable.model = "Reasoner";
mutable.prompt.tone = "detailed";
mutable.methods.push("express");

// @ts-expect-error Unknown keys are rejected.
client.getFlag({}, "unknown");
// @ts-expect-error Registered keys also apply to explicit defaults.
bound.getFlag("unknown", { model: "Swift" });
// @ts-expect-error Defaults must match this key, not another registered key's number type.
client.getFlag({}, "settings", 123);
// @ts-expect-error Bound getters check the registered value shape.
bound.getFlag("assistant-settings", { model: "Swift" });
// @ts-expect-error Nested properties are checked against the registered schema.
bound.getFlag("assistant-settings", {
  model: "Swift",
  prompt: { tone: 3 },
  methods: [],
});
// @ts-expect-error Array elements are checked.
bound.getFlag("methods", [123]);
// @ts-expect-error Literal unions constrain defaults even though results widen.
bound.getFlag("model", "Unknown");
// @ts-expect-error Boolean defaults cannot request an object-valued registered flag.
bound.getFlag("settings", false);
// @ts-expect-error Remote root getters also check the registered schema.
client.getFlagRemote("settings", 123);
// @ts-expect-error Bound remote getters also check the registered schema.
bound.getFlagRemote("days", "three");
// @ts-expect-error Old generated wrapper types cannot restore the singular wrapper API.
const { isEnabled: _legacyAlias } = bound.getFlag("legacy");
const legacy = client.getFlag({}, "legacy");
// @ts-expect-error Nor can accessing an assigned singular result.
const _legacyProperty = legacy.isEnabled;
