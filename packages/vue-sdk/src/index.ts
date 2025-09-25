import { App } from "vue";

import ReflagBootstrappedProvider from "./ReflagBootstrappedProvider.vue";
import ReflagClientProvider from "./ReflagClientProvider.vue";
import ReflagProvider from "./ReflagProvider.vue";

export {
  useClient,
  useClientEvent,
  useFlag,
  useIsLoading,
  useRequestFeedback,
  useSendFeedback,
  useTrack,
  useUpdateCompany,
  useUpdateOtherContext,
  useUpdateUser,
} from "./hooks";
export type {
  BootstrappedFlags,
  EmptyFlagRemoteConfig,
  Flag,
  Flags,
  FlagType,
  ReflagBootstrappedProps,
  ReflagInitOptionsBase,
  ReflagProps,
  RequestFlagFeedbackOptions,
  TypedFlags,
} from "./types";
export type {
  CheckEvent,
  CompanyContext,
  TrackEvent,
  UserContext,
} from "@reflag/browser-sdk";

export { ReflagBootstrappedProvider, ReflagClientProvider, ReflagProvider };

export default {
  install(app: App) {
    app.component("ReflagProvider", ReflagProvider);
    app.component("ReflagBootstrappedProvider", ReflagBootstrappedProvider);
    app.component("ReflagClientProvider", ReflagClientProvider);
  },
};
