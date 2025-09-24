import { isObject } from "../flag/flagCache";
import { FlagOverrides } from "../flag/flags";

import { DEFAULT_OVERRIDES_KEY, OverridesProvider } from "./overridesProvider";

export class StorageOverridesProvider implements OverridesProvider {
  constructor(
    private storageKey = DEFAULT_OVERRIDES_KEY,
    private storage: Storage | null = typeof localStorage !== "undefined"
      ? localStorage
      : null,
  ) {}

  async setOverrides(overrides: FlagOverrides) {
    try {
      if (this.storage === null) return;
      localStorage.setItem(this.storageKey, JSON.stringify(overrides));
    } catch {
      console.warn(
        "storing flag overrides in localStorage failed, overrides won't persist",
      );
    }
  }

  async getOverrides(): Promise<FlagOverrides> {
    if (this.storage === null) return {};
    const storageItem = localStorage.getItem(this.storageKey);
    if (!storageItem) return {};
    const overrides = JSON.parse(storageItem || "{}");
    if (!isObject(overrides)) return {};
    return overrides;
  }
}
