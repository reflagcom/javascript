import { OpenFeature } from "@openfeature/server-sdk";
import { ReflagNodeProvider } from "../src";

if (!process.env.REFLAG_SECRET_KEY) {
  throw new Error("REFLAG_SECRET_KEY is required");
}

export type CreateTodosConfig = {
  maxLength: number;
};

const provider = new ReflagNodeProvider({
  secretKey: process.env.REFLAG_SECRET_KEY!,
  fallbackFlags: {
    "show-todos": {
      isEnabled: true,
    },
    "create-todos": {
      isEnabled: true,
      config: {
        key: "default",
        payload: {
          maxLength: 100,
        },
      },
    },
  },
  logger: console,
});

OpenFeature.setProvider(provider);

export default provider;
