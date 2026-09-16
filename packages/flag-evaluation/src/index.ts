import { sha256 } from "js-sha256";

export type ContextFilterOperator =
  | "IS"
  | "IS_NOT"
  | "ANY_OF"
  | "NOT_ANY_OF"
  | "CONTAINS"
  | "NOT_CONTAINS"
  | "GT"
  | "LT"
  | "AFTER"
  | "BEFORE"
  | "DATE_AFTER"
  | "DATE_BEFORE"
  | "SET"
  | "NOT_SET"
  | "IS_TRUE"
  | "IS_FALSE";

export interface ContextFilter {
  type: "context";
  field: string;
  operator: ContextFilterOperator;
  values?: string[];
}

/** Retained for boolean cohort compatibility, including the original hash keys. */
export type PercentageRolloutFilter = {
  type: "rolloutPercentage";
  key: string;
  partialRolloutAttribute: string;
  partialRolloutThreshold: number;
};

export type ConstantFilter = { type: "constant"; value: boolean };
export type FilterClass = { type: string };
export type FilterGroup<T extends FilterClass> = {
  type: "group";
  operator: "and" | "or";
  filters: FilterTree<T>[];
};
export type FilterNegation<T extends FilterClass> = {
  type: "negation";
  filter: FilterTree<T>;
};
export type FilterTree<T extends FilterClass> =
  | FilterGroup<T>
  | FilterNegation<T>
  | T;
export type RuleFilter = FilterTree<
  ContextFilter | PercentageRolloutFilter | ConstantFilter
>;

export type NormalizedContextValue = string | string[];
export type FlattenedContext = Record<string, NormalizedContextValue>;

export type EvaluationError =
  | { code: "MISSING_CONTEXT_FIELD"; field: string; message: string }
  | {
      code: "UNSUPPORTED_ARRAY_OPERATOR";
      field: string;
      operator:
        | ContextFilterOperator
        | "rolloutPercentage"
        | "percentageDistribution";
      message: string;
    }
  | {
      code: "INVALID_COMPARISON";
      field: string;
      operator: ContextFilterOperator;
      message: string;
    }
  | { code: "INVALID_FLAG_DEFINITION"; message: string };

export type VariantDestination =
  | { type: "variant"; variantKey: string }
  | { type: "nextRule" };
export type RuleResult =
  | { type: "variant"; variantKey: string }
  | {
      type: "percentageDistribution";
      key: string;
      attribute: string;
      allocations: Array<{
        percentage: number;
        destination: VariantDestination;
      }>;
    };
export type CompiledRule = {
  id: string;
  filter: RuleFilter;
  result: RuleResult;
};
export type CompiledFlag<T = any> = {
  key: string;
  sourceVersionId: string;
  variants: Record<string, T>;
  rules: CompiledRule[];
};

export type RuleEvaluationResult = {
  ruleId: string;
  matched: boolean;
  allocationIndex?: number;
  destination?: VariantDestination;
};

/** A resolved variant can contain any T, including undefined. */
export type EvaluationResult<T = any> = {
  flagKey: string;
  sourceVersionId: string;
  context: FlattenedContext;
  ruleResults: RuleEvaluationResult[];
  errors: EvaluationError[];
} & (
  | {
      resolved: true;
      value: T;
      variantKey: string;
      matchedRuleId: string;
      allocationIndex?: number;
    }
  | {
      resolved: false;
      value: undefined;
      variantKey?: never;
      matchedRuleId?: never;
      allocationIndex?: never;
    }
);

function normalizeArrayElement(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) return "";
  if (typeof value !== "object") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

/** Flatten nested context, preserving arrays as normalized leaf values. */
export function flattenContext(data: object): FlattenedContext {
  const result = Object.create(null) as FlattenedContext;
  function recurse(value: unknown, prop: string): void {
    if (value === undefined) return;
    if (value === null) {
      result[prop] = "";
    } else if (Array.isArray(value)) {
      result[prop] = value.flatMap((entry) => {
        const normalized = normalizeArrayElement(entry);
        return normalized === undefined ? [] : [normalized];
      });
    } else if (typeof value !== "object") {
      result[prop] = String(value);
    } else {
      const entries = Object.entries(value);
      if (!entries.length) {
        result[prop] = "";
        return;
      }
      for (const [key, entry] of entries)
        recurse(entry, prop ? `${prop}.${key}` : key);
    }
  }
  if (Object.keys(data).length) recurse(data, "");
  return result;
}

