"use client";

import React from "react";
import {
  useBooleanFlagValue,
  useObjectFlagDetails,
} from "@openfeature/react-sdk";
import { track } from "@/app/featureManagement";

const flagKey = "huddle";

export const HuddleFeature = () => {
  const isEnabled = useBooleanFlagValue(flagKey, false);
  const { variant: huddleMeetingProvider, value: config } =
    useObjectFlagDetails(flagKey, {
      joinUrl: "https://zoom.us/join",
    });

  return (
    <div className="border border-gray-300 p-6 rounded-xl dark:border-neutral-800 dark:bg-zinc-800/30">
      <h3 className="text-xl mb-4">Huddle feature enabled:</h3>
      <pre>
        <code className="font-mono font-bold">{JSON.stringify(isEnabled)}</code>
      </pre>
      <h3 className="text-xl mb-4">
        Huddle using <strong>{huddleMeetingProvider}</strong>:
      </h3>
      <pre>
        <code className="font-mono font-bold">
          Join the huddle at <a href={config.joinUrl}>{config.joinUrl}</a>
        </code>
      </pre>
      <button
        className="border-solid m-auto max-w-60 border-2 border-indigo-600 rounded-lg p-2 mt-4 disabled:opacity-50"
        onClick={() => track(flagKey)}
      >
        Track usage
      </button>
    </div>
  );
};
