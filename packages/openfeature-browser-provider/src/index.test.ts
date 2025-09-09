import { Client, OpenFeature } from "@openfeature/web-sdk";
import { beforeEach, describe, expect, it, Mock, vi } from "vitest";

import { ReflagClient } from "@reflag/browser-sdk";

import { defaultContextTranslator, ReflagBrowserSDKProvider } from ".";

vi.mock("@reflag/browser-sdk", () => {
  const actualModule = vi.importActual("@reflag/browser-sdk");

  return {
    __esModule: true,
    ...actualModule,
    ReflagClient: vi.fn(),
  };
});

const testFlagKey = "a-key";

const publishableKey = "your-publishable-key";

describe("ReflagBrowserSDKProvider", () => {
  let provider: ReflagBrowserSDKProvider;
  let ofClient: Client;
  const reflagClientMock = {
    getFlags: vi.fn(),
    getFlag: vi.fn(),
    initialize: vi.fn().mockResolvedValue({}),
    track: vi.fn(),
    stop: vi.fn(),
  };

  const mockReflagClient = ReflagClient as Mock;
  mockReflagClient.mockReturnValue(reflagClientMock);

  beforeEach(async () => {
    await OpenFeature.clearProviders();

    provider = new ReflagBrowserSDKProvider({ publishableKey });
    OpenFeature.setProvider(provider);
    ofClient = OpenFeature.getClient();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const contextTranslatorFn = vi.fn();

  describe("lifecycle", () => {
    it("should call initialize function with correct arguments", async () => {
      await provider.initialize();
      expect(ReflagClient).toHaveBeenCalledTimes(1);
      expect(ReflagClient).toHaveBeenCalledWith({
        publishableKey,
      });
      expect(reflagClientMock.initialize).toHaveBeenCalledTimes(1);
    });

    it("should set the status to READY if initialization succeeds", async () => {
      reflagClientMock.initialize.mockReturnValue(Promise.resolve());
      await provider.initialize();
      expect(reflagClientMock.initialize).toHaveBeenCalledTimes(1);
      expect(provider.status).toBe("READY");
    });

    it("should call stop function when provider is closed", async () => {
      await OpenFeature.clearProviders();
      expect(reflagClientMock.stop).toHaveBeenCalledTimes(1);
    });

    it("onContextChange re-initializes client", async () => {
      const p = new ReflagBrowserSDKProvider({ publishableKey });
      expect(p["_client"]).toBeUndefined();
      expect(mockReflagClient).toHaveBeenCalledTimes(0);

      await p.onContextChange({}, {});
      expect(mockReflagClient).toHaveBeenCalledTimes(1);
      expect(p["_client"]).toBeDefined();
    });
  });

  describe("contextTranslator", () => {
    it("uses contextTranslatorFn if provided", async () => {
      const ofContext = {
        userId: "123",
        email: "ron@reflag.co",
        avatar: "https://reflag.com/avatar.png",
        groupId: "456",
        groupName: "reflag",
        groupAvatar: "https://reflag.com/group-avatar.png",
        groupPlan: "pro",
      };

      const reflagContext = {
        user: {
          id: "123",
          name: "John Doe",
          email: "john@acme.com",
          avatar: "https://acme.com/avatar.png",
        },
        company: {
          id: "456",
          name: "Acme, Inc.",
          plan: "pro",
          avatar: "https://acme.com/company-avatar.png",
        },
      };

      contextTranslatorFn.mockReturnValue(reflagContext);
      provider = new ReflagBrowserSDKProvider({
        publishableKey,
        contextTranslator: contextTranslatorFn,
      });

      await provider.initialize(ofContext);

      expect(contextTranslatorFn).toHaveBeenCalledWith(ofContext);
      expect(mockReflagClient).toHaveBeenCalledWith({
        publishableKey,
        ...reflagContext,
      });
    });

    it("defaultContextTranslator provides the correct context", async () => {
      expect(
        defaultContextTranslator({
          userId: 123,
          name: "John Doe",
          email: "ron@reflag.co",
          avatar: "https://reflag.com/avatar.png",
          companyId: "456",
          companyName: "Acme, Inc.",
          companyAvatar: "https://acme.com/company-avatar.png",
          companyPlan: "pro",
        }),
      ).toEqual({
        user: {
          id: "123",
          name: "John Doe",
          email: "ron@reflag.co",
          avatar: "https://reflag.com/avatar.png",
        },
        company: {
          id: "456",
          name: "Acme, Inc.",
          plan: "pro",
          avatar: "https://acme.com/company-avatar.png",
        },
      });
    });

    it("defaultContextTranslator uses targetingKey if provided", async () => {
      expect(
        defaultContextTranslator({
          targetingKey: "123",
        }),
      ).toMatchObject({
        user: {
          id: "123",
        },
        company: {
          id: undefined,
        },
      });
    });
  });

  describe("resolving flags", () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    function mockFlag(
      enabled: boolean,
      configKey?: string | null,
      configPayload?: any,
    ) {
      const config = {
        key: configKey,
        payload: configPayload,
      };

      reflagClientMock.getFlag = vi.fn().mockReturnValue({
        isEnabled: enabled,
        config,
      });

      reflagClientMock.getFlags = vi.fn().mockReturnValue({
        [testFlagKey]: {
          isEnabled: enabled,
          config: {
            key: "key",
            payload: configPayload,
          },
        },
      });
    }

    it("returns error if provider is not initialized", async () => {
      await OpenFeature.clearProviders();

      const val = ofClient.getBooleanDetails(testFlagKey, true);

      expect(val).toMatchObject({
        flagKey: testFlagKey,
        flagMetadata: {},
        reason: "ERROR",
        errorCode: "PROVIDER_NOT_READY",
        value: true,
      });
    });

    it("returns error if flag is not found", async () => {
      mockFlag(true, "key", true);
      const val = ofClient.getBooleanDetails("missing-key", true);

      expect(val).toMatchObject({
        flagKey: "missing-key",
        flagMetadata: {},
        reason: "ERROR",
        errorCode: "FLAG_NOT_FOUND",
        value: true,
      });
    });

    it("calls the client correctly when evaluating", async () => {
      mockFlag(true, "key", true);

      const val = ofClient.getBooleanDetails(testFlagKey, false);

      expect(val).toMatchObject({
        flagKey: testFlagKey,
        flagMetadata: {},
        reason: "TARGETING_MATCH",
        variant: "key",
        value: true,
      });

      expect(reflagClientMock.getFlags).toHaveBeenCalled();
      expect(reflagClientMock.getFlag).toHaveBeenCalledWith(testFlagKey);
    });

    it.each([
      [true, false, true, "TARGETING_MATCH", undefined],
      [undefined, true, true, "ERROR", "FLAG_NOT_FOUND"],
      [undefined, false, false, "ERROR", "FLAG_NOT_FOUND"],
    ])(
      "should return the correct result when evaluating boolean. enabled: %s, value: %s, default: %s, expected: %s, reason: %s, errorCode: %s`",
      (enabled, def, expected, reason, errorCode) => {
        const configKey = enabled !== undefined ? "variant-1" : undefined;
        const flagKey = enabled ? testFlagKey : "missing-key";

        mockFlag(enabled ?? false, configKey);

        expect(ofClient.getBooleanDetails(flagKey, def)).toMatchObject({
          flagKey,
          flagMetadata: {},
          reason,
          value: expected,
          ...(errorCode ? { errorCode } : {}),
          ...(configKey ? { variant: configKey } : {}),
        });
      },
    );

    it("should return error when evaluating number", async () => {
      expect(ofClient.getNumberDetails(testFlagKey, 1)).toMatchObject({
        flagKey: testFlagKey,
        flagMetadata: {},
        reason: "ERROR",
        errorCode: "GENERAL",
        value: 1,
      });
    });

    it.each([
      ["key-1", "default", "key-1", "TARGETING_MATCH"],
      [null, "default", "default", "DEFAULT"],
      [undefined, "default", "default", "DEFAULT"],
    ])(
      "should return the correct result when evaluating string. variant: %s, def: %s, expected: %s, reason: %s, errorCode: %s`",
      (variant, def, expected, reason) => {
        mockFlag(true, variant, {});
        expect(ofClient.getStringDetails(testFlagKey, def)).toMatchObject({
          flagKey: testFlagKey,
          flagMetadata: {},
          reason,
          value: expected,
          ...(variant ? { variant } : {}),
        });
      },
    );

    it.each([
      ["one", {}, { a: 1 }, {}, "TARGETING_MATCH", undefined],
      ["two", "string", "default", "string", "TARGETING_MATCH", undefined],
      ["three", 15, 16, 15, "TARGETING_MATCH", undefined],
      ["four", true, true, true, "TARGETING_MATCH", undefined],
      ["five", 100, "string", "string", "ERROR", "TYPE_MISMATCH"],
      ["six", 1337, true, true, "ERROR", "TYPE_MISMATCH"],
      ["seven", "string", 1337, 1337, "ERROR", "TYPE_MISMATCH"],
      [undefined, null, { a: 2 }, { a: 2 }, "ERROR", "TYPE_MISMATCH"],
      [undefined, undefined, "a", "a", "ERROR", "TYPE_MISMATCH"],
    ])(
      "should return the correct result when evaluating object. variant: %s, value: %s, default: %s, expected: %s, reason: %s, errorCode: %s`",
      (variant, value, def, expected, reason, errorCode) => {
        mockFlag(true, variant, value);

        expect(ofClient.getObjectDetails(testFlagKey, def)).toMatchObject({
          flagKey: testFlagKey,
          flagMetadata: {},
          reason,
          value: expected,
          ...(errorCode ? { errorCode } : {}),
          ...(variant && !errorCode ? { variant } : {}),
        });
      },
    );
  });

  describe("track", () => {
    it("calls the client correctly for track calls", async () => {
      const testEvent = "testEvent";
      await provider.initialize();

      ofClient.track(testEvent, { key: "value" });
      expect(reflagClientMock.track).toHaveBeenCalled();
      expect(reflagClientMock.track).toHaveBeenCalledWith(testEvent, {
        key: "value",
      });
    });
  });
});
