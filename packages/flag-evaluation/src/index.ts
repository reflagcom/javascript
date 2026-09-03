import { sha256 } from "js-sha256";

/**
 * Represents a filter class with a specific type property.
 *
 * This type is intended to define the structure for objects
 * that classify or categorize based on a particular filter type.
 *
 * Properties:
 * - type: Specifies the classification type as a string.
 */
export type FilterClass = {
  type: string;
};

/**
 * Represents a group of filters that can be combined with a logical operator.
 *
 * @template T The type of filter class that defines the criteria within the filter group.
 * @property type The fixed type indicator for this filter structure, always "group".
 * @property operator The logical operator used to combine the filters in the group. It can be either "and" (all conditions must pass) or "or" (at least one condition must pass).
 * @property filters An array of filter trees containing individual filters or nested groups of filters.
 */
export type FilterGroup<T extends FilterClass> = {
  type: "group";
  operator: "and" | "or";
  filters: FilterTree<T>[];
};

/**
 * Represents a filter negation structure for use within filtering systems.
 *
 * A `FilterNegation` is used to encapsulate a negation operation,
 * which negates the conditions defined in the provided `filter`.
 *
 * @template T - A generic type that extends FilterClass, indicating the type of the filter.
 * @property type - Specifies the type of this filter operation as "negation".
 * @property filter - A `FilterTree` structure of type `T` that defines the filter conditions to be negated.
 */
export type FilterNegation<T extends FilterClass> = {
  type: "negation";
  filter: FilterTree<T>;
};

/**
 * Represents a tree structure for filters that can be composed of filter groups,
 * filter negations, or individual filter instances of a specified type.
 *
 * @template T - A type that extends the `FilterClass`.
 */
export type FilterTree<T extends FilterClass> =
  | FilterGroup<T>
  | FilterNegation<T>
  | T;

/**
 * Represents a set of predefined operators that can be used to filter a specific context.
 * These operators can express various conditions, including equality checks, comparison,
 * set membership, and boolean evaluations.
 *
 * Possible values:
 * - "IS": Specifies exact match.
 * - "IS_NOT": Specifies a negation of exact match.
 * - "ANY_OF": Checks if a value is present in a set of specified values.
 * - "NOT_ANY_OF": Checks if a value is not present in a set of specified values.
 * - "CONTAINS": Verifies if a value contains a specific substring or element.
 * - "NOT_CONTAINS": Verifies if a value does not contain a specific substring or element.
 * - "GT": Greater than comparison.
 * - "LT": Less than comparison.
 * - "AFTER": Compares if a value is after a specified point (e.g., time, rank).
 * - "BEFORE": Compares if a value is before a specified point (e.g., time, rank).
 * - "SET": Checks if a value is set or exists.
 * - "NOT_SET": Checks if a value is not set or does not exist.
 * - "IS_TRUE": Checks if a boolean value is true.
 * - "IS_FALSE": Checks if a boolean value is false.
 */
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

/**
 * Represents a filter configuration used to filter data based on specific context.
 *
 * This interface defines the structure of a context filter, containing a field,
 * an operator, and optional values to control the filtering behavior.
 *
 * The `type` property must always have the value "context" to classify filters
 * of this type.
 *
 * The `field` property specifies the name of the context field to filter.
 *
 * The `operator` property defines the filtering operation to perform on the
 * specified field (e.g., equals, contains, etc.).
 *
 * The optional `values` property is an array of strings that lists the values
 * to be used in conjunction with the operator for filtering.
 *
 * This interface is typically utilized in contexts where data needs to be
 * dynamically filtered based on specific criteria derived from contextual
 * attributes.
 */
export interface ContextFilter {
  type: "context";
  field: string;
  operator: ContextFilterOperator;
  values?: string[];
  valueSet?: Set<string>;
}

/**
 * Represents a filter configuration to enable percentage-based rollout of a flag or functionality.
 *
 * This type defines the necessary parameters to control access to a flag
 * by evaluating a specific attribute and applying it against a defined percentage threshold.
 *
 * Properties:
 * - `type` - Indicates the type of the filter. For this filter type, it will always be "rolloutPercentage".
 * - `key` - A unique key or identifier that distinguishes this rollout filter.
 * - `partialRolloutAttribute` - Specifies the attribute used to evaluate eligibility for the rollout.
 * - `partialRolloutThreshold` - A numeric value representing the upper-bound threshold (0-100000) for the percentage-based rollout.
 */
