import { StorageAdapter } from "../storage";

import { RawFlags } from "./flags";

const DEFAULT_STORAGE_KEY = "__reflag_fetched_flags";

interface cacheEntry {
  expireAt: number;
  staleAt: number;
  flags: RawFlags;
}

// Parse and validate an API flags response
export function parseAPIFlagsResponse(flagsInput: any): RawFlags | undefined {
  if (!isObject(flagsInput)) {
    return;
  }

  const flags: RawFlags = {};
  for (const key in flagsInput) {
    const flag = flagsInput[key];

    if (
      typeof flag.isEnabled !== "boolean" ||
      flag.key !== key ||
      typeof flag.targetingVersion !== "number" ||
      (flag.config && typeof flag.config !== "object") ||
      (flag.missingContextFields &&
        !Array.isArray(flag.missingContextFields)) ||
      (flag.ruleEvaluationResults && !Array.isArray(flag.ruleEvaluationResults))
    ) {
      return;
    }

    flags[key] = {
      isEnabled: flag.isEnabled,
      targetingVersion: flag.targetingVersion,
      key,
      config: flag.config,
      missingContextFields: flag.missingContextFields,
      ruleEvaluationResults: flag.ruleEvaluationResults,
    };
  }

  return flags;
}

export interface CacheResult {
  flags: RawFlags;
  stale: boolean;
}

const memoryStorage = (): StorageAdapter => {
  let value: string | null = null;
  return {
    getItem: async () => value,
    setItem: async (_key, nextValue) => {
      value = nextValue;
    },
    removeItem: async () => {
      value = null;
    },
  };
};

export class FlagCache {
  private storage: StorageAdapter;
  private readonly storageKey: string;
  private readonly staleTimeMs: number;
  private readonly expireTimeMs: number;

  constructor({
    storage,
    staleTimeMs,
    expireTimeMs,
  }: {
    storage: StorageAdapter | null;
    staleTimeMs: number;
    expireTimeMs: number;
  }) {
    this.storage = storage ?? memoryStorage();
    this.storageKey = DEFAULT_STORAGE_KEY;
    this.staleTimeMs = staleTimeMs;
    this.expireTimeMs = expireTimeMs;
  }

  async set(
    key: string,
    {
      flags,
    }: {
      flags: RawFlags;
    },
  ) {
    let cacheData: CacheData = {};

    try {
      const cachedResponseRaw = await this.storage.getItem(this.storageKey);
      if (cachedResponseRaw) {
        cacheData = validateCacheData(JSON.parse(cachedResponseRaw)) ?? {};
      }
    } catch {
      // ignore errors
    }

    cacheData[key] = {
      expireAt: Date.now() + this.expireTimeMs,
      staleAt: Date.now() + this.staleTimeMs,
      flags,
    } satisfies cacheEntry;

    cacheData = Object.fromEntries(
      Object.entries(cacheData).filter(([_k, v]) => v.expireAt > Date.now()),
    );

    await this.storage.setItem(this.storageKey, JSON.stringify(cacheData));

    return cacheData;
  }

  async get(key: string): Promise<CacheResult | undefined> {
    try {
      const cachedResponseRaw = await this.storage.getItem(this.storageKey);
      if (cachedResponseRaw) {
        const cachedResponse = validateCacheData(JSON.parse(cachedResponseRaw));
        if (
          cachedResponse &&
          cachedResponse[key] &&
          cachedResponse[key].expireAt > Date.now()
        ) {
          return {
            flags: cachedResponse[key].flags,
            stale: cachedResponse[key].staleAt < Date.now(),
          };
        }
      }
    } catch {
      // ignore errors
    }
    return;
  }
}

type CacheData = Record<string, cacheEntry>;
function validateCacheData(cacheDataInput: any) {
  if (!isObject(cacheDataInput)) {
    return;
  }

  const cacheData: CacheData = {};
  for (const key in cacheDataInput) {
    const cacheEntry = cacheDataInput[key];
    if (!isObject(cacheEntry)) return;

    if (
      typeof cacheEntry.expireAt !== "number" ||
      typeof cacheEntry.staleAt !== "number" ||
      (cacheEntry.flags && !parseAPIFlagsResponse(cacheEntry.flags))
    ) {
      return;
    }

    cacheData[key] = {
      expireAt: cacheEntry.expireAt,
      staleAt: cacheEntry.staleAt,
      flags: cacheEntry.flags,
    };
  }
  return cacheData;
}

/**
 * Check if the given item is an object.
 *
 * @param item - The item to check.
 * @returns `true` if the item is an object, `false` otherwise.
 **/
export function isObject(item: any): item is Record<string, any> {
  return (item && typeof item === "object" && !Array.isArray(item)) || false;
}
