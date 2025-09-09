"use client";

import { ReflagBrowserSDKProvider } from "@reflag/openfeature-browser-provider";
import { OpenFeature } from "@openfeature/react-sdk";

const publishableKey = process.env.NEXT_PUBLIC_REFLAG_PUBLISHABLE_KEY;

let reflagProvider: ReflagBrowserSDKProvider | null = null;
let initialized = false;

export async function initOpenFeature() {
  if (initialized) {
    return;
  }
  initialized = true;

  if (!publishableKey) {
    console.error("No publishable key set for Reflag");
    return;
  }
  reflagProvider = new ReflagBrowserSDKProvider({
    publishableKey,
    fallbackFlags: {
      huddle: {
        key: "zoom", // huddleMeetingProvider
        payload: {
          joinUrl: "https://zoom.us/join",
        },
      },
    },
  });
  return OpenFeature.setProviderAndWait(reflagProvider);
}

export function track(event: string, attributes?: { [key: string]: any }) {
  console.log("Tracking event", event, attributes);
  reflagProvider?.client?.track(event, attributes);
}
