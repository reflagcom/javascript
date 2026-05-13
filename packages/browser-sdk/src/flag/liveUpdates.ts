import { Logger, loggerWithPrefix } from "../logger";
import { AblySSEChannel, openAblySSEChannel } from "../sse";
import { sha256Hex } from "../utils/hash";

/**
 * Prefix used for the SSE channel that broadcasts flag state changes.
 * Matches the node-sdk convention (`flags-state:${hashPrefix}`), but uses a
 * hash of the publishable key so it can be derived client-side.
 */
const FLAGS_STATE_CHANNEL_PREFIX = "flags-state:";

/**
 * Number of hex characters of the publishable key hash used to build the
 * channel name. Matches the node-sdk's 16-character prefix.
 */
const CHANNEL_HASH_LENGTH = 16;

/**
 * Derive the flag-updates channel name for a publishable key.
 *
 * The channel name is the SHA-256 hex digest of the publishable key,
 * truncated to {@link CHANNEL_HASH_LENGTH} characters and prefixed with
 * `flags-state:`.
 */
export async function computeFlagUpdatesChannelName(
  publishableKey: string,
): Promise<string> {
  const hash = await sha256Hex(publishableKey);
  return `${FLAGS_STATE_CHANNEL_PREFIX}${hash.slice(0, CHANNEL_HASH_LENGTH)}`;
}

/**
 * Open a live flag-updates SSE subscription.
 *
 * Subscribes to a public (tokenless) channel derived from the publishable
 * key. When a `flags-updated` message is received, {@link onFlagsUpdated} is
 * invoked so the caller can refresh its flags.
 *
 * Returns `undefined` if the environment does not support SSE (no
 * `EventSource`) or if the channel name cannot be computed (for example
 * because the Web Crypto API is unavailable). In these cases a warning is
 * logged and live updates are silently disabled.
 *
 * @internal
 */
export async function openFlagUpdatesChannel({
  publishableKey,
  sseBaseUrl,
  onFlagsUpdated,
  logger,
}: {
  publishableKey: string;
  sseBaseUrl: string;
  onFlagsUpdated: () => void;
  logger: Logger;
}): Promise<AblySSEChannel | undefined> {
  const scopedLogger = loggerWithPrefix(logger, "[LiveFlags]");

  if (typeof EventSource === "undefined") {
    scopedLogger.warn(
      "live flag updates disabled: EventSource is not available in this environment",
    );
    return undefined;
  }

  let channel: string;
  try {
    channel = await computeFlagUpdatesChannelName(publishableKey);
  } catch (e) {
    scopedLogger.warn(
      "live flag updates disabled: failed to derive channel name",
      e,
    );
    return undefined;
  }

  scopedLogger.debug("opening live flag updates channel", channel);

  return openAblySSEChannel({
    channel,
    sseBaseUrl,
    logger: scopedLogger,
    callback: (message) => {
      // The server may wrap payloads in `{ name, data }`; accept either shape.
      const name =
        (message as { name?: string })?.name ??
        (message as { event?: string })?.event;
      if (name && name !== "flags-updated") {
        return;
      }
      scopedLogger.debug("received live flag update", message);
      try {
        onFlagsUpdated();
      } catch (e) {
        scopedLogger.warn("error handling live flag update", e);
      }
    },
  });
}
