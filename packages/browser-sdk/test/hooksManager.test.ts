import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompanyContext, UserContext } from "../src";
import { CheckEvent, RawFlags } from "../src/flag/flags";
import { HooksManager } from "../src/hooksManager";

const check: CheckEvent = {
  action: "check",
  key: "test-key",
  evalResult: "quality",
  sourceVersionId: "version-1",
  flagStateVersion: 2,
};

describe("HookManager", () => {
  let hooks: HooksManager;
  beforeEach(() => {
    hooks = new HooksManager();
  });

  it("adds and triggers canonical check hooks", () => {
    const callback = vi.fn();
    hooks.addHook("check", callback);
    hooks.trigger("check", check);
    expect(callback).toHaveBeenCalledWith(check);
  });

  it("triggers flag diagnostic updates", () => {
    const callback = vi.fn();
    const flags: RawFlags = {};
    hooks.addHook("flagsUpdated", callback);
    hooks.trigger("flagsUpdated", flags);
    expect(callback).toHaveBeenCalledWith(flags);
  });

  it("triggers opt-in loading updates", () => {
    const callback = vi.fn();
    hooks.addHook("optInFlagsLoadingUpdated", callback);
    hooks.trigger("optInFlagsLoadingUpdated", true);
    expect(callback).toHaveBeenCalledWith(true);
  });

  it("preserves ordinary tracking hooks", () => {
    const callback = vi.fn();
    const user: UserContext = { id: "user-id" };
    const company: CompanyContext = { id: "company-id" };
    const event = {
      eventName: "event",
      attributes: { key: "value" },
      user,
      company,
    };
    hooks.addHook("track", callback);
    hooks.trigger("track", event);
    expect(callback).toHaveBeenCalledWith(event);
  });

  it.each(["user", "company"] as const)("triggers %s hooks", (type) => {
    const callback = vi.fn();
    const context = { id: "id", name: "name" };
    hooks.addHook(type, callback);
    hooks.trigger(type, context);
    expect(callback).toHaveBeenCalledWith(context);
  });

  it("notifies multiple subscribers", () => {
    const first = vi.fn();
    const second = vi.fn();
    hooks.addHook("check", first);
    hooks.addHook("check", second);
    hooks.trigger("check", check);
    expect(first).toHaveBeenCalledWith(check);
    expect(second).toHaveBeenCalledWith(check);
  });

  it("removes only the specified subscriber", () => {
    const first = vi.fn();
    const second = vi.fn();
    hooks.addHook("check", first);
    hooks.addHook("check", second);
    hooks.removeHook("check", first);
    hooks.trigger("check", check);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(check);
  });

  it("returns an unsubscribe function", () => {
    const callback = vi.fn();
    const remove = hooks.addHook("check", callback);
    remove();
    hooks.trigger("check", check);
    expect(callback).not.toHaveBeenCalled();
  });
});
