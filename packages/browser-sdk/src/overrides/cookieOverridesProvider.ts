import Cookies from "js-cookie";

import { isObject } from "../flag/flagCache";
import { FlagOverrides } from "../flag/flags";

import { DEFAULT_OVERRIDES_KEY, OverridesProvider } from "./overridesProvider";

export class CookieOverridesProvider implements OverridesProvider {
  constructor(
    private cookieKey = DEFAULT_OVERRIDES_KEY,
    private cookieOptions: Cookies.CookieAttributes = {
      expires: 7, // 1 week
      sameSite: "strict",
    },
  ) {}

  async setOverrides(overrides: FlagOverrides) {
    try {
      Cookies.set(
        this.cookieKey,
        JSON.stringify(overrides),
        this.cookieOptions,
      );
    } catch {
      console.warn(
        "storing flag overrides in cookies failed, overrides won't persist",
      );
    }
  }

  async getOverrides(): Promise<FlagOverrides> {
    const overridesCookie = Cookies.get(this.cookieKey);
    if (!overridesCookie) return {};
    const overrides = JSON.parse(overridesCookie || "{}");
    if (!isObject(overrides)) return {};
    return overrides;
  }
}
