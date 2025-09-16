import { App } from "vue";

import {
  CheckEvent,
  CompanyContext,
  TrackEvent,
  UserContext,
} from "@reflag/browser-sdk";

import ReflagBootstrappedProvider from "./ReflagBootstrappedProvider.vue";
import ReflagProvider from "./ReflagProvider.vue";
import {
  BootstrappedFlags,
  EmptyFlagRemoteConfig,
  Flag,
  FlagType,
  ReflagProps,
} from "./types";

export {
  useClient,
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
  ReflagBaseProps,
  ReflagBootstrappedProps,
  ReflagProps,
  RequestFlagFeedbackOptions,
} from "./types";

export { ReflagBootstrappedProvider, ReflagProvider };

export type {
  BootstrappedFlags,
  CheckEvent,
  CompanyContext,
  EmptyFlagRemoteConfig,
  Flag,
  FlagType,
  TrackEvent,
  UserContext,
};

export default {
  install(app: App, _options?: ReflagProps) {
    app.component("ReflagProvider", ReflagProvider);
    app.component("ReflagBootstrappedProvider", ReflagBootstrappedProvider);
  },
};
