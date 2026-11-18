import { isFlagValue } from "./flag-definitions";
import type { FlagValue } from "./types";
import { ok } from "./utils";

export function checkFlagDefault(value: unknown): asserts value is FlagValue {
  ok(isFlagValue(value), "defaultValue must be a JSON value");
}

export function flagValueType(value: FlagValue): string {
  return value === null
    ? "null"
    : Array.isArray(value)
      ? "array"
      : typeof value;
}

/** Null is an explicit arbitrary-JSON read; other defaults require the same category. */
export function applyFlagDefault(
  value: FlagValue | undefined,
  defaultValue: FlagValue,
) {
  const typeMismatch =
    value !== undefined &&
    defaultValue !== null &&
    flagValueType(value) !== flagValueType(defaultValue);
  const usedDefault = value === undefined || typeMismatch;
  return {
    value: usedDefault ? defaultValue : value,
    usedDefault,
    typeMismatch,
  };
}
