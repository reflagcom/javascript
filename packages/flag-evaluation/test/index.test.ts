import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  evaluate,
  evaluateFlagRules,
  EvaluationParams,
  flattenJSON,
  hashInt,
  newEvaluator,
  unflattenJSON,
} from "../src";

const flag = {
  flagKey: "flag",
  rules: [
    {
      value: true,
      filter: {
        type: "group",
        operator: "and",
        filters: [
          {
            type: "context",
            field: "company.id",
            operator: "IS",
            values: ["company1"],
          },
          {
            type: "rolloutPercentage",
            key: "flag",
            partialRolloutAttribute: "company.id",
            partialRolloutThreshold: 100000,
          },
        ],
      },
    },
  ],
} satisfies Omit<EvaluationParams<true>, "context">;

describe("evaluate flag targeting integration ", () => {
  it("evaluates all kinds of filters", async () => {
    const res = evaluateFlagRules({
      flagKey: "flag",
      rules: [
        {
          value: true,
          filter: {
            type: "group",
            operator: "and",
            filters: [
              {
                type: "context",
                field: "company.id",
                operator: "IS",
                values: ["company1"],
              },
              {
                type: "rolloutPercentage",
                key: "flag",
                partialRolloutAttribute: "company.id",
                partialRolloutThreshold: 99999,
              },
              {
                type: "group",
                operator: "or",
                filters: [
                  {
                    type: "context",
                    field: "company.id",
                    operator: "IS",
                    values: ["company2"],
                  },
                  {
                    type: "negation",
                    filter: {
                      type: "context",
                      field: "company.id",
                      operator: "IS",
                      values: ["company3"],
                    },
                  },
                ],
              },
              {
                type: "negation",
                filter: {
                  type: "constant",
                  value: false,
                },
              },
            ],
          },
        },
      ],
      context: {
        "company.id": "company1",
      },
    });

    expect(res).toEqual({
      value: true,
      context: {
        "company.id": "company1",
      },
      flagKey: "flag",
      missingContextFields: [],
      reason: "rule #0 matched",
      ruleEvaluationResults: [true],
    });
  });

  it("evaluates flag when there's no matching rule", async () => {
    const res = evaluateFlagRules({
      ...flag,
      context: {
        company: {
          id: "wrong value",
        },
      },
    });

    expect(res).toEqual({
      value: undefined,
      context: {
        "company.id": "wrong value",
      },
      flagKey: "flag",
      missingContextFields: [],
      reason: "no matched rules",
      ruleEvaluationResults: [false],
    });
  });

  it("evaluates targeting when there's a matching rule", async () => {
    const context = {
      company: {
        id: "company1",
      },
    };

    const res = evaluateFlagRules({
      ...flag,
      context,
    });

    expect(res).toEqual({
      value: true,
      context: {
        "company.id": "company1",
      },
      flagKey: "flag",
      missingContextFields: [],
      reason: "rule #0 matched",
      ruleEvaluationResults: [true],
    });
  });

  it("evaluates flag with missing values", async () => {
    const res = evaluateFlagRules({
      flagKey: "flag",
      rules: [
        {
          value: { custom: "value" },
          filter: {
            type: "group",
            operator: "and",
            filters: [
              {
                type: "context",
                field: "some_field",
                operator: "IS",
                values: [""],
              },
              {
                type: "rolloutPercentage",
                key: "flag",
                partialRolloutAttribute: "some_field",
                partialRolloutThreshold: 99000,
              },
            ],
          },
        },
      ],
      context: {
        some_field: "",
      },
    });

    expect(res).toEqual({
      context: {
        some_field: "",
      },
      value: { custom: "value" },
      flagKey: "flag",
      missingContextFields: [],
      reason: "rule #0 matched",
      ruleEvaluationResults: [true],
    });
  });

  it("returns list of missing context keys ", async () => {
    const res = evaluateFlagRules({
      ...flag,
      context: {},
    });

    expect(res).toEqual({
      context: {},
      value: undefined,
      reason: "no matched rules",
      flagKey: "flag",
      missingContextFields: ["company.id"],
      ruleEvaluationResults: [false],
    });
  });

  it("fails evaluation and includes key in missing keys when rollout attribute is missing from context", async () => {
    const res = evaluateFlagRules({
      flagKey: "flag-1",
      rules: [
        {
          value: 123,
          filter: {
            type: "rolloutPercentage" as const,
            key: "flag-1",
            partialRolloutAttribute: "happening.id",
            partialRolloutThreshold: 50000,
          },
        },
      ],
      context: {},
    });

    expect(res).toEqual({
      flagKey: "flag-1",
      context: {},
      value: undefined,
      reason: "no matched rules",
      missingContextFields: ["happening.id"],
      ruleEvaluationResults: [false],
    });
  });

  it("evaluates optimized rule evaluations correctly", async () => {
    const res = newEvaluator([
      {
        value: true,
        filter: {
          type: "group",
          operator: "and",
          filters: [
            {
              type: "context",
              field: "company.id",
              operator: "IS",
              values: ["company1"],
            },
            {
              type: "rolloutPercentage",
              key: "flag",
              partialRolloutAttribute: "company.id",
              partialRolloutThreshold: 99999,
            },
            {
              type: "group",
              operator: "or",
              filters: [
                {
                  type: "context",
                  field: "company.id",
                  operator: "ANY_OF",
                  values: ["company2"],
                },
                {
                  type: "negation",
                  filter: {
                    type: "context",
                    field: "company.id",
                    operator: "IS",
                    values: ["company3"],
                  },
                },
              ],
            },
            {
              type: "negation",
              filter: {
                type: "constant",
                value: false,
              },
            },
          ],
        },
      },
    ])(
      {
        "company.id": "company1",
      },
      "flag",
    );

    expect(res).toEqual({
      value: true,
      context: {
        "company.id": "company1",
      },
      flagKey: "flag",
      missingContextFields: [],
      reason: "rule #0 matched",
      ruleEvaluationResults: [true],
    });
  });

  describe("SET and NOT_SET operators", () => {
    it("should handle `SET` operator with missing field value", () => {
      const res = evaluateFlagRules({
        flagKey: "test_flag",
        rules: [
          {
            value: true,
            filter: {
              type: "context",
              field: "user.name",
              operator: "SET",
              values: [],
            },
          },
        ],
        context: {},
      });

      expect(res).toEqual({
        flagKey: "test_flag",
        value: undefined,
        context: {},
        ruleEvaluationResults: [false],
        reason: "no matched rules",
        missingContextFields: [],
      });
    });

    it("should handle `NOT_SET` operator with missing field value", () => {
      const res = evaluateFlagRules({
        flagKey: "test_flag",
        rules: [
          {
            value: true,
            filter: {
              type: "context",
              field: "user.name",
              operator: "NOT_SET",
              values: [],
            },
          },
        ],
        context: {},
      });

      expect(res).toEqual({
        flagKey: "test_flag",
        value: true,
        context: {},
        ruleEvaluationResults: [true],
        reason: "rule #0 matched",
        missingContextFields: [],
      });
    });

    it("should handle `SET` operator with empty string field value", () => {
      const res = evaluateFlagRules({
        flagKey: "test_flag",
        rules: [
          {
            value: true,
            filter: {
              type: "context",
              field: "user.name",
              operator: "SET",
              values: [],
            },
          },
        ],
        context: {
          user: {
            name: "",
          },
        },
      });

      expect(res).toEqual({
        flagKey: "test_flag",
        value: undefined,
        context: {
          "user.name": "",
        },
        ruleEvaluationResults: [false],
        reason: "no matched rules",
        missingContextFields: [],
      });
    });

    it("should handle `NOT_SET` operator with empty string field value", () => {
      const res = evaluateFlagRules({
        flagKey: "test_flag",
        rules: [
          {
            value: true,
            filter: {
              type: "context",
              field: "user.name",
              operator: "NOT_SET",
              values: [],
            },
          },
        ],
        context: {
          user: {
            name: "",
          },
        },
      });

      expect(res).toEqual({
        flagKey: "test_flag",
        value: true,
        context: {
          "user.name": "",
        },
        ruleEvaluationResults: [true],
        reason: "rule #0 matched",
        missingContextFields: [],
      });
    });
  });

  it.each([
    {
      context: { "company.id": "company1" },
      expected: true,
    },
    {
      context: { "company.id": "company2" },
      expected: true,
    },
    {
      context: { "company.id": "company3" },
      expected: false,
    },
  ])(
    "%#: evaluates optimized rule evaluations correctly",
    async ({ context, expected }) => {
      const evaluator = newEvaluator([
        {
          value: true,
          filter: {
            type: "group",
            operator: "and",
            filters: [
              {
                type: "context",
                field: "company.id",
                operator: "ANY_OF",
                values: ["company1", "company2"],
              },
            ],
          },
        },
      ]);

      const res = evaluator(context, "flag-1");
      expect(res.value ?? false).toEqual(expected);
    },
  );

  describe("DATE_AFTER and DATE_BEFORE in flag rules", () => {
    it("should evaluate DATE_AFTER operator in flag rules", () => {
      const res = evaluateFlagRules({
        flagKey: "time_based_flag",
        rules: [
          {
            value: "enabled",
            filter: {
              type: "context",
              field: "user.createdAt",
              operator: "DATE_AFTER",
              values: ["2024-01-01"],
            },
          },
        ],
        context: {
          user: {
            createdAt: "2024-06-15",
          },
        },
      });

      expect(res).toEqual({
        flagKey: "time_based_flag",
        value: "enabled",
        context: {
          "user.createdAt": "2024-06-15",
        },
        ruleEvaluationResults: [true],
        reason: "rule #0 matched",
        missingContextFields: [],
      });
    });

    it("should evaluate DATE_BEFORE operator in flag rules", () => {
      const res = evaluateFlagRules({
        flagKey: "legacy_flag",
        rules: [
          {
            value: "enabled",
            filter: {
              type: "context",
              field: "user.lastLogin",
              operator: "DATE_BEFORE",
              values: ["2024-12-31"],
            },
          },
        ],
        context: {
          user: {
            lastLogin: "2024-01-15",
          },
        },
      });

      expect(res).toEqual({
        flagKey: "legacy_flag",
        value: "enabled",
        context: {
          "user.lastLogin": "2024-01-15",
        },
        ruleEvaluationResults: [true],
        reason: "rule #0 matched",
        missingContextFields: [],
      });
    });

    it("should handle complex rules with DATE_AFTER and DATE_BEFORE in groups", () => {
      const res = evaluateFlagRules({
        flagKey: "time_window_flag",
        rules: [
          {
            value: "active",
            filter: {
              type: "group",
              operator: "and",
              filters: [
                {
                  type: "context",
                  field: "event.startDate",
                  operator: "DATE_AFTER",
                  values: ["2024-01-01"],
                },
                {
                  type: "context",
                  field: "event.endDate",
                  operator: "DATE_BEFORE",
                  values: ["2024-12-31"],
                },
              ],
            },
          },
        ],
        context: {
          event: {
            startDate: "2024-06-01",
            endDate: "2024-11-30",
          },
        },
      });

      expect(res).toEqual({
        flagKey: "time_window_flag",
        value: "active",
        context: {
          "event.startDate": "2024-06-01",
          "event.endDate": "2024-11-30",
        },
        ruleEvaluationResults: [true],
        reason: "rule #0 matched",
        missingContextFields: [],
      });
    });

    it("should fail when DATE_AFTER condition is not met", () => {
      const res = evaluateFlagRules({
        flagKey: "future_flag",
        rules: [
          {
            value: "enabled",
            filter: {
              type: "context",
              field: "user.signupDate",
              operator: "DATE_AFTER",
              values: ["2024-12-01"],
            },
          },
        ],
        context: {
          user: {
            signupDate: "2024-01-15", // Too early
          },
        },
      });

      expect(res).toEqual({
        flagKey: "future_flag",
        value: undefined,
        context: {
          "user.signupDate": "2024-01-15",
        },
        ruleEvaluationResults: [false],
        reason: "no matched rules",
        missingContextFields: [],
      });
    });

    it("should fail when DATE_BEFORE condition is not met", () => {
      const res = evaluateFlagRules({
        flagKey: "past_flag",
        rules: [
          {
            value: "enabled",
            filter: {
              type: "context",
              field: "user.lastActivity",
              operator: "DATE_BEFORE",
              values: ["2024-01-01"],
            },
          },
        ],
        context: {
          user: {
            lastActivity: "2024-06-15", // Too late
          },
        },
      });

      expect(res).toEqual({
        flagKey: "past_flag",
        value: undefined,
        context: {
          "user.lastActivity": "2024-06-15",
        },
        ruleEvaluationResults: [false],
        reason: "no matched rules",
        missingContextFields: [],
      });
    });

    it("should work with optimized evaluator", () => {
      const evaluator = newEvaluator([
        {
          value: "time_sensitive",
          filter: {
            type: "group",
            operator: "and",
            filters: [
              {
                type: "context",
                field: "user.subscriptionDate",
                operator: "DATE_AFTER",
                values: ["2024-01-01"],
              },
              {
                type: "context",
                field: "user.trialEndDate",
                operator: "DATE_BEFORE",
                values: ["2024-12-31"],
              },
            ],
          },
        },
      ]);

      const res = evaluator(
        {
          user: {
            subscriptionDate: "2024-03-15",
            trialEndDate: "2024-09-30",
          },
        },
        "subscription_flag",
      );

      expect(res).toEqual({
        flagKey: "subscription_flag",
        value: "time_sensitive",
        context: {
          "user.subscriptionDate": "2024-03-15",
          "user.trialEndDate": "2024-09-30",
        },
        ruleEvaluationResults: [true],
        reason: "rule #0 matched",
        missingContextFields: [],
      });
    });
  });
});

