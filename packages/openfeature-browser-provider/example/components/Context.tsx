"use client";

import { OpenFeature } from "@openfeature/react-sdk";
import React from "react";

const initialContext = {
  trackingKey: "user42",
  companyName: "Acme Inc.",
  companyPlan: "enterprise",
  companyId: "company42",
};

export const Context = () => {
  const [context, setContext] = React.useState<any>(
    JSON.stringify(initialContext, null, 2),
  );
  let validJson = true;
  try {
    validJson = JSON.parse(context);
  } catch {
    validJson = false;
  }

  return (
    <div className="flex flex-col border border-gray-300 p-6 rounded-xl size-full dark:border-neutral-800 dark:bg-zinc-800/30">
      <h3 className="text-xl mb-4">Context:</h3>
      <textarea
        className="min-h-[200px]"
        value={context}
        onChange={(e) => setContext(e.target.value)}
      ></textarea>
      <button
        disabled={!validJson}
        className="border-solid m-auto max-w-60 border-2 border-indigo-600 rounded-lg p-2 mt-4 disabled:opacity-50"
        onClick={() => OpenFeature.setContext(JSON.parse(context))}
      >
        Update Context
      </button>
      <span className="text-gray-600">
        Open the developer console to see what happens when you update the
        context.
      </span>
    </div>
  );
};
