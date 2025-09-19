"use client";

import React, { ReactNode } from "react";
import { ReflagProvider } from "@reflag/react-sdk";

type Props = {
  publishableKey: string;
  children: ReactNode;
};

export const Providers = ({ publishableKey, children }: Props) => {
  return (
    <ReflagProvider
      publishableKey={publishableKey}
      company={{ id: "demo-company", name: "Demo Company" }}
      user={{
        id: "demo-user",
        email: "demo-user@example.com",
        "optin-huddles": "true",
      }}
      fallbackFlags={["fallback-feature"]}
    >
      {children}
    </ReflagProvider>
  );
};
