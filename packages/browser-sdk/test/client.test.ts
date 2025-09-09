import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReflagClient } from "../src/client";
import { FlagsClient } from "../src/flag/flags";
import { HttpClient } from "../src/httpClient";

import { flagsResult } from "./mocks/handlers";

describe("ReflagClient", () => {
  let client: ReflagClient;
  const httpClientPost = vi.spyOn(HttpClient.prototype as any, "post");
  const httpClientGet = vi.spyOn(HttpClient.prototype as any, "get");

  const flagClientSetContext = vi.spyOn(FlagsClient.prototype, "setContext");

  beforeEach(() => {
    client = new ReflagClient({
      publishableKey: "test-key",
      user: { id: "user1" },
      company: { id: "company1" },
    });

    vi.clearAllMocks();
  });

  describe("updateUser", () => {
    it("should update the user context", async () => {
      // and send new user data and trigger flag update
      const updatedUser = { name: "New User" };

      await client.updateUser(updatedUser);

      expect(client["context"].user).toEqual({ id: "user1", ...updatedUser });
      expect(httpClientPost).toHaveBeenCalledWith({
        path: "/user",
        body: {
          userId: "user1",
          attributes: { name: updatedUser.name },
        },
      });
      expect(flagClientSetContext).toHaveBeenCalledWith(client["context"]);
    });
  });

  describe("updateCompany", () => {
    it("should update the company context", async () => {
      // send new company data and trigger flag update
      const updatedCompany = { name: "New Company" };

      await client.updateCompany(updatedCompany);

      expect(client["context"].company).toEqual({
        id: "company1",
        ...updatedCompany,
      });
      expect(httpClientPost).toHaveBeenCalledWith({
        path: "/company",
        body: {
          userId: "user1",
          companyId: "company1",
          attributes: { name: updatedCompany.name },
        },
      });
      expect(flagClientSetContext).toHaveBeenCalledWith(client["context"]);
    });
  });

  describe("getFlag", () => {
    it("takes overrides into account", async () => {
      await client.initialize();
      expect(flagsResult["flagA"].isEnabled).toBe(true);
      expect(client.getFlag("flagA").isEnabled).toBe(true);
      client.getFlag("flagA").setIsEnabledOverride(false);
      expect(client.getFlag("flagA").isEnabled).toBe(false);
    });
  });

  describe("hooks integration", () => {
    it("on adds hooks appropriately, off removes them", async () => {
      const trackHook = vi.fn();
      const userHook = vi.fn();
      const companyHook = vi.fn();
      const checkHook = vi.fn();
      const flagsUpdated = vi.fn();

      client.on("track", trackHook);
      client.on("user", userHook);
      client.on("company", companyHook);
      client.on("check", checkHook);
      client.on("flagsUpdated", flagsUpdated);

      await client.track("test-event");
      expect(trackHook).toHaveBeenCalledWith({
        eventName: "test-event",
        attributes: undefined,
        user: client["context"].user,
        company: client["context"].company,
      });

      await client["user"]();
      expect(userHook).toHaveBeenCalledWith(client["context"].user);

      await client["company"]();
      expect(companyHook).toHaveBeenCalledWith(client["context"].company);

      // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- special getter triggering event
      client.getFlag("flagA").isEnabled;
      expect(checkHook).toHaveBeenCalled();

      checkHook.mockReset();

      // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- special getter triggering event
      client.getFlag("flagA").config;
      expect(checkHook).toHaveBeenCalled();

      expect(flagsUpdated).not.toHaveBeenCalled();
      await client.updateOtherContext({ key: "value" });
      expect(flagsUpdated).toHaveBeenCalled();

      // Remove hooks
      client.off("track", trackHook);
      client.off("user", userHook);
      client.off("company", companyHook);
      client.off("check", checkHook);
      client.off("flagsUpdated", flagsUpdated);

      // Reset mocks
      trackHook.mockReset();
      userHook.mockReset();
      companyHook.mockReset();
      checkHook.mockReset();
      flagsUpdated.mockReset();

      // Trigger events again
      await client.track("test-event");
      await client["user"]();
      await client["company"]();
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- special getter triggering event
      client.getFlag("flagA").isEnabled;
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- special getter triggering event
      client.getFlag("flagA").config;
      await client.updateOtherContext({ key: "value" });

      // Ensure hooks are not called
      expect(trackHook).not.toHaveBeenCalled();
      expect(userHook).not.toHaveBeenCalled();
      expect(companyHook).not.toHaveBeenCalled();
      expect(checkHook).not.toHaveBeenCalled();
      expect(flagsUpdated).not.toHaveBeenCalled();
    });
  });

  describe("offline mode", () => {
    it("should not make HTTP calls when offline", async () => {
      client = new ReflagClient({
        publishableKey: "test-key",
        user: { id: "user1" },
        company: { id: "company1" },
        offline: true,
        feedback: { enableAutoFeedback: true },
      });

      await client.initialize();
      await client.track("offline-event");
      await client.feedback({ flagKey: "flagA", score: 5 });
      await client.updateUser({ name: "New User" });
      await client.updateCompany({ name: "New Company" });
      await client.stop();

      expect(httpClientPost).not.toHaveBeenCalled();
      expect(httpClientGet).not.toHaveBeenCalled();
    });
  });
});
