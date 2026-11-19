import AsyncStorage from "@react-native-async-storage/async-storage";
import ReactNativeEventSource from "react-native-sse";

import type {
  ReflagBootstrappedProps,
  ReflagInitOptionsBase,
  ReflagProps,
} from "@reflag/react-sdk";
import {
  ReflagBootstrappedProvider as BaseBootstrappedProvider,
  ReflagProvider as BaseProvider,
} from "@reflag/react-sdk";

import { version } from "../package.json";

const SDK_VERSION = `react-native-sdk/${version}`;

const defaultEventSourceFactory: NonNullable<
  ReflagInitOptionsBase["eventSourceFactory"]
> = (url) =>
  new ReactNativeEventSource<string>(url, {
    pollingInterval: 0,
  });

export {
  ReflagClientProvider,
  useClient,
  useFeature,
  useFlag,
  useFlagSuspense,
  useIsLoading,
  useOnEvent,
  useOptInFlags,
  useRequestFeedback,
  useSendFeedback,
  useSetOptIn,
  useTrack,
  useUpdateCompany,
  useUpdateOtherContext,
  useUpdateUser,
} from "@reflag/react-sdk";
export type {
  BootstrappedFlags,
  CheckEvent,
  CompanyContext,
  FlagDefaultValue,
  FlagKey,
  Flags,
  FlagValue,
  FlagValueFromDefault,
  OptInFlag,
  RawFlags,
  ReflagBootstrappedProps,
  ReflagClientProviderProps,
  ReflagInitOptionsBase,
  ReflagProps,
  ReflagPropsBase,
  RequestFeedbackOptions,
  SetOptInOptions,
  StorageAdapter,
  TrackEvent,
  TypedFlags,
  UseOptInFlagsOptions,
  UseOptInFlagsResult,
  UserContext,
} from "@reflag/react-sdk";

function nativeOptions(props: ReflagInitOptionsBase) {
  return {
    sdkVersion: SDK_VERSION,
    storage: props.storage ?? AsyncStorage,
    eventSourceFactory: props.eventSourceFactory ?? defaultEventSourceFactory,
    enableLiveFlagUpdates: props.enableLiveFlagUpdates ?? true,
    toolbar: props.toolbar ?? false,
    feedback: {
      ...props.feedback,
      enableAutoFeedback: props.feedback?.enableAutoFeedback ?? false,
    },
  };
}

export function ReflagProvider(props: ReflagProps) {
  return <BaseProvider {...props} {...nativeOptions(props)} />;
}

export function ReflagBootstrappedProvider(props: ReflagBootstrappedProps) {
  return <BaseBootstrappedProvider {...props} {...nativeOptions(props)} />;
}
