export type JSONPrimitive =
  | number
  | string
  | boolean
  | null
  | JSONPrimitive[]
  | { [key: string]: JSONPrimitive };

export type PrimitiveAST = { kind: "primitive"; type: string };
export type ArrayAST = { kind: "array"; elementType: TypeAST };
export type ObjectAST = {
  kind: "object";
  properties: { key: string; type: TypeAST; optional: boolean }[];
};
export type UnionAST = { kind: "union"; types: TypeAST[] };

// Type AST to represent TypeScript types
export type TypeAST = PrimitiveAST | ArrayAST | ObjectAST | UnionAST;

// Convert JSON value to TypeAST
export function toTypeAST(value: JSONPrimitive, path: string[] = []): TypeAST {
  if (value === null) return { kind: "primitive", type: "null" };

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return {
        kind: "array",
        elementType: { kind: "primitive", type: "any" },
      };
    }

    // Process all elements in the array instead of just the first one
    const elementTypes = value.map((item, index) =>
      toTypeAST(item, [...path, index.toString()]),
    );

    return {
      kind: "array",
      elementType: mergeTypeASTs(elementTypes),
    };
  }

  if (typeof value === "object") {
    return {
      kind: "object",
      properties: Object.entries(value).map(([key, val]) => ({
        key,
        type: toTypeAST(val, [...path, key]),
        optional: false,
      })),
    };
  }

  return { kind: "primitive", type: typeof value };
}

// Merge multiple TypeASTs into one
export function mergeTypeASTs(types: TypeAST[]): TypeAST {
  if (types.length === 0) return { kind: "primitive", type: "any" };
  if (types.length === 1) return types[0];

  // Group ASTs by kind
  const byKind = {
    union: types.filter((t) => t.kind === "union"),
    primitive: types.filter((t) => t.kind === "primitive"),
    array: types.filter((t) => t.kind === "array"),
    object: types.filter((t) => t.kind === "object"),
  };

  // Create a union for mixed kinds
  const hasMixedKinds =
    byKind.union.length > 0 || // If we have any unions, treat it as mixed kinds
    (byKind.primitive.length > 0 &&
      (byKind.array.length > 0 || byKind.object.length > 0)) ||
    (byKind.array.length > 0 && byKind.object.length > 0);

  if (hasMixedKinds) {
    // If there are existing unions, flatten them into the current union
    if (byKind.union.length > 0) {
      // Flatten existing unions and collect types by category
      const flattenedTypes: TypeAST[] = [];
      const objectsToMerge: ObjectAST[] = [...byKind.object];
      const arraysToMerge: ArrayAST[] = [...byKind.array];

      // Add primitives directly
      flattenedTypes.push(...byKind.primitive);

      // Process union types
      for (const unionType of byKind.union) {
        for (const type of unionType.types) {
          if (type.kind === "object") {
            objectsToMerge.push(type);
          } else if (type.kind === "array") {
            arraysToMerge.push(type);
          } else {
            flattenedTypes.push(type);
          }
        }
      }

      // Merge objects and arrays if they exist
      if (objectsToMerge.length > 0) {
        flattenedTypes.push(mergeTypeASTs(objectsToMerge));
      }

      if (arraysToMerge.length > 0) {
        flattenedTypes.push(mergeTypeASTs(arraysToMerge));
      }

      return { kind: "union", types: flattenedTypes };
    }

    return { kind: "union", types };
  }

  // Handle primitives
  if (byKind.primitive.length === types.length) {
    const uniqueTypes = [...new Set(byKind.primitive.map((p) => p.type))];
    return uniqueTypes.length === 1
      ? { kind: "primitive", type: uniqueTypes[0] }
      : {
          kind: "union",
          types: uniqueTypes.map((type) => ({ kind: "primitive", type })),
        };
  }

  // Merge arrays
  if (byKind.array.length === types.length) {
    return {
      kind: "array",
      elementType: mergeTypeASTs(byKind.array.map((a) => a.elementType)),
    };
  }

  // Merge objects
  if (byKind.object.length === types.length) {
    // Get all unique property keys
    const allKeys = [
      ...new Set(
        byKind.object.flatMap((obj) => obj.properties.map((p) => p.key)),
      ),
    ];

    // Merge properties with same keys
    const mergedProperties = allKeys.map((key) => {
      const props = byKind.object
        .map((obj) => obj.properties.find((p) => p.key === key))
        .filter((obj) => !!obj);

      return {
        key,
        type: mergeTypeASTs(props.map((p) => p.type)),
        optional: byKind.object.some(
          (obj) => !obj.properties.some((p) => p.key === key),
        ),
      };
    });

    return { kind: "object", properties: mergedProperties };
  }

  // Fallback
  return { kind: "primitive", type: "any" };
}

// Stringify TypeAST to TypeScript type declaration
export function stringifyTypeAST(ast: TypeAST, nestLevel = 0): string {
  const indent = " ".repeat(nestLevel * 2);
  const nextIndent = " ".repeat((nestLevel + 1) * 2);

  switch (ast.kind) {
    case "primitive":
      return ast.type;

    case "array":
      return `(${stringifyTypeAST(ast.elementType, nestLevel)})[]`;

    case "object":
      if (ast.properties.length === 0) return "{}";

      return `{\n${ast.properties
        .map(({ key, optional, type }) => {
          return `${nextIndent}${quoteKey(key)}${optional ? "?" : ""}: ${stringifyTypeAST(
            type,
            nestLevel + 1,
          )}`;
        })
        .join(",\n")}\n${indent}}`;

    case "union":
      if (ast.types.length === 0) return "any";
      if (ast.types.length === 1)
        return stringifyTypeAST(ast.types[0], nestLevel);
      return ast.types
        .map((type) => stringifyTypeAST(type, nestLevel))
        .join(" | ");
  }
}

export function quoteKey(key: string): string {
  return /[^a-zA-Z0-9_]/.test(key) || /^[0-9]/.test(key) ? `"${key}"` : key;
}

// Convert JSON array to TypeScript type
export function JSONToType(json: JSONPrimitive[]): string | null {
  if (!json.length) return null;

  return stringifyTypeAST(mergeTypeASTs(json.map((item) => toTypeAST(item))));
}
