import { FlagValue, ReflagClient } from "@reflag/browser-sdk";

declare const client: ReflagClient;
const _enabled: boolean = client.getFlag("release");
const _model: string = client.getFlag("model", "quick");
const settings = client.getFlag("settings", {
  model: "quick",
  limits: [1],
} as const);
settings.model = "quality";
settings.limits.push(2);
const _arbitrary: FlagValue = client.getFlag("nullable", null);
const _values: Record<string, FlagValue | undefined> = client.getFlags();

// @ts-expect-error bare reads no longer return wrappers
const { isEnabled: _isEnabled } = client.getFlag("release");
// @ts-expect-error JSON defaults cannot contain undefined
client.getFlag("settings", { invalid: undefined });
// @ts-expect-error literal defaults widen to string, not a specific authored variant
const _literal: "quick" = client.getFlag("model", "quick");
