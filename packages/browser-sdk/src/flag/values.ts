export type FlagValue =
  | null
  | boolean
  | number
  | string
  | FlagValue[]
  | { [key: string]: FlagValue };

export type FlagDefaultValue =
  | null
  | boolean
  | number
  | string
  | readonly FlagDefaultValue[]
  | { readonly [key: string]: FlagDefaultValue };

/** Widen literals and return mutable copies. Null requests arbitrary JSON. */
export type FlagValueFromDefault<T> = T extends null
  ? FlagValue
  : T extends boolean
    ? boolean
    : T extends number
      ? number
      : T extends string
        ? string
        : T extends readonly (infer Element)[]
          ? [Element] extends [never]
            ? FlagValue[]
            : FlagValueFromDefault<Element>[]
          : T extends object
            ? { -readonly [Key in keyof T]: FlagValueFromDefault<T[Key]> }
            : never;

export function isFlagValue(
  value: unknown,
  ancestors = new Set<object>(),
): value is FlagValue {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return false;
  ancestors.add(value);
  const valid = Object.values(value).every((entry) =>
    isFlagValue(entry, ancestors),
  );
  ancestors.delete(value);
  return valid;
}

export function flagValueType(value: FlagValue): string {
  return value === null
    ? "null"
    : Array.isArray(value)
      ? "array"
      : typeof value;
}

/** JSON cloning also works in runtimes without structuredClone. */
export function copyJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function resolveFlagValue(
  value: FlagValue | undefined,
  defaultValue: FlagDefaultValue,
) {
  if (!isFlagValue(defaultValue))
    throw new Error("defaultValue must be a JSON value");
  const typeMismatch =
    value !== undefined &&
    defaultValue !== null &&
    flagValueType(value) !== flagValueType(defaultValue);
  const usedDefault = value === undefined || typeMismatch;
  return {
    value: copyJSON(usedDefault ? defaultValue : value) as FlagValue,
    usedDefault,
    typeMismatch,
  };
}
