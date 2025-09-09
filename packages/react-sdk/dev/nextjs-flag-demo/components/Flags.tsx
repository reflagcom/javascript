"use client";

import React from "react";
import { useFlag } from "@reflag/react-sdk";

export const Flags = () => {
  const { isEnabled } = useFlag("huddle");
  return (
    <div className="border border-gray-300 p-6 rounded-xl dark:border-neutral-800 dark:bg-zinc-800/30">
      <h3 className="text-xl mb-4">Huddle feature enabled:</h3>
      <pre>
        <code className="font-mono font-bold">{JSON.stringify(isEnabled)}</code>
      </pre>
    </div>
  );
};
