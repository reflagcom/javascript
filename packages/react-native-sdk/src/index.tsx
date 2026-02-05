import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
      storage={props.storage ?? AsyncStorage}
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
      storage={props.storage ?? AsyncStorage}
      feedback={{
        ...props.feedback,
        enableAutoFeedback: props.feedback?.enableAutoFeedback ?? false,
      }}
    />
  );
}
