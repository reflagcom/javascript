import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";
import ReactNativeEventSource from "react-native-sse";

import type {
  BootstrappedFlags,
  CheckEvent,
  CompanyContext,
  EmptyFlagRemoteConfig,
  Flag,
  FlagKey,
  FlagRemoteConfig,
  Flags,
  FlagType,
  RawFlags,
  ReflagBootstrappedProps,
  ReflagClientProviderProps,
  ReflagInitOptionsBase,
  ReflagProps,
  ReflagPropsBase,
  RequestFeedbackOptions,
  StorageAdapter,
  TrackEvent,
  TypedFlags,
  UserContext,
} from "@reflag/react-sdk";
import {
  ReflagBootstrappedProvider as BaseBootstrappedProvider,
  ReflagClientProvider,
  ReflagProvider as BaseProvider,
  useClient,
  useFeature,
  useFlag,
  useIsLoading,
  useOnEvent,
  useRequestFeedback,
  useSendFeedback,
  useTrack,
  useUpdateCompany,
  useUpdateOtherContext,
  useUpdateUser,
} from "@reflag/react-sdk";

import { version } from "../package.json";

const SDK_VERSION = `react-native-sdk/${version}`;

const defaultEventSourceFactory = (url: string) =>
  new ReactNativeEventSource(url, {
    pollingInterval: 0,
  }) as any;

export {
  ReflagClientProvider,
  useClient,
  useFeature,
  useFlag,
  useIsLoading,
  useOnEvent,
  useRequestFeedback,
  useSendFeedback,
  useTrack,
  useUpdateCompany,
  useUpdateOtherContext,
  useUpdateUser,
};
export type {
  BootstrappedFlags,
  CheckEvent,
  CompanyContext,
  EmptyFlagRemoteConfig,
  Flag,
  FlagKey,
  FlagRemoteConfig,
  Flags,
  FlagType,
  RawFlags,
  ReflagBootstrappedProps,
  ReflagClientProviderProps,
  ReflagInitOptionsBase,
  ReflagProps,
  ReflagPropsBase,
  RequestFeedbackOptions,
  StorageAdapter,
  TrackEvent,
  TypedFlags,
  UserContext,
};

export function ReflagProvider(props: ReflagProps) {
  return (
    <BaseProvider
      {...props}
      sdkVersion={SDK_VERSION}
      storage={props.storage ?? AsyncStorage}
      eventSourceFactory={props.eventSourceFactory ?? defaultEventSourceFactory}
      enableLiveFlagUpdates={props.enableLiveFlagUpdates ?? true}
      feedback={{
        ...props.feedback,
        enableAutoFeedback: props.feedback?.enableAutoFeedback ?? false,
      }}
    />
  );
}

export function ReflagBootstrappedProvider(props: ReflagBootstrappedProps) {
  return (
    <BaseBootstrappedProvider
      {...props}
      sdkVersion={SDK_VERSION}
      storage={props.storage ?? AsyncStorage}
      eventSourceFactory={props.eventSourceFactory ?? defaultEventSourceFactory}
      enableLiveFlagUpdates={props.enableLiveFlagUpdates ?? true}
      feedback={{
        ...props.feedback,
        enableAutoFeedback: props.feedback?.enableAutoFeedback ?? false,
      }}
    />
  );
}
