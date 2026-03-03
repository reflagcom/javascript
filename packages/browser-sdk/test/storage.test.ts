import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMemoryStorageAdapter,
  getDefaultStorageAdapter,
  getLocalStorageAdapter,
} from "../src/storage";

describe("storage adapters", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("memory adapter stores and retrieves values", async () => {
    const adapter = createMemoryStorageAdapter();

    expect(await adapter.getItem("key")).toBeNull();
    await adapter.setItem("key", "value");
    expect(await adapter.getItem("key")).toBe("value");

    await adapter.removeItem?.("key");
    expect(await adapter.getItem("key")).toBeNull();
  });

  it("localStorage adapter throws when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => getLocalStorageAdapter()).toThrowError(
      "localStorage is not available. Provide a custom storage adapter.",
    );
  });

  it("default adapter falls back when localStorage is unavailable", async () => {
    vi.stubGlobal("localStorage", undefined);
    const adapter = getDefaultStorageAdapter();

    await adapter.setItem("fallback", "ok");
    expect(await adapter.getItem("fallback")).toBe("ok");
  });
});
