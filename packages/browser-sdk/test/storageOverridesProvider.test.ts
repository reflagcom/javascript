import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { DEFAULT_OVERRIDES_KEY } from "../src/overrides/overridesProvider";
import { StorageOverridesProvider } from "../src/overrides/storageOverridesProvider";

describe("StorageOverridesProvider", () => {
  let provider: StorageOverridesProvider;
  let mockStorage: Storage;

  beforeEach(() => {
    // Create a mock localStorage
    mockStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    };

    // Mock the global localStorage
    Object.defineProperty(global, "localStorage", {
      value: mockStorage,
      writable: true,
    });

    provider = new StorageOverridesProvider();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("constructor", () => {
    test("uses default storage key when none provided", () => {
      const defaultProvider = new StorageOverridesProvider();
      expect(defaultProvider).toBeDefined();
    });

    test("accepts custom storage key", () => {
      const customProvider = new StorageOverridesProvider("custom_key");
      expect(customProvider).toBeDefined();
    });

    test("accepts custom storage", () => {
      const customStorage = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0,
      };
      const customProvider = new StorageOverridesProvider(
        DEFAULT_OVERRIDES_KEY,
        customStorage,
      );
      expect(customProvider).toBeDefined();
    });

    test("handles missing localStorage gracefully", () => {
      // Simulate environment without localStorage
      Object.defineProperty(global, "localStorage", {
        value: undefined,
        writable: true,
      });

      const testProvider = new StorageOverridesProvider();
      expect(testProvider).toBeDefined();
    });
  });

  describe("setOverrides", () => {
    test("stores overrides in localStorage successfully", async () => {
      const overrides = { flag1: true, flag2: false };

      await provider.setOverrides(overrides);

      expect(mockStorage.setItem).toHaveBeenCalledWith(
        DEFAULT_OVERRIDES_KEY,
        JSON.stringify(overrides),
      );
    });

    test("uses custom storage key", async () => {
      const customKey = "custom_overrides";
      const customProvider = new StorageOverridesProvider(customKey);
      const overrides = { flag1: true };

      await customProvider.setOverrides(overrides);

      expect(mockStorage.setItem).toHaveBeenCalledWith(
        customKey,
        JSON.stringify(overrides),
      );
    });

    test("has a bug: uses localStorage instead of custom storage", async () => {
      // This test documents a bug in the implementation
      const customStorage = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0,
      };
      const customProvider = new StorageOverridesProvider(
        DEFAULT_OVERRIDES_KEY,
        customStorage,
      );
      const overrides = { flag1: true };

      await customProvider.setOverrides(overrides);

      // Due to the bug, localStorage.setItem is called instead of customStorage.setItem
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        DEFAULT_OVERRIDES_KEY,
        JSON.stringify(overrides),
      );
      expect(customStorage.setItem).not.toHaveBeenCalled();
    });

    test("does nothing when storage is null", async () => {
      const providerWithNullStorage = new StorageOverridesProvider(
        DEFAULT_OVERRIDES_KEY,
        null,
      );
      const overrides = { flag1: true };

      await providerWithNullStorage.setOverrides(overrides);

      expect(mockStorage.setItem).not.toHaveBeenCalled();
    });

    test("handles localStorage errors gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      mockStorage.setItem = vi.fn().mockImplementation(() => {
        throw new Error("Storage quota exceeded");
      });

      const overrides = { flag1: true };
      await provider.setOverrides(overrides);

      expect(consoleSpy).toHaveBeenCalledWith(
        "storing flag overrides in localStorage failed, overrides won't persist",
      );

      consoleSpy.mockRestore();
    });

    test("handles JSON.stringify errors gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      // Create an object that can't be stringified
      const circularObj: any = {};
      circularObj.self = circularObj;

      await provider.setOverrides(circularObj);

      expect(consoleSpy).toHaveBeenCalledWith(
        "storing flag overrides in localStorage failed, overrides won't persist",
      );

      consoleSpy.mockRestore();
    });
  });

  describe("getOverrides", () => {
    test("returns overrides from localStorage", async () => {
      const overrides = { flag1: true, flag2: false };
      mockStorage.getItem = vi.fn().mockReturnValue(JSON.stringify(overrides));

      const result = await provider.getOverrides();

      expect(mockStorage.getItem).toHaveBeenCalledWith(DEFAULT_OVERRIDES_KEY);
      expect(result).toEqual(overrides);
    });

    test("returns empty object when storage is null", async () => {
      const providerWithNullStorage = new StorageOverridesProvider(
        DEFAULT_OVERRIDES_KEY,
        null,
      );

      const result = await providerWithNullStorage.getOverrides();

      expect(result).toEqual({});
      expect(mockStorage.getItem).not.toHaveBeenCalled();
    });

    test("returns empty object when storage item doesn't exist", async () => {
      mockStorage.getItem = vi.fn().mockReturnValue(null);

      const result = await provider.getOverrides();

      expect(result).toEqual({});
    });

    test("returns empty object when storage item is empty string", async () => {
      mockStorage.getItem = vi.fn().mockReturnValue("");

      const result = await provider.getOverrides();

      expect(result).toEqual({});
    });

    test("uses custom storage key", async () => {
      const customKey = "custom_overrides";
      const customProvider = new StorageOverridesProvider(customKey);
      const overrides = { flag1: true };
      mockStorage.getItem = vi.fn().mockReturnValue(JSON.stringify(overrides));

      await customProvider.getOverrides();

      expect(mockStorage.getItem).toHaveBeenCalledWith(customKey);
    });

    test("has a bug: uses localStorage instead of custom storage for getItem", async () => {
      // This test documents a bug in the implementation
      const customStorage = {
        getItem: vi.fn().mockReturnValue('{"flag1": true}'),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0,
      };
      const customProvider = new StorageOverridesProvider(
        DEFAULT_OVERRIDES_KEY,
        customStorage,
      );

      // Set up localStorage to return some data
      mockStorage.getItem = vi.fn().mockReturnValue('{"flag2": false}');

      const result = await customProvider.getOverrides();

      // Due to the bug, localStorage.getItem is called instead of customStorage.getItem
      expect(mockStorage.getItem).toHaveBeenCalledWith(DEFAULT_OVERRIDES_KEY);
      expect(customStorage.getItem).not.toHaveBeenCalled();
      expect(result).toEqual({ flag2: false });
    });

    test("throws on JSON parse errors", async () => {
      mockStorage.getItem = vi.fn().mockReturnValue("invalid json");

      await expect(provider.getOverrides()).rejects.toThrow();
    });

    test("returns empty object when parsed value is not an object", async () => {
      mockStorage.getItem = vi.fn().mockReturnValue('"string value"');

      const result = await provider.getOverrides();

      expect(result).toEqual({});
    });

    test("returns empty object when parsed value is null", async () => {
      mockStorage.getItem = vi.fn().mockReturnValue("null");

      const result = await provider.getOverrides();

      expect(result).toEqual({});
    });

    test("returns empty object when parsed value is an array", async () => {
      mockStorage.getItem = vi.fn().mockReturnValue("[1, 2, 3]");

      const result = await provider.getOverrides();

      expect(result).toEqual({});
    });

    test("works with complex nested objects", async () => {
      const complexOverrides = {
        flag1: true,
        flag2: {
          nested: "value",
          number: 42,
        },
        flag3: [1, 2, 3],
      };
      mockStorage.getItem = vi
        .fn()
        .mockReturnValue(JSON.stringify(complexOverrides));

      const result = await provider.getOverrides();

      expect(result).toEqual(complexOverrides);
    });
  });
});
