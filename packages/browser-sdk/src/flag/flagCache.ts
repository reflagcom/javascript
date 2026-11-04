import { StorageAdapter } from "../storage";
import type { RawFlags } from "./flags";
import { isValidFlagStateVersion } from "./flagStateVersion";
import { copyJSON, isFlagValue } from "./values";

// Never interpret a v1 wrapper as a v2 value or reuse its stored selections.
const DEFAULT_STORAGE_KEY = "__reflag_fetched_flags_v2";

export function isObject(item: unknown): item is Record<string, any> {
  return item !== null && typeof item === "object" && !Array.isArray(item);
}

/** Accept complete evaluated snapshots atomically, including Node v2 bootstrap. */
export function parseAPIFlagsResponse(
  input: unknown,
  bootstrap = false,
): RawFlags | undefined {
  if (!isObject(input)) return;
  const flags: RawFlags = Object.create(null);
  for (const [key, flag] of Object.entries(input)) {
    if (
      !isObject(flag) ||
      !(
        isFlagValue(flag.value) ||
        (bootstrap && flag.resolved === false && flag.value === undefined)
      ) ||
      !Array.isArray(flag.ruleResults) ||
      !flag.ruleResults.every(
        (r: unknown) =>
          isObject(r) &&
          typeof r.ruleId === "string" &&
          typeof r.matched === "boolean" &&
          (r.allocationIndex === undefined ||
            (Number.isInteger(r.allocationIndex) && r.allocationIndex >= 0)) &&
          (r.destination === undefined ||
            (isObject(r.destination) &&
              (r.destination.type === "nextRule" ||
                (r.destination.type === "variant" &&
                  typeof r.destination.variantKey === "string")))),
      ) ||
      !Array.isArray(flag.errors) ||
      !flag.errors.every(
        (error: unknown) =>
          isObject(error) &&
          typeof error.code === "string" &&
          typeof error.message === "string" &&
          (error.field === undefined || typeof error.field === "string") &&
          (error.operator === undefined ||
            typeof error.operator === "string") &&
          (error.source === undefined ||
            (isObject(error.source) &&
              (error.source.type === "flag" ||
                error.source.type === "segment") &&
              typeof error.source.key === "string")),
      ) ||
      (flag.matchedRuleId !== undefined &&
        typeof flag.matchedRuleId !== "string") ||
      (flag.allocationIndex !== undefined &&
        (!Number.isInteger(flag.allocationIndex) || flag.allocationIndex < 0))
    )
      return;

    // Missing metadata is valid for Node bootstrap and older v2 snapshots.
    // Explicit null means opt-in is known to be unavailable, not still loading.
    if (flag.optInEnabled === undefined) {
      if (flag.optIn !== undefined) return;
    } else if (
      typeof flag.optInEnabled !== "boolean" ||
      flag.optIn === undefined ||
      (flag.optIn !== null &&
        (flag.optInEnabled !== true ||
          !isObject(flag.optIn) ||
          typeof flag.optIn.name !== "string" ||
          !(
            flag.optIn.description === null ||
            typeof flag.optIn.description === "string"
          ) ||
          typeof flag.optIn.userOptedIn !== "boolean" ||
          typeof flag.optIn.companyOptedIn !== "boolean" ||
          typeof flag.optIn.isOptedIn !== "boolean"))
    )
      return;

    const selected =
      typeof flag.variantKey === "string" &&
      flag.variantKey.length > 0 &&
      typeof flag.sourceVersionId === "string" &&
      flag.sourceVersionId.length > 0;
    if (
      !selected &&
      !(
        bootstrap &&
        flag.variantKey === undefined &&
        flag.sourceVersionId === undefined
      )
    )
      return;
    if (bootstrap && typeof flag.resolved !== "boolean") return;
    if (selected && flag.resolved === false) return;
    flags[key] = copyJSON({
      value: flag.value,
      resolved: bootstrap ? flag.resolved : true,
      variantKey: flag.variantKey,
      sourceVersionId: flag.sourceVersionId,
      matchedRuleId: flag.matchedRuleId,
      allocationIndex: flag.allocationIndex,
      ruleResults: flag.ruleResults,
      errors: flag.errors,
      ...(flag.optInEnabled === undefined
        ? {}
        : { optInEnabled: flag.optInEnabled, optIn: flag.optIn }),
    });
  }
  return flags;
}

export interface CacheResult {
  flags: RawFlags;
  stale: boolean;
  flagStateVersion?: number;
}

type CacheEntry = Omit<CacheResult, "stale"> & {
  expireAt: number;
  staleAt: number;
  protocolVersion: 2;
};
type CacheData = Record<string, CacheEntry>;

function validateCacheData(input: unknown): CacheData | undefined {
  if (!isObject(input)) return;
  const data: CacheData = Object.create(null);
  for (const [key, entry] of Object.entries(input)) {
    if (
      !isObject(entry) ||
      entry.protocolVersion !== 2 ||
      !Number.isFinite(entry.expireAt) ||
      !Number.isFinite(entry.staleAt) ||
      (entry.flagStateVersion !== undefined &&
        !isValidFlagStateVersion(entry.flagStateVersion))
    )
      return;
    const flags = parseAPIFlagsResponse(entry.flags, true);
    if (!flags) return;
    data[key] = { ...entry, flags } as CacheEntry;
  }
  return data;
}

export class FlagCache {
  private writes: Promise<unknown> = Promise.resolve();
  constructor(
    private options: {
      storage: StorageAdapter;
      staleTimeMs: number;
      expireTimeMs: number;
    },
  ) {}

  async set(
    key: string,
    snapshot: { flags: RawFlags; flagStateVersion?: number },
  ) {
    const owned = copyJSON(snapshot);
    const write = this.writes
      .catch(() => undefined)
      .then(async () => {
        let data: CacheData = Object.create(null);
        try {
          const stored =
            await this.options.storage.getItem(DEFAULT_STORAGE_KEY);
          if (stored) data = validateCacheData(JSON.parse(stored)) ?? data;
        } catch {
          /* Invalid or inaccessible cache is not authoritative. */
        }
        const existing = Object.prototype.hasOwnProperty.call(data, key)
          ? data[key]
          : undefined;
        if (
          existing?.flagStateVersion !== undefined &&
          (owned.flagStateVersion === undefined ||
            owned.flagStateVersion < existing.flagStateVersion)
        )
          return data;
        data[key] = {
          ...owned,
          protocolVersion: 2,
          expireAt: Date.now() + this.options.expireTimeMs,
          staleAt: Date.now() + this.options.staleTimeMs,
        };
        data = Object.fromEntries(
          Object.entries(data).filter(
            ([, entry]) => entry.expireAt > Date.now(),
          ),
        );
        await this.options.storage.setItem(
          DEFAULT_STORAGE_KEY,
          JSON.stringify(data),
        );
        return data;
      });
    this.writes = write;
    return write;
  }

  async get(key: string): Promise<CacheResult | undefined> {
    try {
      const stored = await this.options.storage.getItem(DEFAULT_STORAGE_KEY);
      const data = stored ? validateCacheData(JSON.parse(stored)) : undefined;
      const entry =
        data && Object.prototype.hasOwnProperty.call(data, key)
          ? data[key]
          : undefined;
      if (entry && entry.expireAt > Date.now())
        return {
          flags: entry.flags,
          flagStateVersion: entry.flagStateVersion,
          stale: entry.staleAt < Date.now(),
        };
    } catch {
      /* Cache misses must not prevent a live fetch. */
    }
    return undefined;
  }
}
