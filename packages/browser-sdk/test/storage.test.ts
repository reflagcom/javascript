import { afterEach, describe, expect, it, vi } from "vitest";

async function loadStorageModule() {
  vi.resetModules();
  return import("../src/storage");
}

describe("storage adapters", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("noop adapter ignores writes", async () => {
    const { createNoopStorageAdapter } = await loadStorageModule();
    const adapter = createNoopStorageAdapter();

    expect(await adapter.getItem("key")).toBeNull();
    await adapter.setItem("key", "value");
    expect(await adapter.getItem("key")).toBeNull();

    await adapter.removeItem?.("key");
    expect(await adapter.getItem("key")).toBeNull();
  });

  it("localStorage adapter throws when localStorage is unavailable", async () => {
    const { getLocalStorageAdapter } = await loadStorageModule();
    vi.stubGlobal("localStorage", undefined);
    expect(() => getLocalStorageAdapter()).toThrowError(
      "localStorage is not available. Provide a custom storage adapter.",
    );
  });

  it("default adapter falls back to noop on server runtimes", async () => {
    vi.resetModules();
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("localStorage", undefined);

    const { getDefaultStorageAdapter } = await import("../src/storage");
    const adapter = getDefaultStorageAdapter();

    await adapter.setItem("fallback", "ok");
    expect(await adapter.getItem("fallback")).toBeNull();
  });
});
