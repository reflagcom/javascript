import { ReflagClient as ReflagNodeClient } from "@reflag/node-sdk";

const secretKey = process.env.REFLAG_SECRET_KEY;
export const publishableKey = process.env.REFLAG_PUBLISHABLE_KEY || "";
export const secretKeyConfigured = Boolean(secretKey);
const offline = process.env.CI === "true" || !secretKey;

declare global {
  var serverClient: ReflagNodeClient;
  var reflagDemoEnvironmentWarningsShown: boolean | undefined;
}

function warnAboutMissingKeys() {
  if (globalThis.reflagDemoEnvironmentWarningsShown) return;

  if (!secretKey) {
    console.warn(
      "[Reflag demo] REFLAG_SECRET_KEY is missing; server-side flag evaluation will run in offline mode.",
    );
  }
  if (!publishableKey) {
    console.warn(
      "[Reflag demo] REFLAG_PUBLISHABLE_KEY is missing; the browser SDK will run in offline mode.",
    );
  }
  globalThis.reflagDemoEnvironmentWarningsShown = true;
}

/**
 * Create a singleton server client and store it in globalThis.
 * This avoids creating multiple instances of the client in each loaded chunk.
 * @returns The server client.
 */
export async function getServerClient() {
  warnAboutMissingKeys();

  if (!globalThis.serverClient) {
    globalThis.serverClient = new ReflagNodeClient({
      secretKey,
      offline,
    });
  }
  await globalThis.serverClient.initialize();
  return globalThis.serverClient;
}
