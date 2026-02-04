export type StorageAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
};

export type StorageAdapterType =
  | "custom"
  | "localStorage"
  | "asyncStorage"
  | "none";

function isLocalStorageUsable() {
  return (
    typeof localStorage !== "undefined" &&
    "setItem" in localStorage &&
    "removeItem" in localStorage
  );
}

export function resolveStorageAdapter(
  storage?: StorageAdapter,
): { adapter: StorageAdapter | null; type: StorageAdapterType } {
  if (storage) return { adapter: storage, type: "custom" };
  if (isLocalStorageUsable()) {
    return {
      adapter: {
        getItem: async (key) => localStorage.getItem(key),
        setItem: async (key, value) => {
          localStorage.setItem(key, value);
        },
        removeItem: async (key) => {
          localStorage.removeItem(key);
        },
      },
      type: "localStorage",
    };
  }
  // React Native: try AsyncStorage if available.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const asyncStorage = require("@react-native-async-storage/async-storage");
    const adapter = asyncStorage?.default ?? asyncStorage;
    if (adapter?.getItem && adapter?.setItem) {
      return { adapter: adapter as StorageAdapter, type: "asyncStorage" };
    }
  } catch {
    // ignore - not running in React Native or AsyncStorage not installed
  }
  return { adapter: null, type: "none" };
}