/** The original SHA-256 cohort hash, with an inclusive range of 0..100000. */
export function hashInt(hashInput: string): number {
  const value =
    new DataView(sha256.create().update(hashInput).arrayBuffer()).getUint32(
      0,
      true,
    ) & 0xfffff;
  return Math.floor((value / 0xfffff) * 100000);
}

// Prepared lookup structures never appear in the public/wire filter types.
type PreparedContextFilter = ContextFilter & { valueSet?: Set<string> };
type PreparedFilter = FilterTree<
  PreparedContextFilter | PercentageRolloutFilter | ConstantFilter
>;
type Distribution = Extract<RuleResult, { type: "percentageDistribution" }>;
type PreparedDistribution = Omit<Distribution, "allocations"> & {
  allocations: Array<{ upperBound: number; destination: VariantDestination }>;
  error?: string;
};
type PreparedRule = {
  id: string;
  filter: PreparedFilter;
  result: Exclude<RuleResult, Distribution> | PreparedDistribution;
};
type PreparedFlag<T> = Omit<CompiledFlag<T>, "rules"> & {
  rules: PreparedRule[];
};

function prepareFilter(filter: RuleFilter): PreparedFilter {
  if (filter.type === "group")
    return { ...filter, filters: filter.filters.map(prepareFilter) };
  if (filter.type === "negation")
    return { ...filter, filter: prepareFilter(filter.filter) };
  if (
    filter.type === "context" &&
    (filter.operator === "ANY_OF" || filter.operator === "NOT_ANY_OF")
  ) {
    // Keep only the Set's candidate references, not the source array as well.
    return { ...filter, values: [], valueSet: new Set(filter.values ?? []) };
  }
  return { ...filter };
}

function prepareRule(rule: CompiledRule): PreparedRule {
  const filter = prepareFilter(rule.filter);
  if (rule.result.type === "variant")
    return { id: rule.id, filter, result: { ...rule.result } };
  let total = 0;
  let valid = rule.result.allocations.length > 0;
  const allocations = rule.result.allocations.map(
    ({ percentage, destination }) => {
      const units = Math.round(percentage * 1000);
      valid &&=
        Number.isFinite(percentage) &&
        percentage >= 0 &&
        percentage <= 100 &&
        Math.abs(percentage * 1000 - units) <= 1e-8;
      total += units;
      return { upperBound: total, destination: { ...destination } };
    },
  );
  return {
    id: rule.id,
    filter,
    result: {
      ...rule.result,
      allocations,
      ...(!valid || total !== 100000
        ? { error: `Invalid percentage allocations in rule ${rule.id}` }
        : {}),
    },
  };
}

function missingField(
  errors: Map<string, EvaluationError>,
  field: string,
): void {
  errors.set(`missing:${field}`, {
    code: "MISSING_CONTEXT_FIELD",
    field,
    message: `Context field "${field}" is required to evaluate targeting rules.`,
  });
}

function unsupportedArray(
  errors: Map<string, EvaluationError>,
  field: string,
  operator:
    | ContextFilterOperator
    | "rolloutPercentage"
    | "percentageDistribution",
): void {
  errors.set(`array:${field}:${operator}`, {
    code: "UNSUPPORTED_ARRAY_OPERATOR",
    field,
    operator,
    message: `Operator ${operator} does not support array-valued context field "${field}".`,
  });
}

function invalidComparison(
  errors: Map<string, EvaluationError>,
  filter: ContextFilter,
): false {
  errors.set(`comparison:${filter.field}:${filter.operator}`, {
    code: "INVALID_COMPARISON",
    field: filter.field,
    operator: filter.operator,
    // Do not log or embed context values; they may contain sensitive data.
    message: `Operator ${filter.operator} requires valid comparison values for context field "${filter.field}".`,
  });
  return false;
}

