import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";

import { ReflagClient } from "@reflag/browser-sdk";

import { createReflagProvider, useFlag, useTrack, useClient } from "../src";

// Mock the ReflagClient
vi.mock("@reflag/browser-sdk", () => ({
  ReflagClient: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    getFlag: vi.fn().mockReturnValue({
      isEnabled: true,
      config: { key: "test-config", payload: { message: "Hello World" } },
    }),
    track: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
    logger: { error: vi.fn() },
  })),
}));

describe("Svelte SDK", () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = new ReflagClient({});
  });

  describe("createReflagProvider", () => {
    it("should create a provider context", async () => {
      const provider = createReflagProvider({
        apiKey: "test-api-key",
        user: { id: "test-user" },
        newReflagClient: () => mockClient,
      });

      const context = get(provider);
      expect(context.provider).toBe(true);
      expect(mockClient.initialize).toHaveBeenCalled();
    });
  });

  describe("useFlag", () => {
    it("should return flag state", () => {
      // Set up provider first
      createReflagProvider({
        apiKey: "test-api-key",
        user: { id: "test-user" },
        newReflagClient: () => mockClient,
      });

      const flag = useFlag("test-flag");

      expect(flag.key).toBe("test-flag");
      expect(flag.isEnabled).toBeDefined();
      expect(flag.isLoading).toBeDefined();
      expect(flag.config).toBeDefined();
      expect(typeof flag.track).toBe("function");
      expect(typeof flag.requestFeedback).toBe("function");
    });
  });

  describe("useTrack", () => {
    it("should return a track function", () => {
      // Set up provider first
      createReflagProvider({
        apiKey: "test-api-key",
        user: { id: "test-user" },
        newReflagClient: () => mockClient,
      });

      const track = useTrack();
      expect(typeof track).toBe("function");

      track("test-event", { key: "value" });
      expect(mockClient.track).toHaveBeenCalledWith("test-event", { key: "value" });
    });
  });

  describe("useClient", () => {
    it("should return the client store", () => {
      // Set up provider first
      createReflagProvider({
        apiKey: "test-api-key",
        user: { id: "test-user" },
        newReflagClient: () => mockClient,
      });

      const clientStore = useClient();
      expect(clientStore).toBeDefined();
      
      const client = get(clientStore);
      expect(client).toBe(mockClient);
    });
  });

  describe("error handling", () => {
    it("should throw error when provider is not set up", () => {
      // Clear any existing provider by creating a new one and not using it
      expect(() => {
        useFlag("test-flag");
      }).toThrow("ReflagProvider is missing");
    });
  });
});