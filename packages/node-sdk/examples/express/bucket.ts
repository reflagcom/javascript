import { ReflagClient, Context, FlagOverrides } from "../../";

type CreateConfigPayload = {
  minimumLength: number;
};

// Extending the Flags interface to define the available features
declare module "../../types" {
  interface Flags {
    "show-todos": boolean;
    "create-todos": {
      config: {
        payload: CreateConfigPayload;
      };
    };
    "delete-todos": boolean;
    "some-else": {};
  }
}

let featureOverrides = (_: Context): FlagOverrides => {
  return {
    "create-todos": {
      isEnabled: true,
      config: {
        key: "short",
        payload: {
          minimumLength: 10,
        },
      },
    },
  }; // feature keys checked at compile time
};

// Create a new ReflagClient instance with the secret key and default features
// The default features will be used if the user does not have any features set
// Create a reflag.config.json file to configure the client or set environment variables
// like REFLAG_SECRET_KEY, REFLAG_FLAGS_ENABLED, REFLAG_FLAGS_DISABLED, etc.
export default new ReflagClient({
  // Optional: Set a logger to log debug information, errors, etc.
  logger: console,
  featureOverrides, // Optional: Set feature overrides
});
