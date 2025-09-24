import { ReflagClient as ReflagNodeClient } from "@reflag/node-sdk";

const secretKey = process.env.REFLAG_SECRET_KEY || "";
const offline = process.env.CI === "true";

declare global {
  var serverClient: ReflagNodeClient;
}

/**
 * Create a singleton server client and store it in globalThis.
 * This avoids creating multiple instances of the client in each loaded chunk.
 * @returns The server client.
 */
export async function getServerClient() {
  if (!globalThis.serverClient) {
    globalThis.serverClient = new ReflagNodeClient({
      secretKey,
      offline,
    });
  }
  await globalThis.serverClient.initialize();
  return globalThis.serverClient;
}
