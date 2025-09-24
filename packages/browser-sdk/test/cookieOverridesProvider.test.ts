import Cookies from "js-cookie";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { CookieOverridesProvider } from "../src/overrides/cookieOverridesProvider";
import { DEFAULT_OVERRIDES_KEY } from "../src/overrides/overridesProvider";

// Mock js-cookie
vi.mock("js-cookie", () => ({
  default: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe("CookieOverridesProvider", () => {
  const mockCookies = {
    get: Cookies.get as ReturnType<typeof vi.fn>,
    set: Cookies.set as ReturnType<typeof vi.fn>,
  };
  let provider: CookieOverridesProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new CookieOverridesProvider();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("constructor", () => {
    test("uses default cookie key when none provided", () => {
      const defaultProvider = new CookieOverridesProvider();
      expect(defaultProvider).toBeDefined();
    });

    test("accepts custom cookie key", () => {
      const customProvider = new CookieOverridesProvider("custom_key");
      expect(customProvider).toBeDefined();
    });

    test("accepts custom cookie options", () => {
      const customOptions = { expires: 30, sameSite: "lax" as const };
      const customProvider = new CookieOverridesProvider(
        DEFAULT_OVERRIDES_KEY,
        customOptions,
      );
      expect(customProvider).toBeDefined();
    });
  });

  describe("setOverrides", () => {
    test("stores overrides in cookies successfully", async () => {
      const overrides = { flag1: true, flag2: false };

      await provider.setOverrides(overrides);

      expect(mockCookies.set).toHaveBeenCalledWith(
        DEFAULT_OVERRIDES_KEY,
        JSON.stringify(overrides),
        {
          expires: 7,
          sameSite: "strict",
        },
      );
    });

    test("uses custom cookie key", async () => {
      const customKey = "custom_overrides";
      const customProvider = new CookieOverridesProvider(customKey);
      const overrides = { flag1: true };

      await customProvider.setOverrides(overrides);

      expect(mockCookies.set).toHaveBeenCalledWith(
        customKey,
        JSON.stringify(overrides),
        expect.any(Object),
      );
    });

    test("uses custom cookie options", async () => {
      const customOptions = { expires: 30, sameSite: "lax" as const };
      const customProvider = new CookieOverridesProvider(
        DEFAULT_OVERRIDES_KEY,
        customOptions,
      );
      const overrides = { flag1: true };

      await customProvider.setOverrides(overrides);

      expect(mockCookies.set).toHaveBeenCalledWith(
        DEFAULT_OVERRIDES_KEY,
        JSON.stringify(overrides),
        customOptions,
      );
    });

    test("handles JSON.stringify errors gracefully", async () => {
      const consoleSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);

      // Create an object that can't be stringified
      const circularObj: any = {};
      circularObj.self = circularObj;

      await provider.setOverrides(circularObj);

      expect(consoleSpy).toHaveBeenCalledWith(
        "storing flag overrides in cookies failed, overrides won't persist",
      );

      consoleSpy.mockRestore();
    });

    test("handles cookie setting errors gracefully", async () => {
      const consoleSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      mockCookies.set.mockImplementation(() => {
        throw new Error("Cookie setting failed");
      });

      const overrides = { flag1: true };
      await provider.setOverrides(overrides);

      expect(consoleSpy).toHaveBeenCalledWith(
        "storing flag overrides in cookies failed, overrides won't persist",
      );

      consoleSpy.mockRestore();
    });
  });

  describe("getOverrides", () => {
    test("returns overrides from cookies", async () => {
      const overrides = { flag1: true, flag2: false };
      mockCookies.get.mockReturnValue(JSON.stringify(overrides));

      const result = await provider.getOverrides();

      expect(mockCookies.get).toHaveBeenCalledWith(DEFAULT_OVERRIDES_KEY);
      expect(result).toEqual(overrides);
    });

    test("returns empty object when cookie doesn't exist", async () => {
      mockCookies.get.mockReturnValue(undefined);

      const result = await provider.getOverrides();

      expect(result).toEqual({});
    });

    test("returns empty object when cookie is empty string", async () => {
      mockCookies.get.mockReturnValue("");

      const result = await provider.getOverrides();

      expect(result).toEqual({});
    });

    test("uses custom cookie key", async () => {
      const customKey = "custom_overrides";
      const customProvider = new CookieOverridesProvider(customKey);
      const overrides = { flag1: true };
      mockCookies.get.mockReturnValue(JSON.stringify(overrides));

      await customProvider.getOverrides();

      expect(mockCookies.get).toHaveBeenCalledWith(customKey);
    });

    test("throws on JSON parse errors", async () => {
      mockCookies.get.mockReturnValue("invalid json");

      await expect(provider.getOverrides()).rejects.toThrow();
    });

    test("returns empty object when parsed value is not an object", async () => {
      mockCookies.get.mockReturnValue('"string value"');

      const result = await provider.getOverrides();

      expect(result).toEqual({});
    });

    test("returns empty object when parsed value is null", async () => {
      mockCookies.get.mockReturnValue("null");

      const result = await provider.getOverrides();

      expect(result).toEqual({});
    });

    test("returns empty object when parsed value is an array", async () => {
      mockCookies.get.mockReturnValue("[1, 2, 3]");

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
      mockCookies.get.mockReturnValue(JSON.stringify(complexOverrides));

      const result = await provider.getOverrides();

      expect(result).toEqual(complexOverrides);
    });
  });
});
