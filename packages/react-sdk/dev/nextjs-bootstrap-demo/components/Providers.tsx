"use client";

import React, { ReactNode } from "react";
import {
  BootstrappedFlags,
  ReflagBootstrappedProvider,
} from "@reflag/react-sdk";
import {
  CookieOverridesProvider,
  DEFAULT_OVERRIDES_KEY,
} from "@reflag/browser-sdk";

type Props = {
  publishableKey: string;
  flags: BootstrappedFlags;
  children: ReactNode;
};

// Use the store flag overrides in a cookie for retrieval on the server.
// Note that classes can only be provided as props on the client side, hence the "use client" directive.
const overridesProvider = new CookieOverridesProvider(DEFAULT_OVERRIDES_KEY);

export const Providers = ({ publishableKey, flags, children }: Props) => {
  return (
    <ReflagBootstrappedProvider
      publishableKey={publishableKey}
      overridesProvider={overridesProvider}
      flags={flags}
    >
      {children}
    </ReflagBootstrappedProvider>
  );
};
