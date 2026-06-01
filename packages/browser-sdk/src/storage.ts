import { IS_SERVER } from "./config";
import { checkIsSecurityError } from "./security-error";

export type StorageAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
};

export function createNoopStorageAdapter(): StorageAdapter {
  return {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  };
}

/**
 * Get an item from local storage safely.
 */
export function getItem(key: string): string | null {
  try {
    if (typeof localStorage !== "undefined" && localStorage) {
      return localStorage.getItem(key);
    }
    return null;
  } catch (error) {
    if (checkIsSecurityError(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * Set an item in local storage safely.
 */
export function setItem(key: string, value: string): boolean {
  try {
    if (typeof localStorage !== "undefined" && localStorage) {
      localStorage.setItem(key, value);
      return true;
    }
    return false;
  } catch (error) {
    if (checkIsSecurityError(error)) {
      return false;
    }
    throw error;
  }
}

/**
 * Remove an item from local storage safely.
 */
export function removeItem(key: string): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    }
  } catch (error) {
    if (checkIsSecurityError(error)) {
      return;
    }
    throw error;
  }
}

export function getLocalStorageAdapter(): StorageAdapter {
  try {
    if (
      typeof localStorage === "undefined" ||
      !("setItem" in localStorage) ||
      !("removeItem" in localStorage)
    ) {
      throw new Error(
        "localStorage is not available. Provide a custom storage adapter.",
      );
    }
  } catch (error) {
    if (!checkIsSecurityError(error)) {
      throw error;
    }
  }

  return {
    getItem: async (key) => getItem(key),
    setItem: async (key, value) => {
      setItem(key, value);
    },
    removeItem: async (key) => {
      removeItem(key);
    },
  };
}

export function getDefaultStorageAdapter(): StorageAdapter {
  if (IS_SERVER) return createNoopStorageAdapter();
  return getLocalStorageAdapter();
}
