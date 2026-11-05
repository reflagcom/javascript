import { describe, expect, it } from "vitest";

import { FlagCreateSchema, FlagsQuerySchema } from "../services/flags.js";
import { booleanish, PaginationQueryBaseSchema } from "../utils/schemas.js";

describe("CLI schemas", () => {
  it.each([
    ["true", true],
    ["1", true],
    ["false", false],
    ["0", false],
    [true, true],
    [false, false],
  ])("parses boolean-like input %s as %s", (input, expected) => {
    expect(booleanish.parse(input)).toBe(expected);
  });

  it("preserves flag query defaults", () => {
    expect(FlagsQuerySchema.parse({ envId: "env_test" })).toEqual({
      envId: "env_test",
      sortBy: "key",
      sortOrder: "asc",
      includeRemoteConfigs: false,
    });
  });

  it("rejects unknown query and flag fields", () => {
    expect(
      FlagsQuerySchema.safeParse({ envId: "env_test", unknown: true }).success,
    ).toBe(false);
    expect(
      FlagCreateSchema.safeParse({ name: "Flag", key: "flag", unknown: true })
        .success,
    ).toBe(false);
  });

  it("coerces pagination input and enforces page-size bounds", () => {
    const schema = PaginationQueryBaseSchema();
    expect(schema.parse({ pageIndex: "2", pageSize: "10" })).toEqual({
      sortOrder: "asc",
      pageIndex: 2,
      pageSize: 10,
    });
    expect(schema.safeParse({ pageSize: 0 }).success).toBe(false);
    expect(schema.safeParse({ pageSize: 101 }).success).toBe(false);
  });
});
