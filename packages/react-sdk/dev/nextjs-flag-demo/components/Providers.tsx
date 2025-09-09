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
      company={{ id: "acme_inc" }}
      user={{ id: "john doe" }}
      fallbackFlags={["fallback-feature"]}
    >
      {children}
    </ReflagProvider>
  );
};
