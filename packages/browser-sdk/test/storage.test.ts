import { afterEach, describe, expect, it, vi } from "vitest";

async function loadStorageModule() {
  vi.resetModules();
  return import("../src/storage");
}

const localStorageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);

function restoreLocalStorageDescriptor() {
  const descriptor = localStorageDescriptor;
  if (descriptor) {
    Object.defineProperty(globalThis, "localStorage", descriptor);
  } else {
    delete (globalThis as Record<string, unknown>).localStorage;
  }
}

function defineThrowingLocalStorage(errorName = "SecurityError") {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      const error = new Error("Access is denied for this document.");
      error.name = errorName;
      throw error;
    },
  });
}

describe("storage adapters", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    restoreLocalStorageDescriptor();
    localStorage.clear();
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

  it.each(["SecurityError", "NS_ERROR_FAILURE", "NS_ERROR_ABORT"])(
    "localStorage adapter ignores %s when storage access is denied",
    async (errorName) => {
      const { getLocalStorageAdapter } = await loadStorageModule();
      defineThrowingLocalStorage(errorName);

      const adapter = getLocalStorageAdapter();

      expect(await adapter.getItem("key")).toBeNull();
      await expect(adapter.setItem("key", "value")).resolves.toBeUndefined();
      await expect(adapter.removeItem?.("key")).resolves.toBeUndefined();
    },
  );

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
