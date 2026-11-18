import { ReflagClient, type FlagValue } from "@reflag/node-sdk";

interface Settings {
  model: string;
  limits: { maxItems: number };
}
declare module "@reflag/node-sdk" {
  interface Flags {
    settings: Settings;
    model: "quick" | "quality";
    list: number[];
    arbitrary: FlagValue;
  }
}
const client = new ReflagClient({ offline: true });
const defaults: Settings = { model: "quick", limits: { maxItems: 10 } };
const value: Settings = client.getFlag({}, "settings", defaults);
const mutable = client.bindClient({}).getFlag("settings", {
  model: "quick",
  limits: { maxItems: 10 },
} as const);
mutable.limits.maxItems = 11;
const enabled: boolean = client.getFlag({}, "settings");
const arbitrary: FlagValue = client.getFlag({}, "settings", null);
const model: string = client.getFlag({}, "model", "quick");
client.getFlag({}, "arbitrary", { anyShape: [false, null, 0] });
// @ts-expect-error unknown registered key
client.getFlag({}, "unknown");
// @ts-expect-error missing required property
client.getFlag({}, "settings", { model: "quick" });
// @ts-expect-error incompatible nested property
client.getFlag({}, "settings", { model: "quick", limits: { maxItems: "ten" } });
// @ts-expect-error registered category mismatch
client.getFlag({}, "settings", 0);
// @ts-expect-error unknown registered literal
client.getFlag({}, "model", "unknown");
// @ts-expect-error wrong array element
client.bindClient({}).getFlag("list", ["bad"]);
// @ts-expect-error remote defaults obey the same registered schema
client.getFlagRemote("settings", { model: "quick" });
// @ts-expect-error direct values have no legacy config wrapper
void value.config.payload;
void [value, mutable, enabled, arbitrary, model];
