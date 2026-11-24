export type JSONValue =
  | number
  | string
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

export type PrimitiveAST = { kind: "primitive"; type: string };
export type ArrayAST = { kind: "array"; elementType: TypeAST };
export type ObjectAST = {
  kind: "object";
  properties: { key: string; type: TypeAST; optional: boolean }[];
};
export type UnionAST = { kind: "union"; types: TypeAST[] };

// Type AST to represent TypeScript types
export type TypeAST = PrimitiveAST | ArrayAST | ObjectAST | UnionAST;

export function toTypeAST(value: JSONValue): TypeAST {
  if (value === null) return { kind: "primitive", type: "null" };
  if (Array.isArray(value)) {
    return { kind: "array", elementType: mergeTypeASTs(value.map(toTypeAST)) };
  }
  if (typeof value === "object") {
    return {
      kind: "object",
      properties: Object.entries(value).map(([key, propertyValue]) => ({
        key,
        type: toTypeAST(propertyValue),
        optional: false,
      })),
    };
  }
  return { kind: "primitive", type: typeof value };
}

export function mergeTypeASTs(input: TypeAST[]): TypeAST {
  const primitives = new Set<string>();
  const elements: TypeAST[] = [];
  const objects: ObjectAST[] = [];

  function collect(ast: TypeAST) {
    switch (ast.kind) {
      case "primitive":
        // Empty arrays do not contribute evidence about their element type.
        if (ast.type !== "never") primitives.add(ast.type);
        break;
      case "array":
        elements.push(ast.elementType);
        break;
      case "object":
        objects.push(ast);
        break;
      case "union":
        ast.types.forEach(collect);
        break;
    }
  }
  input.forEach(collect);

  const members: TypeAST[] = Array.from(primitives, (type) => ({
    kind: "primitive",
    type,
  }));
  if (elements.length) {
    members.push({ kind: "array", elementType: mergeTypeASTs(elements) });
  }
  if (objects.length) members.push(mergeObjects(objects));
  if (members.length > 1) return { kind: "union", types: members };
  return members[0] ?? { kind: "primitive", type: "never" };
}

function mergeObjects(objects: ObjectAST[]): ObjectAST {
  const byKey = new Map<string, ObjectAST["properties"]>();
  for (const object of objects) {
    for (const prop of object.properties) {
      const existing = byKey.get(prop.key);
      if (existing) existing.push(prop);
      else byKey.set(prop.key, [prop]);
    }
  }
  return {
    kind: "object",
    properties: Array.from(byKey, ([key, properties]) => ({
      key,
      type: mergeTypeASTs(properties.map((prop) => prop.type)),
      optional:
        properties.length < objects.length ||
        properties.some((prop) => prop.optional),
    })),
  };
}

// Stringify TypeAST to TypeScript type declaration
export function stringifyTypeAST(
  ast: TypeAST,
  nestLevel = 0,
  unknownType = "unknown",
): string {
  const indent = " ".repeat(nestLevel * 2);
  const nextIndent = " ".repeat((nestLevel + 1) * 2);

  switch (ast.kind) {
    case "primitive":
      return ast.type === "never" || ast.type === "unknown"
        ? unknownType
        : ast.type;

    case "array":
      return `(${stringifyTypeAST(ast.elementType, nestLevel, unknownType)})[]`;

    case "object":
      if (ast.properties.length === 0) return `Record<string, ${unknownType}>`;

      return `{\n${ast.properties
        .map(({ key, optional, type }) => {
          return `${nextIndent}${quoteKey(key)}${optional ? "?" : ""}: ${stringifyTypeAST(
            type,
            nestLevel + 1,
            unknownType,
          )}`;
        })
        .join(",\n")}\n${indent}}`;

    case "union":
      if (ast.types.length === 0) return unknownType;
      if (ast.types.length === 1)
        return stringifyTypeAST(ast.types[0], nestLevel, unknownType);
      return ast.types
        .map((type) => stringifyTypeAST(type, nestLevel, unknownType))
        .join(" | ");
  }
}

export function quoteKey(key: string): string {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

// Convert JSON array to TypeScript type
export function JSONToType(
  json: JSONValue[],
  unknownType = "unknown",
): string | null {
  if (!json.length) return null;

  return stringifyTypeAST(mergeTypeASTs(json.map(toTypeAST)), 0, unknownType);
}