export type PercentageRolloutFilter = {
  type: "rolloutPercentage";
  key: string;
  partialRolloutAttribute: string;
  partialRolloutThreshold: number;
};

/**
 * Represents a constant filter configuration.
 *
 * The ConstantFilter type is used to define a filter configuration with a fixed,
 * immutable value. It always evaluates to the specified boolean `value`.
 *
 * @property {string} type - Indicates the type of filter, which is always "constant".
 * @property {boolean} value - The fixed boolean value for the filter.
 */
export type ConstantFilter = {
  type: "constant";
  value: boolean;
};

/**
 * A composite type for representing a rule-based filter system.
 *
 * This type is constructed using a `FilterTree` structure that consists of
 * nested filters of the following types:
 * - `ContextFilter`: A filter that evaluates based on specified context criteria.
 * - `PercentageRolloutFilter`: A filter that performs a percentage-based rollout.
 * - `ConstantFilter`: A filter that evaluates based on fixed conditions or constants.
 *
 * `RuleFilter` is typically used in scenarios where a hierarchical filtering mechanism
 * is needed to determine outcomes based on multiple layered conditions.
 */
export type RuleFilter = FilterTree<
  ContextFilter | PercentageRolloutFilter | ConstantFilter
>;

/**
 * Represents a value that can be used in a rule configuration.
 *
 * RuleValue can take on different types, allowing flexibility based on the
 * specific rule's requirements. This can include:
 * - A boolean value: to represent true/false conditions.
 * - A string: typically used for textual or keyword-based rules.
 * - A number: for numerical rules or thresholds.
 * - An object: for more complex rule definitions or configurations.
 *
 * This type is useful for accommodating various rule structures in applications
 * that work with dynamic or user-defined regulations.
 */
type RuleValue = boolean | string | number | object;

/**
 * Represents a rule that defines a filtering criterion and an associated value.
 *
 * @template T - Specifies the type of the associated value that extends RuleValue.
 * @property {RuleFilter} filter - The filtering criterion used by the rule.
 * @property {T} value - The value associated with the rule.
 */
export interface Rule<T extends RuleValue> {
  filter: RuleFilter;
  value: T;
}

export type NormalizedContextValue = string | string[];
export type FlattenedContext = Record<string, NormalizedContextValue>;

export type EvaluationError =
  | {
      code: "MISSING_CONTEXT_FIELD";
      field: string;
      message: string;
    }
  | {
      code: "UNSUPPORTED_ARRAY_OPERATOR";
      field: string;
      operator: ContextFilterOperator | "rolloutPercentage";
      message: string;
    };

function normalizeArrayElement(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) return "";
  if (typeof value !== "object") return String(value);

  // Composite array elements are outside the targeting model. Keep their
  // behavior explicit by comparing their JSON encoding.
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function normalizeArray(value: unknown[]): string[] {
  return value.flatMap((entry) => {
    const normalized = normalizeArrayElement(entry);
    return normalized === undefined ? [] : [normalized];
  });
}

/**
 * Flattens context for evaluation while preserving arrays as leaf values.
 * Primitive array elements use the same string coercion as scalar values;
 * composite elements are JSON encoded.
 */
export function flattenContext(data: object): FlattenedContext {
  const result: FlattenedContext = {};

  function recurse(value: unknown, prop: string): void {
    if (value === undefined) return;

    if (value === null) {
      result[prop] = "";
    } else if (Array.isArray(value)) {
      result[prop] = normalizeArray(value);
    } else if (typeof value !== "object") {
      result[prop] = String(value);
    } else {
      const entries = Object.entries(value);
      if (entries.length === 0) {
        result[prop] = "";
        return;
      }

      for (const [key, entry] of entries) {
        recurse(entry, prop ? `${prop}.${key}` : key);
      }
    }
  }

  if (Object.keys(data).length > 0) recurse(data, "");
  return result;
}

/**
 * Flattens a nested JSON object into a single-level object, with keys indicating the nesting levels.
 * Keys in the resulting object are represented in a dot notation to reflect the nesting structure of the original data.
 *
 * @param {object} data - The nested JSON object to be flattened.
 * @return {Record<string, string>} A flattened JSON object with "stringified" keys and values.
 */
