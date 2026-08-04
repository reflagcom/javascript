"use client";

import { useEffect } from "react";

type Props = {
  publishableKeyConfigured: boolean;
  secretKeyConfigured: boolean;
};

export function EnvironmentWarnings({
  publishableKeyConfigured,
  secretKeyConfigured,
}: Props) {
  useEffect(() => {
    if (!secretKeyConfigured) {
      console.warn(
        "[Reflag demo] REFLAG_SECRET_KEY is missing; server-side flag evaluation is running in offline mode.",
      );
    }
    if (!publishableKeyConfigured) {
      console.warn(
        "[Reflag demo] REFLAG_PUBLISHABLE_KEY is missing; the browser SDK is running in offline mode.",
      );
    }
  }, [publishableKeyConfigured, secretKeyConfigured]);

  return null;
}
