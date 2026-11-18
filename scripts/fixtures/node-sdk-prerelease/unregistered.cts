import { ReflagClient, type FlagValue } from "@reflag/node-sdk";

interface Settings {
  model: string;
  limits: { maxItems: number };
}
const defaults: Settings = { model: "quick", limits: { maxItems: 10 } };
const readonlyDefaults = { model: "quick", limits: { maxItems: 10 } } as const;
const client = new ReflagClient({ offline: true });
const value: Settings = client.getFlag({}, "settings", defaults);
const mutable = client.bindClient({}).getFlag("settings", readonlyDefaults);
mutable.model = "quality";
mutable.limits.maxItems = 20;
const enabled: boolean = client.getFlag({}, "settings");
const explicitUndefined: boolean = client.getFlag({}, "settings", undefined);
const arbitrary: FlagValue = client.getFlag({}, "settings", null);
const remote: Promise<Settings> = client.getFlagRemote("settings", defaults);
const count: number = client.getFlag({}, "count", 0);
const label: string = client.getFlag({}, "label", "");
const list: string[] = client.getFlag({}, "list", ["fallback"]);
type IsAny<T> = 0 extends 1 & T ? true : false;
const notAny: IsAny<typeof mutable> = false;
// @ts-expect-error singular reads do not return wrappers
void value.isEnabled;
// @ts-expect-error Boolean-first bare reads do not infer object payloads
const missingDefault: Settings = client.getFlag({}, "settings");
// @ts-expect-error widening must not preserve readonly primitive literals
const literal: "quick" = mutable.model;
void [
  value,
  enabled,
  explicitUndefined,
  arbitrary,
  remote,
  count,
  label,
  list,
  notAny,
  missingDefault,
  literal,
];