export function flattenJSON(data: object): Record<string, string> {
  const result: Record<string, string> = {};

  if (Object.keys(data).length === 0) {
    return result;
  }

  function recurse(value: any, prop: string) {
    if (value === undefined) {
      return;
    }

    if (value === null) {
      result[prop] = "";
    } else if (typeof value !== "object") {
      result[prop] = String(value);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        result[prop] = "";
      }

      for (let i = 0; i < value.length; i++) {
        recurse(value[i], prop ? prop + "." + i : "" + i);
      }
    } else {
      let isEmpty = true;

      for (const p in value) {
        isEmpty = false;
        recurse(value[p], prop ? prop + "." + p : p);
      }

      if (isEmpty) {
        result[prop] = "";
      }
    }
  }

  recurse(data, "");
  return result;
}

/**
 * Converts a flattened JSON object with dot-separated keys into a nested JSON object.
 *
 * @param {Record<string, any>} data - The flattened JSON object where keys are dot-separated representing nested levels.
 * @return {Record<string, any>} The unflattened JSON object with nested structure restored.
 */
export function unflattenJSON(data: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  // Traversing these properties on a plain object can reach Object.prototype.
  const unsafePathSegments = new Set(["__proto__", "constructor", "prototype"]);

  for (const i of Object.keys(data)) {
    const keys = i.split(".");

    if (keys.some((key) => unsafePathSegments.has(key))) {
      continue;
    }

    keys.reduce((acc, key, index) => {
      if (index === keys.length - 1) {
        if (typeof acc === "object") {
          acc[key] = data[i];
        }
      } else if (!acc[key]) {
        acc[key] = {};
      }

      return acc[key];
    }, result);
  }

  return result;
}

/**
 * Generates a hashed integer based on the input string. The method extracts 20 bits from the hash,
 * scales it to a range between 0 and 100000, and returns the resultant integer.
 *
 * @param {string} hashInput - The input string used to generate the hash.
 * @return {number} A number between 0 and 100000 derived from the hash of the input string.
 */
export function hashInt(hashInput: string): number {
  // 1. hash the key and the partial rollout attribute
  // 2. take 20 bits from the hash and divide by 2^20 - 1 to get a number between 0 and 1
  // 3. multiply by 100000 to get a number between 0 and 100000 and compare it to the threshold
  //
  // we only need 20 bits to get to 100000 because 2^20 is 1048576
  const value =
    new DataView(sha256.create().update(hashInput).arrayBuffer()).getUint32(
      0,
      true,
    ) & 0xfffff;

  return Math.floor((value / 0xfffff) * 100000);
}

function parseLegacyArray(value: string): string[] | undefined {
  if (!value.trimStart().startsWith("[")) return undefined;

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? normalizeArray(parsed) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeContextValue(
  value: NormalizedContextValue,
): NormalizedContextValue {
  return typeof value === "string" ? (parseLegacyArray(value) ?? value) : value;
}

const ARRAY_OPERATORS = new Set<ContextFilterOperator>([
  "ANY_OF",
  "NOT_ANY_OF",
  "SET",
  "NOT_SET",
]);

/**
 * Evaluates a scalar or array field value against an operator and comparison values.
 * Legacy JSON-encoded arrays are interpreted the same way as native arrays.
 */
export function evaluate(
  fieldValue: NormalizedContextValue,
  operator: ContextFilterOperator,
  values: string[],
  valueSet?: Set<string>,
): boolean {
  const normalizedFieldValue = normalizeContextValue(fieldValue);
  const value = values[0];

  if (Array.isArray(normalizedFieldValue)) {
    switch (operator) {
      case "ANY_OF": {
        const candidates = valueSet ?? new Set(values);
        return normalizedFieldValue.some((entry) => candidates.has(entry));
      }
      case "NOT_ANY_OF": {
        const candidates = valueSet ?? new Set(values);
        return !normalizedFieldValue.some((entry) => candidates.has(entry));
      }
      case "SET":
        return normalizedFieldValue.length > 0;
      case "NOT_SET":
        return normalizedFieldValue.length === 0;
      default:
        // Exact, textual, numeric, date, and boolean operators are scalar-only.
        // Do not accidentally stringify arrays for comparison.
        return false;
    }
  }

  switch (operator) {
    case "CONTAINS":
      return normalizedFieldValue.toLowerCase().includes(value.toLowerCase());
    case "NOT_CONTAINS":
      return !normalizedFieldValue.toLowerCase().includes(value.toLowerCase());
    case "GT":
      if (isNaN(Number(normalizedFieldValue)) || isNaN(Number(value))) {
        // TODO: return error instead? used logger previously
        console.error(
          `GT operator requires numeric values: ${normalizedFieldValue}, ${value}`,
        );
        return false;
      }
      return Number(normalizedFieldValue) > Number(value);
    case "LT":
      if (isNaN(Number(normalizedFieldValue)) || isNaN(Number(value))) {
        console.error(
          `LT operator requires numeric values: ${normalizedFieldValue}, ${value}`,
        );
        return false;
      }
      return Number(normalizedFieldValue) < Number(value);
    case "AFTER":
    case "BEFORE": {
      // more/less than `value` days ago
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - Number(value));
      const fieldValueDate = new Date(normalizedFieldValue).getTime();

      return operator === "AFTER"
        ? fieldValueDate > daysAgo.getTime()
        : fieldValueDate < daysAgo.getTime();
    }
    case "DATE_AFTER":
    case "DATE_BEFORE": {
      const fieldValueDate = new Date(normalizedFieldValue).getTime();
      const valueDate = new Date(value).getTime();
      if (isNaN(fieldValueDate) || isNaN(valueDate)) {
        console.error(
          `${operator} operator requires valid date values: ${normalizedFieldValue}, ${value}`,
        );
        return false;
      }
      return operator === "DATE_AFTER"
        ? fieldValueDate >= valueDate
        : fieldValueDate <= valueDate;
    }
    case "SET":
      return normalizedFieldValue !== "";
    case "NOT_SET":
      return normalizedFieldValue === "";
    case "IS":
      return normalizedFieldValue === value;
    case "IS_NOT":
      return normalizedFieldValue !== value;
    case "ANY_OF":
      return valueSet
        ? valueSet.has(normalizedFieldValue)
        : values.includes(normalizedFieldValue);
    case "NOT_ANY_OF":
      return valueSet
        ? !valueSet.has(normalizedFieldValue)
        : !values.includes(normalizedFieldValue);
    case "IS_TRUE":
      return normalizedFieldValue == "true";
    case "IS_FALSE":
      return normalizedFieldValue == "false";
    default:
      console.error(`unknown operator: ${operator}`);
      return false;
  }
}

