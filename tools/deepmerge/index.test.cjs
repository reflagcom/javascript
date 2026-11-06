const assert = require("node:assert/strict");
const { test } = require("node:test");
const merge = require("./index.cjs");

function assertSafePrototype(value) {
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal(value.injected, undefined);
  assert.equal(Object.prototype.injected, undefined);
}

test("recursively merges objects without mutating or retaining input objects", () => {
  const target = { config: { enabled: true }, plugins: [{ name: "first" }] };
  const source = { config: { count: 2 }, plugins: [{ name: "second" }] };
  const result = merge(target, source);
  assert.deepEqual(result, {
    config: { enabled: true, count: 2 },
    plugins: [{ name: "first" }, { name: "second" }],
  });
  assert.notEqual(result.config, target.config);
  assert.notEqual(result.plugins[0], target.plugins[0]);
  assert.notEqual(result.plugins[1], source.plugins[0]);
  assert.deepEqual(target.config, { enabled: true });
  assert.deepEqual(source.config, { count: 2 });
});

test("replaces mismatched array/object inputs with cloned source values", () => {
  const source = [{ enabled: true }];
  const result = merge({}, source);
  assert.deepEqual(result, source);
  assert.notEqual(result[0], source[0]);
  assert.deepEqual(merge([], { enabled: true }), { enabled: true });
});

test("retains the clone:false and custom merge options", () => {
  const item = { enabled: true };
  assert.equal(merge({}, { item }, { clone: false }).item, item);
  const result = merge(
    { modules: ["first"], config: { count: 1 } },
    { modules: ["second"], config: { count: 2 } },
    {
      arrayMerge: (_target, source) => source,
      customMerge: (key) =>
        key === "config"
          ? (left, right) => ({ count: left.count + right.count })
          : undefined,
    },
  );
  assert.deepEqual(result, { modules: ["second"], config: { count: 3 } });
});

test("passes cloning helpers to custom array merges", () => {
  const item = { nested: true };
  const result = merge([], [item], {
    arrayMerge: (_target, source, options) =>
      source.map((value) =>
        options.cloneUnlessOtherwiseSpecified(value, options),
      ),
  });
  assert.deepEqual(result, [item]);
  assert.notEqual(result[0], item);
});

test("preserves dates, regular expressions and React elements", () => {
  const special = {
    date: new Date("2026-01-01T00:00:00Z"),
    pattern: /example/,
    element: { $$typeof: Symbol.for("react.element"), props: {} },
  };
  const result = merge({}, special);
  for (const key of Object.keys(special))
    assert.equal(result[key], special[key]);
});

test("supports custom mergeable-object predicates", () => {
  class Config {
    enabled = true;
  }
  const config = new Config();
  const result = merge(
    {},
    { config },
    {
      isMergeableObject: (value) =>
        value !== null && Object.getPrototypeOf(value) === Object.prototype,
    },
  );
  assert.equal(result.config, config);
});

test("copies enumerable symbols but not hidden or inherited properties", () => {
  const symbol = Symbol("config");
  const hidden = Symbol("hidden");
  const source = Object.assign(Object.create({ inherited: true }), {
    [symbol]: { count: 2 },
  });
  Object.defineProperty(source, hidden, { value: true });
  Object.defineProperty(source, "hidden", { value: true });
  const result = merge({}, source);
  assert.deepEqual(result[symbol], { count: 2 });
  assert.notEqual(result[symbol], source[symbol]);
  assert.equal(result[hidden], undefined);
  assert.equal(result.hidden, undefined);
  assert.equal(result.inherited, undefined);
});

test("does not merge source values into inherited or non-enumerable target properties", () => {
  const target = Object.create({ inherited: { enabled: true } });
  Object.defineProperty(target, "hidden", { value: { enabled: true } });
  assert.deepEqual(
    merge(target, { inherited: { count: 2 }, hidden: { count: 2 } }),
    {},
  );
});

test("supports merge.all and validates its input", () => {
  assert.deepEqual(merge.all([{ config: { a: 1 } }, { config: { b: 2 } }]), {
    config: { a: 1, b: 2 },
  });
  assert.deepEqual(merge.all([]), {});
  assert.throws(() => merge.all({}), /first argument should be an array/);
});

for (const side of ["target", "source", "both"]) {
  test(`keeps an own __proto__ on the ${side} from poisoning the result`, () => {
    const payload = () =>
      JSON.parse('{"__proto__":{"injected":true},"valid":1}');
    // A null-prototype target bypassed the upstream inherited-property guard.
    const target = side === "source" ? Object.create(null) : payload();
    const source = side === "target" ? {} : payload();
    const result = merge(target, source);
    assertSafePrototype(result);
    assert.equal(result.valid, 1);
    assert.equal(Object.hasOwn(result, "__proto__"), true);
    assert.deepEqual(result.__proto__, { injected: true });
    assert.deepEqual(Object.getOwnPropertyDescriptor(result, "__proto__"), {
      value: { injected: true },
      writable: true,
      enumerable: true,
      configurable: true,
    });
  });
}

test("protects nested objects and objects cloned inside arrays", () => {
  const payload = JSON.parse(
    '{"nested":{"__proto__":{"injected":true}},"array":[{"__proto__":{"injected":true}}]}',
  );
  const result = merge(payload, {});
  assertSafePrototype(result);
  assertSafePrototype(result.nested);
  assertSafePrototype(result.array[0]);
});

test("does not invoke inherited setters when copying target properties", () => {
  let calls = 0;
  const prototype = {
    set injected(_value) {
      calls++;
    },
  };
  // This also verifies that source prototype members aren't copied.
  const target = Object.create(prototype);
  Object.defineProperty(target, "injected", { value: 42, enumerable: true });
  const result = merge(target, {});
  assert.equal(result.injected, 42);
  assert.equal(calls, 0);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
});

test("constructor/prototype input cannot mutate Object.prototype", () => {
  const payload = JSON.parse('{"constructor":{"prototype":{"injected":true}}}');
  const result = merge({}, payload);
  assertSafePrototype(result);
  assert.equal(Object.hasOwn(result, "constructor"), false);
});
