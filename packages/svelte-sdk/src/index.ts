// Re-export types from browser-sdk
export type {
  CheckEvent,
  CompanyContext,
  TrackEvent,
  UserContext,
} from "@reflag/browser-sdk";

// Export our types
export type {
  EmptyFlagRemoteConfig,
  Flag,
  FlagType,
  FlagRemoteConfig,
  TypedFlags,
  FlagKey,
  ReflagProps,
  RequestFlagFeedbackOptions,
} from "./types";

// Export provider functionality
export { createReflagProvider, getReflagContext } from "./provider";

// Export all stores and utilities
export {
  useFlag,
  useFeature, // deprecated
  useTrack,
  useRequestFeedback,
  useSendFeedback,
  useUpdateUser,
  useUpdateCompany,
  useUpdateOtherContext,
  useClient,
  useIsLoading,
} from "./stores";

// Export version
export { SDK_VERSION } from "./version";