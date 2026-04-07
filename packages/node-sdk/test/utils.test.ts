import { createHash } from "crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  decorateLogger,
  hashObject,
  isObject,
  mergeSkipUndefined,
  ok,
  once,
  TimeoutError,
  withTimeout,
} from "../src/utils";

describe("isObject", () => {
  it("should return true for an object", () => {
    expect(isObject({})).toBe(true);
  });

  it("should return false for an array", () => {
    expect(isObject([])).toBe(false);
  });

  it("should return false for a string", () => {
    expect(isObject("")).toBe(false);
  });

  it("should return false for a number", () => {
    expect(isObject(0)).toBe(false);
  });

  it("should return false for a boolean", () => {
    expect(isObject(true)).toBe(false);
  });

  it("should return false for null", () => {
    expect(isObject(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(isObject(undefined)).toBe(false);
  });
});

describe("ok", () => {
  it("should throw an error if the condition is false", () => {
    expect(() => ok(false, "error")).toThrowError("error");
  });

  it("should not throw an error if the condition is true", () => {
    expect(() => ok(true, "error")).not.toThrow();
  });
});

describe("decorateLogger", () => {
  it("should decorate the logger", () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const decorated = decorateLogger("prefix", logger);

    decorated.debug("message");
    decorated.info("message");
    decorated.warn("message");
    decorated.error("message");

    expect(logger.debug).toHaveBeenCalledWith("prefix message");
    expect(logger.info).toHaveBeenCalledWith("prefix message");
    expect(logger.warn).toHaveBeenCalledWith("prefix message");
    expect(logger.error).toHaveBeenCalledWith("prefix message");
  });

  it("should throw an error if the prefix is not a string", () => {
    expect(() => decorateLogger(0 as any, {} as any)).toThrowError(
      "prefix must be a string",
    );
  });

  it("should throw an error if the logger is not an object", () => {
    expect(() => decorateLogger("", 0 as any)).toThrowError(
      "logger must be an object",
    );
  });
});

describe("mergeSkipUndefined", () => {
  it("merges two objects with no undefined values", () => {
    const target = { a: 1, b: 2 };
    const source = { b: 3, c: 4 };
    const result = mergeSkipUndefined(target, source);
    expect(result).toEqual({ a: 1, b: 3, c: 4 });
  });

  it("merges two objects where the source has undefined values", () => {
    const target = { a: 1, b: 2 };
    const source = { b: undefined, c: 4 };
    const result = mergeSkipUndefined(target, source);
    expect(result).toEqual({ a: 1, b: 2, c: 4 });
  });

  it("merges two objects where the target has undefined values", () => {
    const target = { a: 1, b: undefined };
    const source = { b: 3, c: 4 };
    const result = mergeSkipUndefined(target, source);
    expect(result).toEqual({ a: 1, b: 3, c: 4 });
  });

  it("merges two objects where both have undefined values", () => {
    const target = { a: 1, b: undefined };
    const source = { b: undefined, c: 4 };
    const result = mergeSkipUndefined(target, source);
    expect(result).toEqual({ a: 1, c: 4 });
  });

  it("merges two empty objects", () => {
    const target = {};
    const source = {};
    const result = mergeSkipUndefined(target, source);
    expect(result).toEqual({});
  });
});

describe("hashObject", () => {
  it("should throw if the given value is not an object", () => {
    expect(() => hashObject(null as any)).toThrowError(
      "validation failed: obj must be an object",
    );

    expect(() => hashObject("string" as any)).toThrowError(
      "validation failed: obj must be an object",
    );

    expect(() => hashObject([1, 2, 3] as any)).toThrowError(
      "validation failed: obj must be an object",
    );
  });

  it("should return consistent hash for same object content", () => {
    const obj = { name: "Alice", age: 30 };
    const hash1 = hashObject(obj);
    const hash2 = hashObject({ age: 30, name: "Alice" }); // different key order
    expect(hash1).toBe(hash2);
  });

  it("should return different hash for different objects", () => {
    const obj1 = { name: "Alice", age: 30 };
    const obj2 = { name: "Bob", age: 25 };
    const hash1 = hashObject(obj1);
    const hash2 = hashObject(obj2);
    expect(hash1).not.toBe(hash2);
  });

  it("should correctly hash nested objects", () => {
    const obj = { user: { name: "Alice", details: { age: 30, active: true } } };
    const hash = hashObject(obj);

    const expectedHash = createHash("sha1");
    expectedHash.update("user");
    expectedHash.update("details");
    expectedHash.update("active");
    expectedHash.update("true");
    expectedHash.update("age");
    expectedHash.update("30");
    expectedHash.update("name");
    expectedHash.update("Alice");

    expect(hash).toBe(expectedHash.digest("base64"));
  });

  it("should hash arrays within objects", () => {
    const obj = { numbers: [1, 2, 3] };
    const hash = hashObject(obj);

    const expectedHash = createHash("sha1");
    expectedHash.update("numbers");
    expectedHash.update("1");
    expectedHash.update("2");
    expectedHash.update("3");

    expect(hash).toBe(expectedHash.digest("base64"));
  });
});

describe("once()", () => {
  it("should call the function only once with void return value", () => {
    const fn = vi.fn();
    const onceFn = once(fn);

    onceFn();
    onceFn();
    onceFn();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should call the function only once", () => {
    const fn = vi.fn().mockReturnValue(1);
    const onceFn = once(fn);

    expect(onceFn()).toBe(1);
    expect(onceFn()).toBe(1);
    expect(onceFn()).toBe(1);

    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("withTimeout()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should resolve when promise completes before timeout", async () => {
    const promise = Promise.resolve("success");
    const result = withTimeout(promise, 1000);

    await expect(result).resolves.toBe("success");
  });

  it("should reject with TimeoutError when promise takes too long", async () => {
    const slowPromise = new Promise((resolve) => {
      setTimeout(() => resolve("too late"), 2000);
    });

    const result = withTimeout(slowPromise, 1000);

    vi.advanceTimersByTime(1000);

    await expect(result).rejects.toThrow("Operation timed out after 1000ms");
    await expect(result).rejects.toBeInstanceOf(TimeoutError);
  });

  it("should propagate original promise rejection", async () => {
    const error = new Error("original error");
    const failedPromise = Promise.reject(error);

    const result = withTimeout(failedPromise, 1000);

    await expect(result).rejects.toBe(error);
  });

  it("should reject immediately for negative timeout", async () => {
    const promise = Promise.resolve("success");

    await expect(async () => {
      await withTimeout(promise, -1);
    }).rejects.toThrow("validation failed: timeout must be a positive number");
  });

  it("should reject immediately for zero timeout", async () => {
    const promise = Promise.resolve("success");

    await expect(async () => {
      await withTimeout(promise, 0);
    }).rejects.toThrow("validation failed: timeout must be a positive number");
  });

  it("should clean up timeout when promise resolves", async () => {
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
    const promise = Promise.resolve("success");

    await withTimeout(promise, 1000);
    await vi.runAllTimersAsync();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it("should clean up timeout when promise rejects", async () => {
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
    const promise = Promise.reject(new Error("fail"));

    await expect(withTimeout(promise, 1000)).rejects.toThrow("fail");

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it("should not resolve after timeout occurs", async () => {
    const slowPromise = new Promise((resolve) => {
      setTimeout(() => resolve("too late"), 2000);
    });

    const result = withTimeout(slowPromise, 1000);

    vi.advanceTimersByTime(1000); // Trigger timeout
    await expect(result).rejects.toThrow("Operation timed out after 1000ms");

    vi.advanceTimersByTime(1000); // Complete the original promise
    // The promise should still be rejected with the timeout error
    await expect(result).rejects.toThrow("Operation timed out after 1000ms");
  });
});
