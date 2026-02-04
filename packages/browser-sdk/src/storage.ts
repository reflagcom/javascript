export type StorageAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
};

export function getLocalStorageAdapter(): StorageAdapter {
  if (
    typeof localStorage === "undefined" ||
    !("setItem" in localStorage) ||
    !("removeItem" in localStorage)
  ) {
    throw new Error(
      "localStorage is not available. Provide a custom storage adapter.",
    );
  }
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
