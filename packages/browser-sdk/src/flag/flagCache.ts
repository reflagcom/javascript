import { FetchedFlags } from "./flags";

interface StorageItem {
  get(): string | null;
  set(value: string): void;
}

interface cacheEntry {
  expireAt: number;
  staleAt: number;
  flags: FetchedFlags;
}

// Parse and validate an API flags response
export function parseAPIFlagsResponse(
  flagsInput: any,
): FetchedFlags | undefined {
  if (!isObject(flagsInput)) {
    return;
  }

  const flags: FetchedFlags = {};
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
  flags: FetchedFlags;
  stale: boolean;
}

export class FlagCache {
  private storage: StorageItem;
  private readonly staleTimeMs: number;
  private readonly expireTimeMs: number;

  constructor({
    storage,
    staleTimeMs,
    expireTimeMs,
  }: {
    storage: StorageItem;
    staleTimeMs: number;
    expireTimeMs: number;
  }) {
    this.storage = storage;
    this.staleTimeMs = staleTimeMs;
    this.expireTimeMs = expireTimeMs;
  }

  set(
    key: string,
    {
      flags,
    }: {
      flags: FetchedFlags;
    },
  ) {
    let cacheData: CacheData = {};

    try {
      const cachedResponseRaw = this.storage.get();
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

    this.storage.set(JSON.stringify(cacheData));

    return cacheData;
  }

  get(key: string): CacheResult | undefined {
    try {
      const cachedResponseRaw = this.storage.get();
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

// Simple object check.
export function isObject(item: any): boolean {
  return item && typeof item === "object" && !Array.isArray(item);
}
