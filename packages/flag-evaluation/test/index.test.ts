import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  ContextFilterOperator,
  flattenContext,
  hashInt,
  newEvaluator,
  RuleFilter,
} from "../src";

function evaluateFilter(filter: RuleFilter, context: Record<string, unknown>) {
  return newEvaluator({
    key: "filter",
    sourceVersionId: "version-1",
    variants: { yes: true, no: false },
    rules: [
      { id: "target", filter, result: { type: "variant", variantKey: "yes" } },
      {
        id: "default",
        filter: { type: "constant", value: true },
        result: { type: "variant", variantKey: "no" },
      },
    ],
  })(context);
}
function evaluate(
  value: string | string[],
  operator: ContextFilterOperator,
  values: string[],
) {
  return evaluateFilter(
    { type: "context", field: "value", operator, values },
    { value },
  ).value;
}

describe("operator evaluation through the v2 API", () => {
  beforeAll(() => {
    vi.useFakeTimers().setSystemTime(new Date("2024-01-10"));
  });
  afterAll(() => {
    vi.useRealTimers();
  });
  it.each([
    ["value", "IS", "value", true],
    ["value", "IS", "wrong", false],
    ["value", "IS_NOT", "value", false],
    ["value", "IS_NOT", "wrong", true],
    ["value", "ANY_OF", "value", true],
    ["value", "ANY_OF", "nope", false],
    ["value", "NOT_ANY_OF", "value", false],
    ["value", "NOT_ANY_OF", "nope", true],
    ["value", "IS_TRUE", "", false],
    ["true", "IS_TRUE", "", true],
    ["value", "IS_FALSE", "", false],
    ["false", "IS_FALSE", "", true],
    ["value", "SET", "", true],
    ["", "SET", "", false],
    ["value", "NOT_SET", "", false],
    ["", "NOT_SET", "", true],
    ["value", "GT", "value", false],
    ["value", "GT", "0", false],
    ["1", "GT", "0", true],
    ["2", "GT", "10", false],
    ["10", "GT", "2", true],
    ["value", "LT", "value", false],
    ["value", "LT", "0", false],
    ["0", "LT", "1", true],
    ["2", "LT", "10", true],
    ["10", "LT", "2", false],
    ["start VALUE end", "CONTAINS", "value", true],
    ["alue", "CONTAINS", "value", false],
    ["start VALUE end", "NOT_CONTAINS", "value", false],
    ["alue", "NOT_CONTAINS", "value", true],
    ["2024-01-15", "BEFORE", "5", false],
    ["2024-01-15", "AFTER", "5", true],
    ["2024-01-01", "BEFORE", "5", true],
    ["2024-01-01", "AFTER", "5", false],
    ["2024-01-15", "DATE_AFTER", "2024-01-10", true],
    ["2024-01-10", "DATE_AFTER", "2024-01-10", true],
    ["2024-01-05", "DATE_AFTER", "2024-01-10", false],
    ["2024-12-31", "DATE_AFTER", "2024-01-01", true],
    ["2023-01-01", "DATE_AFTER", "2024-01-01", false],
    ["2024-01-05", "DATE_BEFORE", "2024-01-10", true],
    ["2024-01-10", "DATE_BEFORE", "2024-01-10", true],
    ["2024-01-15", "DATE_BEFORE", "2024-01-10", false],
    ["2023-01-01", "DATE_BEFORE", "2024-01-01", true],
    ["2024-12-31", "DATE_BEFORE", "2024-01-01", false],
    ["2024-01-10T10:30:00Z", "DATE_AFTER", "2024-01-10T10:00:00Z", true],
    ["2024-01-10T09:30:00Z", "DATE_BEFORE", "2024-01-10T10:00:00Z", true],
    [
      "2024-01-10T10:30:00.123Z",
      "DATE_AFTER",
      "2024-01-10T10:00:00.000Z",
      true,
    ],
    [
      "2024-01-10T09:30:00.123Z",
      "DATE_BEFORE",
      "2024-01-10T10:00:00.000Z",
      true,
    ],
    ["01/15/2024", "DATE_AFTER", "01/10/2024", true],
    ["01/05/2024", "DATE_BEFORE", "01/10/2024", true],
  ] as const)("%s %s %s = %s", (value, operator, comparison, expected) => {
    expect(evaluate(value, operator, [comparison])).toBe(expected);
  });

  it.each([
    [["a"], "IS", ["a"], true],
    [["a"], "IS_NOT", ["a"], false],
    [["a", "b"], "IS", ["a"], false],
    [["a", "b"], "IS_NOT", ["a"], true],
    [["a", "a"], "IS", ["a"], false],
    [["a", "a"], "IS_NOT", ["a"], true],
    [[], "IS", ["a"], false],
    [[], "IS_NOT", ["a"], true],
    [["A"], "IS", ["a"], false],
    [["A"], "IS_NOT", ["a"], true],
    [["admin"], "IS", ["adm"], false],
    [[""], "IS", [""], true],
    [[""], "IS_NOT", [""], false],
    [["a"], "IS", ["b", "a"], false],
    [["a"], "IS_NOT", ["b", "a"], true],
    [["a"], "IS", [], false],
    [["a"], "IS_NOT", [], false],
    [[], "IS", [], false],
    [[], "IS_NOT", [], false],
    [["a", "b"], "CONTAINS", ["a"], true],
    [["a", "b"], "CONTAINS", ["c"], false],
    [["a", "b"], "NOT_CONTAINS", ["c"], true],
    [["a", "b"], "NOT_CONTAINS", ["a"], false],
    [["admin"], "CONTAINS", ["adm"], false],
    [["admin"], "NOT_CONTAINS", ["adm"], true],
    [["Admin"], "CONTAINS", ["admin"], false],
    [["Admin"], "NOT_CONTAINS", ["admin"], true],
    [[], "CONTAINS", ["a"], false],
    [[], "NOT_CONTAINS", ["a"], true],
    [[""], "CONTAINS", [""], true],
    [["a"], "CONTAINS", [""], false],
    [["a", "a"], "CONTAINS", ["a"], true],
    [["a"], "CONTAINS", ["b", "a"], false],
    [["a"], "NOT_CONTAINS", ["b", "a"], true],
    [["a", "b"], "ANY_OF", ["a"], true],
    [["a", "b"], "ANY_OF", ["c"], false],
    [["a", "b"], "ANY_OF", ["b", "c"], true],
    [["a", "b"], "NOT_ANY_OF", ["c"], true],
    [["a", "b"], "NOT_ANY_OF", ["a", "c"], false],
    [[], "SET", [], false],
    [[], "NOT_SET", [], true],
    [[""], "SET", [], true],
    [["A"], "ANY_OF", ["a"], false],
    [["a", "a"], "ANY_OF", ["a"], true],
    ["[1,true]", "ANY_OF", ["1"], false],
    ["[1,true]", "ANY_OF", ["true"], false],
    ["[1,true]", "ANY_OF", ["[1,true]"], true],
  ] as const)(
    "array semantics: %j %s %j",
    (value, operator, values, expected) => {
      expect(evaluate(value as string | string[], operator, [...values])).toBe(
        expected,
      );
    },
  );

  it.each(["CONTAINS", "NOT_CONTAINS"] as const)(
    "%s without values remains false",
    (operator) => {
      for (const value of ["value", ["value"], []])
        expect(evaluate(value, operator, [])).toBe(false);
    },
  );
});

