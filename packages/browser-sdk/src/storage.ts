export type StorageAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
};

function isLocalStorageUsable() {
  return (
    typeof localStorage !== "undefined" &&
    "setItem" in localStorage &&
    "removeItem" in localStorage
  );
}

export function resolveStorageAdapter(
  storage?: StorageAdapter,
): StorageAdapter | null {
  if (storage) return storage;
  if (isLocalStorageUsable()) {
    return {
      getItem: async (key) => localStorage.getItem(key),
      setItem: async (key, value) => {
        localStorage.setItem(key, value);
      },
      removeItem: async (key) => {
        localStorage.removeItem(key);
      },
    };
  }
  // React Native: try AsyncStorage if available.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const asyncStorage = require("@react-native-async-storage/async-storage");
    const adapter = asyncStorage?.default ?? asyncStorage;
    if (adapter?.getItem && adapter?.setItem) {
      return adapter as StorageAdapter;
    }
  } catch {
    // ignore - not running in React Native or AsyncStorage not installed
  }
  return null;
}
