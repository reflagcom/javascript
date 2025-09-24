import { DEFAULT_OVERRIDES_KEY } from "@reflag/browser-sdk";
import {
  Context,
  FlagOverrides,
  ReflagClient as ReflagNodeClient,
} from "@reflag/node-sdk";
import { cookies } from "next/headers";

const secretKey = process.env.REFLAG_SECRET_KEY || "";
const offline = process.env.CI === "true";

declare global {
  var serverClient: ReflagNodeClient;
}

function isObject(item: any): item is Record<string, any> {
  return (item && typeof item === "object" && !Array.isArray(item)) || false;
}

/**
 * Create a singleton server client and store it in globalThis.
 * This avoids recreating the client in each chunk.
 * @returns The server client
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

/**
 * Get flag overrides from the NextJS cookies.
 * @returns The parsed overrides object
 */
export async function getFlagOverrides(): Promise<FlagOverrides | undefined> {
  try {
    const cookieStore = await cookies();
    const overridesCookie = cookieStore.get(DEFAULT_OVERRIDES_KEY)?.value;
    const overrides = JSON.parse(overridesCookie || "{}");
    if (!isObject(overrides)) throw new Error("invalid overrides");
    return overrides;
  } catch (error) {
    console.error("unable to get overrides from nextjs cookie", error);
    return {};
  }
}

/**
 * Get bootstrapped flags for the given context.
 * @param context - The context to get the flags for.
 * @returns The bootstrapped flags.
 */
export async function getBootstrappedFlags(context: Context) {
  const serverClient = await getServerClient();
  // return serverClient.getFlagsForBootstrap(context);
  return serverClient.getFlagsForBootstrap(context, await getFlagOverrides());
}
