import { expectTypeOf } from "vitest";

import { ReflagClient } from "../src";

declare module "../src" {
  interface Flags {
    release: boolean;
    settings: { model: string } | null;
    legacy: { isEnabled: boolean; config: { payload: string } };
  }
}

declare const client: ReflagClient;
const bound = client.bindClient({});

expectTypeOf(client.getFlag({}, "legacy")).toEqualTypeOf<boolean>();
expectTypeOf(bound.getFlag("settings", { model: "Swift" })).toEqualTypeOf<{
  model: string;
}>();
// A registry cannot silently change the runtime Boolean contract of a bare read.
expectTypeOf(bound.getFlag("settings")).toEqualTypeOf<boolean>();
expectTypeOf(client.getFlagRemote("settings")).toEqualTypeOf<
  Promise<boolean>
>();
expectTypeOf(client.getFlags({}).settings).toEqualTypeOf<
  { model: string } | null | undefined
>();
// @ts-expect-error Registered keys still reject unknown flag names.
client.getFlag({}, "unknown");
// @ts-expect-error Registered keys also apply to explicit defaults.
bound.getFlag("unknown", { model: "Swift" });
// @ts-expect-error Old generated wrapper types cannot restore the singular wrapper API.
const { isEnabled: _legacyAlias } = bound.getFlag("legacy");
const legacy = client.getFlag({}, "legacy");
// @ts-expect-error Nor can accessing an assigned singular result.
const _legacyProperty = legacy.isEnabled;
