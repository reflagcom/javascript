import { App } from "vue";

import ReflagBootstrappedProvider from "./ReflagBootstrappedProvider.vue";
import ReflagClientProvider from "./ReflagClientProvider.vue";
import ReflagProvider from "./ReflagProvider.vue";

export {
  useClient,
  useFlag,
  useIsLoading,
  useOnEvent,
  useOptInFlags,
  useRequestFeedback,
  useSetOptIn,
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
  OptInFlag,
  ReflagBaseProps,
  ReflagBootstrappedProps,
  ReflagClientProviderProps,
  ReflagInitOptionsBase,
  ReflagProps,
  RequestFlagFeedbackOptions,
  TypedFlags,
  UseOptInFlagsResult,
} from "./types";
export type {
  CheckEvent,
  CompanyContext,
  SetOptInOptions,
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
