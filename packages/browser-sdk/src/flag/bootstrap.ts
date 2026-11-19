import { parseAPIFlagsResponse } from "./flagCache";
import { isValidFlagStateVersion } from "./flagStateVersion";

export function isValidBootstrapSnapshot(snapshot: {
  protocolVersion: unknown;
  flags: unknown;
  flagStateVersion?: unknown;
}): boolean {
  return (
    snapshot.protocolVersion === 2 &&
    !!parseAPIFlagsResponse(snapshot.flags, true) &&
    (snapshot.flagStateVersion === undefined ||
      isValidFlagStateVersion(snapshot.flagStateVersion))
  );
}
