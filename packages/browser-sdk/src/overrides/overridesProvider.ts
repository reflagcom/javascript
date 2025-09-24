import { FlagOverrides } from "../flag/flags";

export const DEFAULT_OVERRIDES_KEY = "__reflag_overrides";

export interface OverridesProvider {
  /**
   * Set the overrides.
   * @param overrides - The overrides.
   */
  setOverrides(overrides: FlagOverrides): Promise<void>;

  /**
   * Get the overrides.
   * @returns The overrides.
   */
  getOverrides(): Promise<FlagOverrides>;
}
