type DefinedContextValue =
  | string
  | number
  | boolean
  | null
  | DefinedContextValue[]
  | { [key: string]: ContextValue };

export type ContextValue = DefinedContextValue | undefined;

/**
 * Serialize context with recursively sorted object keys. Array order is preserved.
 */
function canonicalJSONStringify(value: unknown): string {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value, (_key, nestedValue: unknown) => {
      if (typeof nestedValue === "bigint") return String(nestedValue);
      if (
        nestedValue === null ||
        typeof nestedValue !== "object" ||
        Array.isArray(nestedValue)
      ) {
        return nestedValue;
      }

      return Object.fromEntries(
        Object.entries(nestedValue).sort(([left], [right]) =>
          left < right ? -1 : left > right ? 1 : 0,
        ),
      );
    });
  } catch {
    throw new Error("value must be JSON serializable");
  }
  if (serialized === undefined) {
    throw new Error("value must be JSON serializable");
  }
  return serialized;
}

function pruneUndefinedObjectValues(
  value: object,
  ancestors: WeakSet<object>,
): Record<string, unknown> {
  if (ancestors.has(value)) {
    throw new Error("value must be JSON serializable");
  }
  ancestors.add(value);

  const entries = Object.entries(value).flatMap(([key, nestedValue]) => {
    if (nestedValue === undefined) return [];
    if (
      nestedValue !== null &&
      typeof nestedValue === "object" &&
      !Array.isArray(nestedValue)
    ) {
      const originalKeys = Object.keys(nestedValue);
      const pruned = pruneUndefinedObjectValues(nestedValue, ancestors);
      if (originalKeys.length > 0 && Object.keys(pruned).length === 0)
        return [];
      return [[key, pruned] as const];
    }
    return [[key, nestedValue] as const];
  });

  ancestors.delete(value);
  return Object.fromEntries(entries);
}

export function canonicalContextJSONStringify(
  context: ReflagContext | undefined,
): string | undefined {
  if (!context) return undefined;
  const pruned = Object.fromEntries(
    Object.entries(pruneUndefinedObjectValues(context, new WeakSet())).filter(
      ([, section]) =>
        !section ||
        typeof section !== "object" ||
        Array.isArray(section) ||
        Object.keys(section).length > 0,
    ),
  );
  return Object.keys(pruned).length
    ? canonicalJSONStringify(pruned)
    : undefined;
}

/**
 * Context is a set of key-value pairs.
 * This is used to determine if feature targeting matches and to track events.
 * Id should always be present so that it can be referenced to an existing company.
 */
export interface CompanyContext {
  /**
   * Company id
   */
  id: string | number | undefined;

  /**
   * Company name
   */
  name?: string | undefined;

  /**
   * Other company attributes
   */
  [key: string]: ContextValue;
}

/**
 * Context is a set of key-value pairs.
 * This is used to determine if feature targeting matches and to track events.
 * Id should always be present so that it can be referenced to an existing user.
 */
export interface UserContext {
  /**
   * User id
   */
  id: string | number | undefined;

  /**
   * User name
   */
  name?: string | undefined;

  /**
   * User email
   */
  email?: string | undefined;

  /**
   * Other user attributes
   */
  [key: string]: ContextValue;
}

/**
 * Context is a set of key-value pairs.
 * This is used to determine if feature targeting matches and to track events.
 */
export interface ReflagContext {
  /**
   * Company related context. If you provide `id` Reflag will enrich the evaluation context with
   * company attributes on Reflag servers.
   */
  company?: CompanyContext;

  /**
   * User related context. If you provide `id` Reflag will enrich the evaluation context with
   * user attributes on Reflag servers.
   */
  user?: UserContext;

  /**
   * Context which is not related to a user or a company.
   */
  other?: Record<string, ContextValue>;
}

/**
 * @deprecated Use `ReflagContext` instead, this interface will be removed in the next major version
 * @internal
 */
export interface ReflagDeprecatedContext extends ReflagContext {
  /**
   * Context which is not related to a user or a company.
   * @deprecated Use `other` instead, this property will be removed in the next major version
   */
  otherContext?: Record<string, ContextValue>;
}
