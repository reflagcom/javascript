import { describe, expect, it } from "vitest";

import { isFlagValue, prepareFlagCollection } from "../src/flag-definitions";
import { definition, graph, snapshot } from "./fixtures";

describe("collection preparation", () => {
  it("owns complete reference definitions before preparing evaluation", () => {
    const original = graph();
    const collection = prepareFlagCollection(original);
    expect(collection.flags).toEqual(original.flags);
    expect(collection.segments).toEqual(original.segments);
    original.segments[0].filter = { type: "constant", value: false };
    expect(
      collection.evaluator.evaluateFlag(
        { company: { plan: "enterprise" } },
        "dependent",
      ).value,
    ).toBe(true);
  });
  it.each([
    undefined,
    null,
    {},
    { flags: [] },
    { flags: {}, segments: [] },
    { flags: [], segments: {} },
    { flags: [{ key: "invalid" }], segments: [] },
    snapshot([definition("duplicate", true), definition("duplicate", false)]),
    snapshot([], [{ key: "cycle", filter: { type: "segment", key: "cycle" } }]),
    snapshot(
      [],
      [
        {
          key: "missing",
          filter: { type: "flag", key: "absent", variantKey: "true" },
        },
      ],
    ),
  ])("rejects malformed/incomplete graphs %# before caching them", (value) =>
    expect(() => prepareFlagCollection(value)).toThrow(),
  );
  it.each([
    { type: "group", operator: "xor", filters: [] },
    { type: "context", field: "x", operator: "IS", values: [1] },
    { type: "context", field: "x", operator: "UNKNOWN" },
    {
      type: "rolloutPercentage",
      key: "x",
      partialRolloutAttribute: "id",
      partialRolloutThreshold: NaN,
    },
    { type: "segment", key: "absent" },
    { type: "flag", key: "dependent", variantKey: "absent" },
  ])("rejects invalid filter %#", (filter) => {
    const value = graph();
    value.flags[0].rules[0].filter = filter as never;
    expect(() => prepareFlagCollection(value)).toThrow();
  });
  it.each([
    { type: "variant", variantKey: "absent" },
    {
      type: "percentageDistribution",
      key: "d",
      attribute: "id",
      allocations: [
        {
          percentage: 99,
          destination: { type: "variant", variantKey: "default" },
        },
      ],
    },
    {
      type: "percentageDistribution",
      key: "d",
      attribute: "id",
      allocations: [
        {
          percentage: -1,
          destination: { type: "variant", variantKey: "default" },
        },
        { percentage: 101, destination: { type: "nextRule" } },
      ],
    },
  ])("rejects invalid rule results %#", (result) => {
    const value = snapshot([definition("a", true)]);
    value.flags[0].rules.unshift({
      ...value.flags[0].rules[0],
      id: "invalid",
      result: result as never,
    });
    expect(() => prepareFlagCollection(value)).toThrow();
  });
  it.each([
    [33.333, 33.333, 33.334],
    [12.345, 87.655],
    [0, 0.001, 99.999],
    [0.29, 99.71],
  ])("accepts thousandth-percent allocations %j", (...percentages) => {
    const value = snapshot([
      definition("a", true),
      definition("unrelated", false),
    ]);
    value.flags[0].rules.unshift({
      id: "split",
      filter: { type: "constant", value: true },
      result: {
        type: "percentageDistribution",
        key: "split",
        attribute: "company.id",
        allocations: percentages.map((percentage) => ({
          percentage,
          destination: { type: "variant", variantKey: "default" },
        })),
      },
    });
    const prepared = prepareFlagCollection(value);
    const result = prepared.evaluator.evaluateAll({ company: { id: "acme" } });
    expect(result.flags.a).toMatchObject({
      resolved: true,
      value: true,
      errors: [],
    });
    expect(result.flags.unrelated).toMatchObject({
      resolved: true,
      value: false,
    });
  });
  it.each([
    [33.3333, 33.3333, 33.3334],
    [50.0001, 49.9999],
    [33.333, 33.333, 33.333],
    [NaN, 100],
    [Infinity, 0],
  ])("rejects invalid fractional allocations %j", (...percentages) => {
    const value = snapshot([definition("a", true)]);
    value.flags[0].rules.unshift({
      id: "split",
      filter: { type: "constant", value: true },
      result: {
        type: "percentageDistribution",
        key: "split",
        attribute: "company.id",
        allocations: percentages.map((percentage) => ({
          percentage,
          destination: { type: "variant", variantKey: "default" },
        })),
      },
    });
    expect(() => prepareFlagCollection(value)).toThrow("invalid compiled rule");
  });
  it("requires a fixed catch-all and unique rule identities", () => {
    const value = graph();
    value.flags[0].rules.pop();
    expect(() => prepareFlagCollection(value)).toThrow();
    const duplicate = graph();
    duplicate.flags[0].rules[0].id = duplicate.flags[0].rules[1].id;
    expect(() => prepareFlagCollection(duplicate)).toThrow();
  });
  it.each([undefined, NaN, Infinity, 1n, () => true, new Date(), new Map()])(
    "rejects non-JSON values %#",
    (value) => expect(isFlagValue(value)).toBe(false),
  );
  it("rejects cycles but accepts shared JSON subobjects", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(isFlagValue(cyclic)).toBe(false);
    const shared = { enabled: false };
    expect(isFlagValue({ a: shared, b: shared })).toBe(true);
  });
});
