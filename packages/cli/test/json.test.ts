import { describe, expect, it } from "vitest";

import {
  JSONToType,
  mergeTypeASTs,
  quoteKey,
  stringifyTypeAST,
  toTypeAST,
  TypeAST,
} from "../utils/json.js";

describe("JSON utilities", () => {
  describe("toTypeAST", () => {
    it("should handle primitive values", () => {
      expect(toTypeAST("test")).toEqual({ kind: "primitive", type: "string" });
      expect(toTypeAST(42)).toEqual({ kind: "primitive", type: "number" });
      expect(toTypeAST(true)).toEqual({ kind: "primitive", type: "boolean" });
      expect(toTypeAST(null)).toEqual({ kind: "primitive", type: "null" });
    });

    it("should handle arrays", () => {
      expect(toTypeAST([1, 2, 3])).toEqual({
        kind: "array",
        elementType: { kind: "primitive", type: "number" },
      });

      expect(toTypeAST([])).toEqual({
        kind: "array",
        elementType: { kind: "primitive", type: "any" },
      });
    });

    it("should handle arrays with mixed element types", () => {
      expect(toTypeAST([1, "test", true])).toEqual({
        kind: "array",
        elementType: {
          kind: "union",
          types: [
            { kind: "primitive", type: "number" },
            { kind: "primitive", type: "string" },
            { kind: "primitive", type: "boolean" },
          ],
        },
      });

      expect(toTypeAST([{ name: "John" }, { age: 30 }])).toEqual({
        kind: "array",
        elementType: {
          kind: "object",
          properties: [
            {
              key: "name",
              type: { kind: "primitive", type: "string" },
              optional: true,
            },
            {
              key: "age",
              type: { kind: "primitive", type: "number" },
              optional: true,
            },
          ],
        },
      });
    });

    it("should handle objects", () => {
      expect(toTypeAST({ name: "John", age: 30 })).toEqual({
        kind: "object",
        properties: [
          {
            key: "name",
            type: { kind: "primitive", type: "string" },
            optional: false,
          },
          {
            key: "age",
            type: { kind: "primitive", type: "number" },
            optional: false,
          },
        ],
      });
    });

    it("should handle nested structures", () => {
      const input = {
        user: {
          name: "John",
          contacts: [{ email: "john@example.com" }],
        },
      };

      const expected: TypeAST = {
        kind: "object",
        properties: [
          {
            key: "user",
            type: {
              kind: "object",
              properties: [
                {
                  key: "name",
                  type: { kind: "primitive", type: "string" },
                  optional: false,
                },
                {
                  key: "contacts",
                  type: {
                    kind: "array",
                    elementType: {
                      kind: "object",
                      properties: [
                        {
                          key: "email",
                          type: { kind: "primitive", type: "string" },
                          optional: false,
                        },
                      ],
                    },
                  },
                  optional: false,
                },
              ],
            },
            optional: false,
          },
        ],
      };

      expect(toTypeAST(input)).toEqual(expected);
    });
  });

  describe("mergeTypeASTs", () => {
    it("should handle empty array", () => {
      expect(mergeTypeASTs([])).toEqual({ kind: "primitive", type: "any" });
    });

    it("should return the same AST for single item arrays", () => {
      const ast: TypeAST = { kind: "primitive", type: "string" };
      expect(mergeTypeASTs([ast])).toEqual(ast);
    });

    it("should merge same primitive types", () => {
      const types: TypeAST[] = [
        { kind: "primitive", type: "number" },
        { kind: "primitive", type: "number" },
      ];
      expect(mergeTypeASTs(types)).toEqual({
        kind: "primitive",
        type: "number",
      });
    });

    it("should create union for different primitive types", () => {
      const types: TypeAST[] = [
        { kind: "primitive", type: "string" },
        { kind: "primitive", type: "number" },
      ];
      expect(mergeTypeASTs(types)).toEqual({
        kind: "union",
        types: [
          { kind: "primitive", type: "string" },
          { kind: "primitive", type: "number" },
        ],
      });
    });

    it("should merge array types", () => {
      const types: TypeAST[] = [
        { kind: "array", elementType: { kind: "primitive", type: "number" } },
        { kind: "array", elementType: { kind: "primitive", type: "string" } },
      ];
      expect(mergeTypeASTs(types)).toEqual({
        kind: "array",
        elementType: {
          kind: "union",
          types: [
            { kind: "primitive", type: "number" },
            { kind: "primitive", type: "string" },
          ],
        },
      });
    });

    it("should merge object types and mark missing properties as optional", () => {
      const types: TypeAST[] = [
        {
          kind: "object",
          properties: [
            {
              key: "name",
              type: { kind: "primitive", type: "string" },
              optional: false,
            },
            {
              key: "age",
              type: { kind: "primitive", type: "number" },
              optional: false,
            },
          ],
        },
        {
          kind: "object",
          properties: [
            {
              key: "name",
              type: { kind: "primitive", type: "string" },
              optional: false,
            },
            {
              key: "email",
              type: { kind: "primitive", type: "string" },
              optional: false,
            },
          ],
        },
      ];

      expect(mergeTypeASTs(types)).toEqual({
        kind: "object",
        properties: [
          {
            key: "name",
            type: { kind: "primitive", type: "string" },
            optional: false,
          },
          {
            key: "age",
            type: { kind: "primitive", type: "number" },
            optional: true,
          },
          {
            key: "email",
            type: { kind: "primitive", type: "string" },
            optional: true,
          },
        ],
      });
    });

    it("should create union for mixed kinds", () => {
      const types: TypeAST[] = [
        { kind: "primitive", type: "string" },
        { kind: "array", elementType: { kind: "primitive", type: "number" } },
      ];

      expect(mergeTypeASTs(types)).toEqual({
        kind: "union",
        types,
      });
    });
  });

  describe("stringifyTypeAST", () => {
    it("should stringify primitive types", () => {
      expect(stringifyTypeAST({ kind: "primitive", type: "string" })).toBe(
        "string",
      );
      expect(stringifyTypeAST({ kind: "primitive", type: "number" })).toBe(
        "number",
      );
      expect(stringifyTypeAST({ kind: "primitive", type: "boolean" })).toBe(
        "boolean",
      );
      expect(stringifyTypeAST({ kind: "primitive", type: "null" })).toBe(
        "null",
      );
    });

    it("should stringify array types", () => {
      expect(
        stringifyTypeAST({
          kind: "array",
          elementType: { kind: "primitive", type: "string" },
        }),
      ).toBe("(string)[]");
    });

    it("should stringify object types", () => {
      const ast: TypeAST = {
        kind: "object",
        properties: [
          {
            key: "name",
            type: { kind: "primitive", type: "string" },
            optional: false,
          },
          {
            key: "age",
            type: { kind: "primitive", type: "number" },
            optional: true,
          },
        ],
      };

      const expected = `{\n  name: string,\n  age?: number\n}`;
      expect(stringifyTypeAST(ast)).toBe(expected);
    });

    it("should stringify empty objects", () => {
      expect(stringifyTypeAST({ kind: "object", properties: [] })).toBe("{}");
    });

    it("should quote object keys with special characters", () => {
      const ast: TypeAST = {
        kind: "object",
        properties: [
          {
            key: "my-key",
            type: { kind: "primitive", type: "string" },
            optional: false,
          },
          {
            key: "my key",
            type: { kind: "primitive", type: "string" },
            optional: false,
          },
          {
            key: "my.key",
            type: { kind: "primitive", type: "string" },
            optional: false,
          },
          {
            key: "123key",
            type: { kind: "primitive", type: "string" },
            optional: false,
          },
        ],
      };

      const expected = `{\n  "my-key": string,\n  "my key": string,\n  "my.key": string,\n  "123key": string\n}`;
      expect(stringifyTypeAST(ast)).toBe(expected);
    });

    it("should stringify union types", () => {
      const ast: TypeAST = {
        kind: "union",
        types: [
          { kind: "primitive", type: "string" },
          { kind: "primitive", type: "number" },
        ],
      };

      expect(stringifyTypeAST(ast)).toBe("string | number");
    });

    it("should handle complex nested types", () => {
      const ast: TypeAST = {
        kind: "object",
        properties: [
          {
            key: "user",
            type: {
              kind: "object",
              properties: [
                {
                  key: "name",
                  type: { kind: "primitive", type: "string" },
                  optional: false,
                },
                {
                  key: "contacts",
                  type: {
                    kind: "array",
                    elementType: {
                      kind: "object",
                      properties: [
                        {
                          key: "email",
                          type: { kind: "primitive", type: "string" },
                          optional: false,
                        },
                      ],
                    },
                  },
                  optional: false,
                },
              ],
            },
            optional: false,
          },
        ],
      };

      const expected =
        `{\n  user: {\n    name: string,\n    contacts: ({\n      email: string\n    })[]` +
        `\n  }\n}`;
      expect(stringifyTypeAST(ast)).toBe(expected);
    });
  });

  describe("JSONToType", () => {
    it("should handle empty arrays", () => {
      expect(JSONToType([])).toBeNull();
    });

    it("should generate type for array of primitives", () => {
      expect(JSONToType([1, 2, 3])).toBe("number");
      expect(JSONToType(["a", "b", "c"])).toBe("string");
      expect(JSONToType([1, "a", true])).toBe("number | string | boolean");
    });

    it("should handle arrays with simple mixed element types", () => {
      const expected = "(number | string | boolean)[]";
      expect(JSONToType([["a", true], [1]])).toBe(expected);
    });

    it("should handle arrays with advanced mixed element types", () => {
      const expected =
        "(number | string | boolean | {\n  id?: number,\n  name?: string\n})[]";
      expect(
        JSONToType([
          [1, "a", true],
          [{ id: 1 }, { name: "test" }],
        ]),
      ).toBe(expected);
    });

    it("should merge arrays with nested arrays of mixed element types", () => {
      const expected = "((boolean | number | string | {\n  id: number\n})[])[]";
      expect(JSONToType([[[1, "test"], [true]], [[{ id: 1 }]]])).toBe(expected);
    });

    it("should generate type for array of objects", () => {
      const expected = `{\n  name: string,\n  age?: number,\n  email?: string\n}`;
      expect(
        JSONToType([
          { name: "John", age: 30 },
          { name: "Jane", email: "jane@example.com" },
        ]),
      ).toBe(expected);
    });

    it("should handle complex nested structures", () => {
      const expected =
        `{\n  user: {\n    name: string,\n    settings: {\n      theme?: string,` +
        `\n      notifications?: boolean\n    }\n  }\n}`;

      expect(
        JSONToType([
          {
            user: {
              name: "John",
              settings: { theme: "dark" },
            },
          },
          {
            user: {
              name: "Jane",
              settings: { notifications: true },
            },
          },
        ]),
      ).toBe(expected);
    });
  });

  describe("quoteKey", () => {
    it("should quote keys with special characters", () => {
      expect(quoteKey("my-key")).toBe('"my-key"');
      expect(quoteKey("my key")).toBe('"my key"');
      expect(quoteKey("my.key")).toBe('"my.key"');
      expect(quoteKey("123key")).toBe('"123key"');
      expect(quoteKey("key")).toBe("key");
    });
  });
});