function invalidDefinition(
  errors: Map<string, EvaluationError>,
  message: string,
): void {
  errors.set("invalid", { code: "INVALID_FLAG_DEFINITION", message });
}

function compare(
  fieldValue: NormalizedContextValue,
  filter: PreparedContextFilter,
  errors: Map<string, EvaluationError>,
): boolean {
  const { operator, valueSet } = filter;
  const value = filter.values?.[0];
  if (operator === "ANY_OF" || operator === "NOT_ANY_OF") {
    // Always prepared at definition load, including within groups/negations.
    const matches = Array.isArray(fieldValue)
      ? fieldValue.some((entry) => valueSet!.has(entry))
      : valueSet!.has(fieldValue);
    return operator === "ANY_OF" ? matches : !matches;
  }
  if (Array.isArray(fieldValue)) {
    switch (operator) {
      case "IS":
        return (
          typeof value === "string" &&
          fieldValue.length === 1 &&
          fieldValue[0] === value
        );
      case "IS_NOT":
        return (
          typeof value === "string" &&
          !(fieldValue.length === 1 && fieldValue[0] === value)
        );
      case "CONTAINS":
        return typeof value === "string" && fieldValue.includes(value);
      case "NOT_CONTAINS":
        return typeof value === "string" && !fieldValue.includes(value);
      case "SET":
        return fieldValue.length > 0;
      case "NOT_SET":
        return fieldValue.length === 0;
      default:
        unsupportedArray(errors, filter.field, operator);
        return false;
    }
  }
  switch (operator) {
    case "CONTAINS":
      return (
        typeof value === "string" &&
        fieldValue.toLowerCase().includes(value.toLowerCase())
      );
    case "NOT_CONTAINS":
      return (
        typeof value === "string" &&
        !fieldValue.toLowerCase().includes(value.toLowerCase())
      );
    case "GT":
    case "LT": {
      const left = Number(fieldValue),
        right = Number(value);
      if (!Number.isFinite(left) || !Number.isFinite(right))
        return invalidComparison(errors, filter);
      return operator === "GT" ? left > right : left < right;
    }
    case "AFTER":
    case "BEFORE": {
      const daysAgo = new Date();
      const days = Number(value);
      daysAgo.setDate(daysAgo.getDate() - days);
      const timestamp = new Date(fieldValue).getTime();
      if (
        !Number.isFinite(days) ||
        Number.isNaN(timestamp) ||
        Number.isNaN(daysAgo.getTime())
      ) {
        return invalidComparison(errors, filter);
      }
      return operator === "AFTER"
        ? timestamp > daysAgo.getTime()
        : timestamp < daysAgo.getTime();
    }
    case "DATE_AFTER":
    case "DATE_BEFORE": {
      const left = new Date(fieldValue).getTime();
      const right = value === undefined ? NaN : new Date(value).getTime();
      if (Number.isNaN(left) || Number.isNaN(right))
        return invalidComparison(errors, filter);
      return operator === "DATE_AFTER" ? left >= right : left <= right;
    }
    case "SET":
      return fieldValue !== "";
    case "NOT_SET":
      return fieldValue === "";
    case "IS":
      return fieldValue === value;
    case "IS_NOT":
      return fieldValue !== value;
    case "IS_TRUE":
      return fieldValue === "true";
    case "IS_FALSE":
      return fieldValue === "false";
    default:
      return invalidComparison(errors, filter);
  }
}

