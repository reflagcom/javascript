import {
  newEvaluator,
  type RuleFilter,
  type RuleResult,
} from "@reflag/flag-evaluation";

import type { CachedFlagCollection, FlagCollection, FlagValue } from "./types";
import { isObject, ok } from "./utils";

export function isFlagValue(
  value: unknown,
  ancestors = new Set<object>(),
): value is FlagValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
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

const operators = new Set([
  "IS",
  "IS_NOT",
  "ANY_OF",
  "NOT_ANY_OF",
  "CONTAINS",
  "NOT_CONTAINS",
  "GT",
  "LT",
  "AFTER",
  "BEFORE",
  "DATE_AFTER",
  "DATE_BEFORE",
  "SET",
  "NOT_SET",
  "IS_TRUE",
  "IS_FALSE",
]);
function isFilter(value: unknown): value is RuleFilter {
  if (!isObject(value)) return false;
  switch (value.type) {
    case "constant":
      return typeof value.value === "boolean";
    case "context":
      return (
        typeof value.field === "string" &&
        operators.has(value.operator) &&
        (value.values === undefined ||
          (Array.isArray(value.values) &&
            value.values.every((v: unknown) => typeof v === "string")))
      );
    case "rolloutPercentage":
      return (
        typeof value.key === "string" &&
        typeof value.partialRolloutAttribute === "string" &&
        Number.isInteger(value.partialRolloutThreshold) &&
        value.partialRolloutThreshold >= 0 &&
        value.partialRolloutThreshold <= 100000
      );
    case "flag":
      return (
        typeof value.key === "string" && typeof value.variantKey === "string"
      );
    case "segment":
      return typeof value.key === "string";
    case "negation":
      return isFilter(value.filter);
    case "group":
      return (
        (value.operator === "and" || value.operator === "or") &&
        Array.isArray(value.filters) &&
        value.filters.every(isFilter)
      );
    default:
      return false;
  }
}
function isResult(
  value: unknown,
  variants: Record<string, unknown>,
): value is RuleResult {
  if (!isObject(value)) return false;
  if (value.type === "variant")
    return (
      typeof value.variantKey === "string" &&
      Object.prototype.hasOwnProperty.call(variants, value.variantKey)
    );
  if (
    value.type !== "percentageDistribution" ||
    typeof value.key !== "string" ||
    !value.key ||
    typeof value.attribute !== "string" ||
    !value.attribute ||
    !Array.isArray(value.allocations) ||
    !value.allocations.length
  )
    return false;
  return (
    value.allocations.every(
      (a: unknown) =>
        isObject(a) &&
        Number.isInteger(a.percentage) &&
        a.percentage >= 0 &&
        a.percentage <= 100 &&
        isObject(a.destination) &&
        (a.destination.type === "nextRule" ||
          (a.destination.type === "variant" &&
            isResult(a.destination, variants))),
    ) &&
    value.allocations.reduce(
      (sum: number, a: { percentage: number }) => sum + a.percentage,
      0,
    ) === 100
  );
}

/** Validate and prepare the entire graph before replacing any cached snapshot. */
export function prepareFlagCollection(
  value: unknown,
  trackSelections = true,
): CachedFlagCollection {
  ok(
    isObject(value) &&
      Array.isArray(value.flags) &&
      Array.isArray(value.segments),
    "expected a complete flags/segments collection",
  );
  for (const flag of value.flags) {
    ok(
      isObject(flag) &&
        typeof flag.key === "string" &&
        flag.key.length > 0 &&
        typeof flag.sourceVersionId === "string" &&
        flag.sourceVersionId.length > 0 &&
        isObject(flag.variants) &&
        isFlagValue(flag.variants) &&
        Object.keys(flag.variants).length > 0 &&
        Object.keys(flag.variants).every((key) => key.length > 0) &&
        Array.isArray(flag.rules) &&
        flag.rules.length > 0,
      "invalid compiled flag",
    );
    const ids = new Set<string>();
    for (const rule of flag.rules) {
      ok(
        isObject(rule) &&
          typeof rule.id === "string" &&
          rule.id.length > 0 &&
          !ids.has(rule.id) &&
          isFilter(rule.filter) &&
          isResult(rule.result, flag.variants as Record<string, unknown>),
        "invalid compiled rule",
      );
      ids.add(rule.id);
    }
    const last = flag.rules[flag.rules.length - 1];
    ok(
      last.filter.type === "constant" &&
        last.filter.value === true &&
        last.result.type === "variant",
      "compiled flag requires a fixed catch-all",
    );
  }
  for (const segment of value.segments)
    ok(
      isObject(segment) &&
        typeof segment.key === "string" &&
        isFilter(segment.filter),
      "invalid compiled segment",
    );
  const collection = structuredClone({
    flags: value.flags.map(
      ({
        key,
        sourceVersionId,
        variants,
        rules,
      }: FlagCollection["flags"][number]) => ({
        key,
        sourceVersionId,
        variants,
        rules,
      }),
    ),
    segments: value.segments.map(
      ({ key, filter }: FlagCollection["segments"][number]) => ({
        key,
        filter,
      }),
    ),
  }) as FlagCollection;
  return {
    ...collection,
    evaluator: newEvaluator<FlagValue>(collection),
    trackSelections,
  };
}
