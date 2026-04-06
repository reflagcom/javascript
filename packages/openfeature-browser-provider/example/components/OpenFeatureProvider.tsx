"use client";

import { OpenFeatureProvider as OFProvider } from "@openfeature/react-sdk";
import { useEffect } from "react";

import { initOpenFeature } from "@/app/featureManagement";

export const OpenFeatureProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  useEffect(() => {
    initOpenFeature();
  }, []);

  return <OFProvider>{children}</OFProvider>;
};