describe("operator evaluation", () => {
  beforeAll(() => {
    vi.useFakeTimers().setSystemTime(new Date("2024-01-10"));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  const tests = [
    ["value", "IS", "value", true],
    ["value", "IS", "wrong value", false],
    ["value", "IS_NOT", "value", false],
    ["value", "IS_NOT", "wrong value", true],

    ["value", "ANY_OF", "value", true],
    ["value", "ANY_OF", "nope", false],
    ["value", "NOT_ANY_OF", "value", false],
    ["value", "NOT_ANY_OF", "nope", true],

    ["value", "IS_TRUE", "", false],
    ["value", "IS_FALSE", "", false],

    ["value", "SET", "", true],
    ["", "SET", "", false],
    ["value", "NOT_SET", "", false],
    ["", "NOT_SET", "", true],

    // non numeric values should return false
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

    // today is 2024-01-10
    // 2024-01-10 - 5 days = 2024-01-05
    ["2024-01-15", "BEFORE", "5", false], // 2024-01-15 is before 2024-01-05 = false
    ["2024-01-15", "AFTER", "5", true], // 2024-01-15 is after  2024-01-05 = true
    ["2024-01-01", "BEFORE", "5", true], // 2024-01-01 is before 2024-01-05 = true
    ["2024-01-01", "AFTER", "5", false], // 2024-01-01 is after 2024-01-05 = false
  ] as const;

  for (const [value, op, filterValue, expected] of tests) {
    it(`evaluates '${value}' ${op} 2024-01-10 minus ${filterValue} days = ${expected}`, () => {
      const res = evaluate(value, op, [filterValue]);
      expect(res).toEqual(expected);
    });
  }

  describe("DATE_AFTER and DATE_BEFORE operators", () => {
    const dateTests = [
      // DATE_AFTER tests
      ["2024-01-15", "DATE_AFTER", "2024-01-10", true], // After
      ["2024-01-10", "DATE_AFTER", "2024-01-10", true], // Same date (>=)
      ["2024-01-05", "DATE_AFTER", "2024-01-10", false], // Before
      ["2024-12-31", "DATE_AFTER", "2024-01-01", true], // Much later
      ["2023-01-01", "DATE_AFTER", "2024-01-01", false], // Much earlier

      // DATE_BEFORE tests
      ["2024-01-05", "DATE_BEFORE", "2024-01-10", true], // Before
      ["2024-01-10", "DATE_BEFORE", "2024-01-10", true], // Same date (<=)
      ["2024-01-15", "DATE_BEFORE", "2024-01-10", false], // After
      ["2023-01-01", "DATE_BEFORE", "2024-01-01", true], // Much earlier
      ["2024-12-31", "DATE_BEFORE", "2024-01-01", false], // Much later

      // Edge cases with different date formats
      ["2024-01-10T10:30:00Z", "DATE_AFTER", "2024-01-10T10:00:00Z", true], // ISO format with time
      ["2024-01-10T09:30:00Z", "DATE_BEFORE", "2024-01-10T10:00:00Z", true], // ISO format with time
      [
        "2024-01-10T10:30:00.123Z",
        "DATE_AFTER",
        "2024-01-10T10:00:00.000Z",
        true,
      ], // ISO format with time and milliseconds
      [
        "2024-01-10T09:30:00.123Z",
        "DATE_BEFORE",
        "2024-01-10T10:00:00.000Z",
        true,
      ], // ISO format with time and milliseconds
      ["01/15/2024", "DATE_AFTER", "01/10/2024", true], // US format
      ["01/05/2024", "DATE_BEFORE", "01/10/2024", true], // US format
    ] as const;

    for (const [fieldValue, operator, filterValue, expected] of dateTests) {
      it(`evaluates '${fieldValue}' ${operator} '${filterValue}' = ${expected}`, () => {
        const res = evaluate(fieldValue, operator, [filterValue]);
        expect(res).toEqual(expected);
      });
    }

    it("handles invalid date formats gracefully", () => {
      // Invalid dates should result in NaN comparisons and return false
      expect(evaluate("invalid-date", "DATE_AFTER", ["2024-01-10"])).toBe(
        false,
      );
      expect(evaluate("2024-01-10", "DATE_AFTER", ["invalid-date"])).toBe(
        false,
      );
      expect(evaluate("invalid-date", "DATE_BEFORE", ["2024-01-10"])).toBe(
        false,
      );
      expect(evaluate("2024-01-10", "DATE_BEFORE", ["invalid-date"])).toBe(
        false,
      );
    });
  });
});

describe("rollout hash", () => {
  const tests = [
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
  ] as const;

  for (const [input, expected] of tests) {
    it(`evaluates '${input}' = ${expected}`, () => {
      const res = hashInt(input);
      expect(res).toEqual(expected);
    });
  }
});

describe("flattenJSON", () => {
  it("should handle an empty object correctly", () => {
    const input = {};
    const output = flattenJSON(input);

    expect(output).toEqual({});
  });

  it("should flatten a simple object", () => {
    const input = {
      a: {
        b: "value",
      },
    };

    const output = flattenJSON(input);

    expect(output).toEqual({
      "a.b": "value",
    });
  });

  it("should flatten nested objects", () => {
    const input = {
      a: {
        b: {
          c: {
            d: "value",
          },
        },
      },
    };

    const output = flattenJSON(input);

    expect(output).toEqual({
      "a.b.c.d": "value",
    });
  });

  it("should handle mixed data types", () => {
    const input = {
      a: {
        b: "string",
        c: 123,
        d: true,
      },
    };

    const output = flattenJSON(input);

    expect(output).toEqual({
      "a.b": "string",
      "a.c": "123",
      "a.d": "true",
    });
  });

  it("should flatten arrays", () => {
    const input = {
      a: ["value1", "value2", "value3"],
    };

    const output = flattenJSON(input);

    expect(output).toEqual({
      "a.0": "value1",
      "a.1": "value2",
      "a.2": "value3",
    });
  });

  it("should handle empty arrays", () => {
    const input = {
      a: [],
    };

    const output = flattenJSON(input);

    expect(output).toEqual({
      a: "",
    });
  });

  it("should correctly flatten mixed structures involving arrays and objects", () => {
    const input = {
      a: {
        b: ["value1", { nested: "value2" }, "value3"],
      },
    };

    const output = flattenJSON(input);

    expect(output).toEqual({
      "a.b.0": "value1",
      "a.b.1.nested": "value2",
      "a.b.2": "value3",
    });
  });

  it("should flatten deeply nested objects", () => {
    const input = {
      level1: {
        level2: {
          level3: {
            key: "value",
            anotherKey: "anotherValue",
          },
        },
        singleKey: "test",
      },
    };

    const output = flattenJSON(input);

    expect(output).toEqual({
      "level1.level2.level3.key": "value",
      "level1.level2.level3.anotherKey": "anotherValue",
      "level1.singleKey": "test",
    });
  });

  it("should handle objects with empty values", () => {
    const input = {
      a: {
        b: "",
      },
    };

    const output = flattenJSON(input);

    expect(output).toEqual({
      "a.b": "",
    });
  });

  it("should handle null values", () => {
    const input = {
      a: null,
      b: {
        c: null,
      },
    };

    const output = flattenJSON(input);

    expect(output).toEqual({
      a: "",
      "b.c": "",
    });
  });

  it("should skip undefined values", () => {
    const input = {
      a: "value",
      b: undefined,
      c: {
        d: undefined,
        e: "another value",
      },
    };

    const output = flattenJSON(input);

    expect(output).toEqual({
      a: "value",
      "c.e": "another value",
    });
  });

  it("should handle empty nested objects", () => {
    const input = {
      a: {},
      b: {
        c: {},
        d: "value",
      },
    };

    const output = flattenJSON(input);

    expect(output).toEqual({
      a: "",
      "b.c": "",
      "b.d": "value",
    });
  });

  it("should handle top-level primitive values", () => {
    const input = {
      a: "simple",
      b: 42,
      c: true,
      d: false,
    };

    const output = flattenJSON(input);

    expect(output).toEqual({
      a: "simple",
      b: "42",
      c: "true",
      d: "false",
    });
  });

  it("should handle arrays with null and undefined values", () => {
    const input = {
      a: ["value1", null, undefined, "value4"],
    };

    const output = flattenJSON(input);

    expect(output).toEqual({
      "a.0": "value1",
      "a.1": "",
      "a.3": "value4",
    });
  });

  it("should handle deeply nested empty structures", () => {
    const input = {
      a: {
        b: {
          c: {},
          d: [],
        },
      },
    };

    const output = flattenJSON(input);

    expect(output).toEqual({
      "a.b.c": "",
      "a.b.d": "",
    });
  });

  it("should handle keys with special characters", () => {
    const input = {
      "key.with.dots": "value1",
      "key-with-dashes": "value2",
      "key with spaces": "value3",
    };

    const output = flattenJSON(input);

    expect(output).toEqual({
      "key.with.dots": "value1",
      "key-with-dashes": "value2",
      "key with spaces": "value3",
    });
  });

  it("should handle edge case numbers and booleans", () => {
    const input = {
      zero: 0,
      negativeNumber: -42,
      float: 3.14,
      infinity: Infinity,
      negativeInfinity: -Infinity,
      nan: NaN,
      falseValue: false,
    };

    const output = flattenJSON(input);

    expect(output).toEqual({
      zero: "0",
      negativeNumber: "-42",
      float: "3.14",
      infinity: "Infinity",
      negativeInfinity: "-Infinity",
      nan: "NaN",
      falseValue: "false",
    });
  });
});

describe("unflattenJSON", () => {
  it("should handle an empty object correctly", () => {
    const input = {};
    const output = unflattenJSON(input);

    expect(output).toEqual({});
  });

  it("should convert a flat object with one level deep keys to a nested object", () => {
    const input = {
      "a.b.c": "value",
      "x.y": "anotherValue",
    };

    const output = unflattenJSON(input);

    expect(output).toEqual({
      a: {
        b: { c: "value" },
      },
      x: {
        y: "anotherValue",
      },
    });
  });

  it("should not handle arrays properly", () => {
    const input = {
      "arr.0": "first",
      "arr.1": "second",
      "arr.2": "third",
    };

    const output = unflattenJSON(input);

    expect(output).toEqual({
      arr: {
        "0": "first",
        "1": "second",
        "2": "third",
      },
    });
  });

  it("should handle mixed data types in flat JSON", () => {
    const input = {
      "a.b": "string",
      "a.c": 123,
      "a.d": true,
    };

    const output = unflattenJSON(input);

    expect(output).toEqual({
      a: {
        b: "string",
        c: 123,
        d: true,
      },
    });
  });

  it("should correctly handle scenarios with overlapping keys (ignore)", () => {
    const input = {
      "a.b": "value1",
      "a.b.c": "value2",
    };

    const output = unflattenJSON(input);
    expect(output).toEqual({ a: { b: "value1" } });
  });

  it("should unflatten nested objects correctly", () => {
    const input = {
      "level1.level2.level3": "deepValue",
      "level1.level2.key": 10,
      "level1.singleKey": "test",
    };

    const output = unflattenJSON(input);

    expect(output).toEqual({
      level1: {
        level2: {
          level3: "deepValue",
          key: 10,
        },
        singleKey: "test",
      },
    });
  });

  it("should handle a scenario where a key is an empty string", () => {
    const input = {
      "": "rootValue",
    };

    const output = unflattenJSON(input);

    expect(output).toEqual({
      "": "rootValue",
    });
  });
});
