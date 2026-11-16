import { vi } from "vitest";

// React Native has a window/global object, but no document or browser storage.
vi.stubGlobal("window", globalThis);
vi.stubGlobal("navigator", { product: "ReactNative" });
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