function addUnsupportedArrayOperatorError(
  errors: Map<string, EvaluationError>,
  field: string,
  operator: ContextFilterOperator | "rolloutPercentage",
): void {
  const message =
    operator === "rolloutPercentage"
      ? `Percentage rollout does not support array-valued context field "${field}".`
      : `Operator ${operator} does not support array-valued context field "${field}".`;
  errors.set(`${field}:${operator}`, {
    code: "UNSUPPORTED_ARRAY_OPERATOR",
    field,
    operator,
    message,
  });
}

function addMissingContextFieldError(
  errors: Map<string, EvaluationError>,
  field: string,
): void {
  errors.set(`missing:${field}`, {
    code: "MISSING_CONTEXT_FIELD",
    field,
    message: `Context field "${field}" is required to evaluate targeting rules.`,
  });
}

function evaluateRecursively(
  filter: RuleFilter,
  context: FlattenedContext,
  errors: Map<string, EvaluationError>,
): boolean {
  switch (filter.type) {
    case "constant":
      return filter.value;
    case "context": {
      if (
        !(filter.field in context) &&
        filter.operator !== "SET" &&
        filter.operator !== "NOT_SET"
      ) {
        addMissingContextFieldError(errors, filter.field);
        return false;
      }

      const normalizedFieldValue = normalizeContextValue(
        context[filter.field] ?? "",
      );
      if (
        Array.isArray(normalizedFieldValue) &&
        !ARRAY_OPERATORS.has(filter.operator)
      ) {
        addUnsupportedArrayOperatorError(errors, filter.field, filter.operator);
        return false;
      }

      return evaluate(
        normalizedFieldValue,
        filter.operator,
        filter.values || [],
        filter.valueSet,
      );
    }
    case "rolloutPercentage": {
      if (!(filter.partialRolloutAttribute in context)) {
        addMissingContextFieldError(errors, filter.partialRolloutAttribute);
        return false;
      }

      const normalizedRolloutValue = normalizeContextValue(
        context[filter.partialRolloutAttribute],
      );
      if (Array.isArray(normalizedRolloutValue)) {
        addUnsupportedArrayOperatorError(
          errors,
          filter.partialRolloutAttribute,
          "rolloutPercentage",
        );
        return false;
      }

      const hashVal = hashInt(`${filter.key}.${normalizedRolloutValue}`);
      return hashVal < filter.partialRolloutThreshold;
    }
    case "group": {
      const evaluateChild = (child: RuleFilter) =>
        evaluateRecursively(child, context, errors);
      return filter.operator === "and"
        ? filter.filters.every(evaluateChild)
        : filter.filters.some(evaluateChild);
    }
    case "negation":
      return !evaluateRecursively(filter.filter, context, errors);
    default:
      return false;
  }
}

