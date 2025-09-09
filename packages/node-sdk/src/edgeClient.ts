import { ReflagClient } from "./client";
import { ClientOptions } from "./types";

export type EdgeClientOptions = Omit<
  ClientOptions,
  "cacheStrategy" | "flushIntervalMs" | "batchOptions"
>;

/**
 * The EdgeClient is ReflagClient pre-configured to be used in edge runtimes, like
 * Cloudflare Workers.
 *
 * @example
 * ```ts
 * // set the REFLAG_SECRET_KEY environment variable or pass the secret key in the constructor
 * const client = new EdgeClient();
 *
 * // evaluate a flag
 * const context = {
 *   user: { id: "user-id" },
 *   company: { id: "company-id" },
 * }
 * const { isEnabled } = client.getFlag(context, "flag-key");
 *
 * ```
 */
export class EdgeClient extends ReflagClient {
  constructor(options: EdgeClientOptions = {}) {
    const opts = {
      ...options,
      cacheStrategy: "in-request" as const,
      batchOptions: {
        intervalMs: 0,
      },
    };
    super(opts);
  }
}