describe("invalid conditions", () => {
  it.each([
    "GT",
    "LT",
    "AFTER",
    "BEFORE",
    "DATE_AFTER",
    "DATE_BEFORE",
  ] as const)(
    "%s reports invalid operands, even under negation/OR, without logging values",
    (operator) => {
      const log = vi.spyOn(console, "error");
      try {
        for (const [fieldValue, values] of [
          ["sensitive-invalid-value", ["1"]],
          ["2024-01-01", ["sensitive-invalid-value"]],
          ["Infinity", ["1"]],
          ["1", []],
        ] as const) {
          const filter: RuleFilter = {
            type: "context",
            field: "value",
            operator,
            values: [...values],
          };
          for (const wrapper of [
            filter,
            { type: "negation", filter } as const,
            {
              type: "group",
              operator: "or",
              filters: [filter, { type: "constant", value: true }],
            } as RuleFilter,
          ]) {
            const result = evaluateFilter(wrapper, { value: fieldValue });
            expect(result.value).toBe(false);
            expect(result.errors).toMatchObject([
              { code: "INVALID_COMPARISON", field: "value", operator },
            ]);
            expect(JSON.stringify(result.errors)).not.toContain(
              "sensitive-invalid-value",
            );
          }
        }
        expect(log).not.toHaveBeenCalled();
      } finally {
        log.mockRestore();
      }
    },
  );

  it.each([
    "GT",
    "LT",
    "AFTER",
    "BEFORE",
    "DATE_AFTER",
    "DATE_BEFORE",
    "IS_TRUE",
    "IS_FALSE",
  ] as const)(
    "%s never matches an array, including under negation",
    (operator) => {
      const filter: RuleFilter = {
        type: "context",
        field: "value",
        operator,
        values: ["a"],
      };
      for (const wrapper of [filter, { type: "negation", filter } as const]) {
        const result = evaluateFilter(wrapper, { value: ["a"] });
        expect(result.value).toBe(false);
        expect(result.errors).toMatchObject([
          { code: "UNSUPPORTED_ARRAY_OPERATOR", field: "value", operator },
        ]);
      }
    },
  );

  it("fails repeated invalid rules even when the error is already recorded", () => {
    const filter: RuleFilter = {
      type: "negation",
      filter: {
        type: "context",
        field: "missing",
        operator: "IS",
        values: ["x"],
      },
    };
    const result = newEvaluator({
      key: "test",
      sourceVersionId: "v1",
      variants: { yes: true, no: false },
      rules: [
        { id: "one", filter, result: { type: "variant", variantKey: "yes" } },
        { id: "two", filter, result: { type: "variant", variantKey: "yes" } },
        {
          id: "default",
          filter: { type: "constant", value: true },
          result: { type: "variant", variantKey: "no" },
        },
      ],
    })({});
    expect(result.value).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.ruleResults.map(({ matched }) => matched)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("does not report errors for short-circuited filter branches", () => {
    const result = evaluateFilter(
      {
        type: "group",
        operator: "or",
        filters: [
          { type: "constant", value: true },
          {
            type: "context",
            field: "missing",
            operator: "GT",
            values: ["bad"],
          },
        ],
      },
      {},
    );
    expect(result.value).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it.each(["SET", "NOT_SET"] as const)(
    "allows %s on missing fields",
    (operator) => {
      const result = evaluateFilter(
        { type: "context", field: "missing", operator },
        {},
      );
      expect(result.errors).toEqual([]);
      expect(result.value).toBe(operator === "NOT_SET");
    },
  );

  it("rejects array-valued legacy rollout context even under negation", () => {
    const result = evaluateFilter(
      {
        type: "negation",
        filter: {
          type: "rolloutPercentage",
          key: "key",
          partialRolloutAttribute: "company.id",
          partialRolloutThreshold: 50000,
        },
      },
      { company: { id: ["a", "b"] } },
    );
    expect(result.value).toBe(false);
    expect(result.errors).toMatchObject([
      { code: "UNSUPPORTED_ARRAY_OPERATOR", operator: "rolloutPercentage" },
    ]);
  });
});

describe("stable rollout hash", () => {
  it.each([
    ["EEuoT8KShb", 38026],
    ["h7BOkvks5W", 81440],
    ["IZeSn3LCfJ", 80149],
    ["jxYGR0k2eG", 70348],
    ["VnaiKHgo1E", 82432],
    ["I3R27J9tGN", 88564],
    ["JoCeRRF5wm", 67104],
    ["D9yQyxGKlc", 90226],
    ["gvfTO4h4Je", 98400],
    ["zF5iPhvJuw", 53236],
    ["jMBqhV9Lzr", 99182],
    ["HQtiM6m2sM", 22123],
    ["O4VD9CdVMq", 72700],
    ["lEI48g7tLX", 46266],
    ["s7sOvfaOQ3", 57198],
    ["WuCAxrsjwT", 12755],
    ["1UIruKyifl", 50838],
    ["f8Y0N3i97C", 42372],
    ["rA57gcwaXG", 44337],
    ["5zNThaRQuB", 33221],
    ["uLIHKFgFU2", 49832],
    ["Dq29RMUKnK", 75136],
    ["pNIWi69N81", 21686],
    ["2lJMZxGGwf", 7747],
    ["vJHqCdZmo5", 11319],
    ["qgDRZ2LFvu", 91245],
    ["iWSiN2Jcad", 13365],
    ["FTCF9ZRnIY", 65642],
    ["WxsLfsrQNw", 41778],
    ["9HgMS79hrG", 88627],
    ["BXrIz1JIiP", 44341],
    ["oMtRltWl6T", 85415],
    ["FKP9myTjTo", 5059],
    ["fqlZoZ4PhD", 91346],
    ["ohtHmrXWOB", 45678],
    ["X7xh1uYeTU", 96239],
    ["zXe7HkAtjC", 25732],
    ["AnAZ1gugGv", 62481],
    ["0mfxv840GT", 27268],
    ["eins7hyIvx", 70954],
    ["es9Wkj86PO", 48575],
    ["g3AZn8zuTe", 44126],
    ["NHzNfl4ABW", 63844],
    ["0JZw2gHPg2", 53707],
    ["GKHMJ46sT9", 17572],
    ["ZHEpl9s0kN", 59526],
    ["wSMTYbrr75", 26396],
    ["0WEJv16LYd", 94865],
    ["dxV85hJ5t3", 96945],
    ["00d1uypkKy", 38988],
  ] as const)("%s → %i", (input, expected) => {
    expect(hashInt(input)).toBe(expected);
  });
});

describe("flattenContext", () => {
  it("preserves arrays and normalizes primitive and composite entries", () => {
    expect(
      flattenContext({
        user: {
          roles: ["admin", "editor"],
          levels: [1, 2],
          states: [true, false],
          nullable: [null],
          mixed: [{ role: "admin" }, [1, true]],
        },
      }),
    ).toEqual({
      "user.roles": ["admin", "editor"],
      "user.levels": ["1", "2"],
      "user.states": ["true", "false"],
      "user.nullable": [""],
      "user.mixed": ['{"role":"admin"}', "[1,true]"],
    });
  });
  it("uses a null prototype for dangerous context keys", () => {
    const flattened = flattenContext(
      JSON.parse('{"__proto__":["safe"],"constructor":"value"}'),
    );
    expect(Object.getPrototypeOf(flattened)).toBeNull();
    expect(flattened["__proto__"]).toEqual(["safe"]);
    expect(flattened.constructor).toBe("value");
  });
  it("preserves nested scalar and empty-value behavior", () => {
    expect(
      flattenContext({
        user: {
          profile: { region: "eu" },
          emptyObject: {},
          emptyArray: [],
          nil: null,
          omitted: undefined,
        },
      }),
    ).toEqual({
      "user.profile.region": "eu",
      "user.emptyObject": "",
      "user.emptyArray": [],
      "user.nil": "",
    });
    expect(flattenContext({})).toEqual({});
  });
});
