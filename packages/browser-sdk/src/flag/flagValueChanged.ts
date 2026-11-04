import { deepEqual } from "fast-equals";

import type { RawFlag } from "./flags";

/**
 * Compare effective values without reading telemetry-producing getters.
 * @internal
 */
export function flagValueChanged(
  previous: RawFlag | undefined,
  next: RawFlag | undefined,
): boolean {
  if (previous === next) return false;
  if (!previous || !next) return true;

  return (
    (previous.isEnabledOverride ?? previous.isEnabled) !==
      (next.isEnabledOverride ?? next.isEnabled) ||
    previous.config?.key !== next.config?.key ||
    !deepEqual(previous.config?.payload, next.config?.payload)
  );
}