/**
 * Represents the parameters required for evaluating rules against a specific flag in a given context.
 *
 * @template T - The type of the rule value used in evaluation.
 *
 * @property {string} flagKey - The key that identifies the specific flag to be evaluated.
 * @property {Rule<T>[]} rules - An array of rules used for evaluation.
 * @property {Record<string, unknown>} context - The contextual data used during the evaluation process.
 */
export interface EvaluationParams<T extends RuleValue> {
  flagKey: string;
  rules: Rule<T>[];
  context: Record<string, unknown>;
}

/**
 * Represents the result of an evaluation process for a specific flag and its associated rules.
 *
 * @template T - The type of the rule value being evaluated.
 *
 * @property {string} flagKey - The unique key identifying the flag being evaluated.
 * @property {T | undefined} value - The resolved value of the flag, if the evaluation is successful.
 * @property {Record<string, any>} context - The normalized contextual information used during evaluation.
 * @property {boolean[]} ruleEvaluationResults - Array indicating the success or failure of each rule evaluated.
 * @property {string} [reason] - Optional field providing additional explanation regarding the evaluation result.
 * @property {string[]} [missingContextFields] - Legacy array of context fields that were required but not provided during evaluation.
 * @property {EvaluationError[]} [errors] - Non-fatal diagnostics for rules that could not be evaluated.
 */
export interface EvaluationResult<T extends RuleValue> {
  flagKey: string;
  value: T | undefined;
  context: Record<string, any>;
  ruleEvaluationResults: boolean[];
  reason?: string;
  /** @deprecated Use `errors` and check for `MISSING_CONTEXT_FIELD`. */
  missingContextFields?: string[];
  errors?: EvaluationError[];
}

export function evaluateFlagRules<T extends RuleValue>({
  context,
  flagKey,
  rules,
}: EvaluationParams<T>): EvaluationResult<T> {
  const flatContext = flattenContext(context);
  const evaluationErrors = new Map<string, EvaluationError>();

  const ruleEvaluationResults = rules.map((rule) => {
    const ruleErrors = new Map<string, EvaluationError>();
    const matched = evaluateRecursively(rule.filter, flatContext, ruleErrors);
    for (const [key, error] of ruleErrors) evaluationErrors.set(key, error);

    // An invalid condition must fail the entire rule, even when wrapped in a
    // negation or combined with another condition that would otherwise match.
    return ruleErrors.size === 0 && matched;
  });

  const errors = Array.from(evaluationErrors.values());
  const missingContextFields = errors.flatMap((error) =>
    error.code === "MISSING_CONTEXT_FIELD" ? [error.field] : [],
  );

  const firstMatchedRuleIndex = ruleEvaluationResults.findIndex(Boolean);
  const firstMatchedRule =
    firstMatchedRuleIndex > -1 ? rules[firstMatchedRuleIndex] : undefined;
  return {
    value: firstMatchedRule?.value,
    flagKey,
    context: flatContext,
    ruleEvaluationResults,
    reason:
      firstMatchedRuleIndex > -1
        ? `rule #${firstMatchedRuleIndex} matched`
        : "no matched rules",
    missingContextFields,
    ...(errors.length > 0 ? { errors } : {}),
  };
}

export function newEvaluator<T extends RuleValue>(rules: Rule<T>[]) {
  function translateRule(rule: RuleFilter): RuleFilter {
    if (rule.type === "group") {
      return {
        ...rule,
        filters: rule.filters.map(translateRule),
      };
    }

    if (
      rule.type === "context" &&
      (rule.operator === "ANY_OF" || rule.operator === "NOT_ANY_OF")
    ) {
      return {
        ...rule,
        valueSet: new Set(rule.values ?? []),
      };
    }

    return { ...rule };
  }

  const translatedRules = rules.map((rule) => {
    const { filter } = rule;
    const translatedFilter = translateRule(filter);

    return {
      ...rule,
      filter: translatedFilter,
    };
  });

  return function evaluateOptimized(
    context: Record<string, unknown>,
    flagKey: string,
  ) {
    return evaluateFlagRules({
      context,
      flagKey,
      rules: translatedRules,
    });
  };
}
