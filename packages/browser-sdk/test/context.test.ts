import { describe, expect, it } from "vitest";

import { canonicalContextJSONStringify } from "../src/context";

describe("canonicalContextJSONStringify", () => {
  it("sorts recursively, preserves arrays, and prunes undefined-only objects", () => {
    expect(
      canonicalContextJSONStringify({
        user: { id: undefined },
        other: {
          z: 2,
          dropped: { value: undefined },
          explicitEmpty: {},
          values: [{ value: undefined }, "second"],
          a: 1,
        },
      }),
    ).toBe('{"other":{"a":1,"explicitEmpty":{},"values":[{},"second"],"z":2}}');
  });

  it("omits an effectively empty context", () => {
    expect(
      canonicalContextJSONStringify({ user: { id: undefined } }),
    ).toBeUndefined();
  });

  it("normalizes bigint and reports circular values consistently", () => {
    expect(
      canonicalContextJSONStringify({ other: { value: 42n } } as any),
    ).toBe('{"other":{"value":"42"}}');

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() =>
      canonicalContextJSONStringify({ other: circular } as any),
    ).toThrow("value must be JSON serializable");
  });
});