function evaluateFilter(
  filter: PreparedFilter,
  context: FlattenedContext,
  errors: Map<string, EvaluationError>,
): boolean {
  switch (filter.type) {
    case "constant":
      return filter.value;
    case "context":
      if (
        !(filter.field in context) &&
        filter.operator !== "SET" &&
        filter.operator !== "NOT_SET"
      ) {
        missingField(errors, filter.field);
        return false;
      }
      return compare(context[filter.field] ?? "", filter, errors);
    case "rolloutPercentage": {
      if (!(filter.partialRolloutAttribute in context)) {
        missingField(errors, filter.partialRolloutAttribute);
        return false;
      }
      const value = context[filter.partialRolloutAttribute];
      if (Array.isArray(value)) {
        unsupportedArray(
          errors,
          filter.partialRolloutAttribute,
          "rolloutPercentage",
        );
        return false;
      }
      return hashInt(`${filter.key}.${value}`) < filter.partialRolloutThreshold;
    }
    case "group":
      for (const child of filter.filters) {
        const matched = evaluateFilter(child, context, errors);
        if (filter.operator === "and" && !matched) return false;
        if (filter.operator === "or" && matched) return true;
      }
      return filter.operator === "and";
    case "negation":
      return !evaluateFilter(filter.filter, context, errors);
    default:
      invalidDefinition(errors, "Unsupported filter type");
      return false;
  }
}

/** Prepare once on definition refresh, then reuse for all evaluation contexts. */
export function newEvaluator<T>(
  flag: CompiledFlag<T>,
): (context: Record<string, unknown>) => EvaluationResult<T> {
  const prepared: PreparedFlag<T> = {
    ...flag,
    variants: { ...flag.variants },
    rules: flag.rules.map(prepareRule),
  };
  return (context) => evaluatePreparedFlag(prepared, context);
}

function evaluatePreparedFlag<T>(
  flag: PreparedFlag<T>,
  context: Record<string, unknown>,
): EvaluationResult<T> {
  const flatContext = flattenContext(context);
  const errors = new Map<string, EvaluationError>();
  const filterErrors = new Map<string, EvaluationError>();
  const ruleResults: RuleEvaluationResult[] = [];
  for (const rule of flag.rules) {
    filterErrors.clear();
    const matched = evaluateFilter(rule.filter, flatContext, filterErrors);
    for (const [key, error] of filterErrors) errors.set(key, error);
    const ruleResult: RuleEvaluationResult = {
      ruleId: rule.id,
      matched: matched && !filterErrors.size,
    };
    ruleResults.push(ruleResult);
    if (!ruleResult.matched) continue;

    let destination: VariantDestination;
    if (rule.result.type === "percentageDistribution") {
      const distribution = rule.result;
      if (distribution.error) {
        invalidDefinition(errors, distribution.error);
        break;
      }
      if (!(distribution.attribute in flatContext)) {
        missingField(errors, distribution.attribute);
        continue;
      }
      const value = flatContext[distribution.attribute];
      if (Array.isArray(value)) {
        unsupportedArray(
          errors,
          distribution.attribute,
          "percentageDistribution",
        );
        continue;
      }
      // Preserve every bucket except the inclusive endpoint; 0% stays empty.
      const bucket = Math.min(hashInt(`${distribution.key}.${value}`), 99999);
      const { allocations } = distribution;
      let index = 0;
      while (
        index < allocations.length - 1 &&
        bucket >= allocations[index].upperBound
      )
        index++;
      ruleResult.allocationIndex = index;
      destination = allocations[index].destination;
    } else {
      destination = rule.result;
    }
    ruleResult.destination = { ...destination };
    if (destination.type === "nextRule") continue;
    if (
      !Object.prototype.hasOwnProperty.call(
        flag.variants,
        destination.variantKey,
      )
    ) {
      invalidDefinition(
        errors,
        `Unknown variant ${destination.variantKey} in rule ${rule.id}`,
      );
      break;
    }
    return {
      resolved: true,
      flagKey: flag.key,
      sourceVersionId: flag.sourceVersionId,
      context: flatContext,
      ruleResults,
      errors: Array.from(errors.values()),
      value: flag.variants[destination.variantKey],
      variantKey: destination.variantKey,
      matchedRuleId: rule.id,
      allocationIndex: ruleResult.allocationIndex,
    };
  }
  if (!errors.has("invalid"))
    invalidDefinition(
      errors,
      "No rule selected a variant; a catch-all default is required",
    );
  return {
    resolved: false,
    value: undefined,
    flagKey: flag.key,
    sourceVersionId: flag.sourceVersionId,
    context: flatContext,
    ruleResults,
    errors: Array.from(errors.values()),
  };
}
