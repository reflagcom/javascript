"use client";

import React, { ReactNode } from "react";
import {
  BootstrappedFlags,
  ReflagBootstrappedProvider,
} from "@reflag/react-sdk";

type Props = {
  publishableKey: string;
  flags: BootstrappedFlags;
  children: ReactNode;
};

export const Providers = ({ publishableKey, flags, children }: Props) => {
  return (
    <ReflagBootstrappedProvider publishableKey={publishableKey} flags={flags}>
      {children}
    </ReflagBootstrappedProvider>
  );
};
