import {
  ReflagBootstrappedProvider,
  ReflagProvider,
  useFeature,
  useFlag,
  useFlagSuspense,
  useOptInFlags,
  useSetOptIn,
  useTrack,
  type BootstrappedFlags,
  type FlagDefaultValue,
  type FlagValue,
  type FlagValueFromDefault,
  type UseOptInFlagsOptions,
  type UseOptInFlagsResult,
} from "@reflag/react-native-sdk";

interface Settings {
  model: string;
  limits: readonly number[];
}
const settings: Settings = { model: "quick", limits: [2, 5] };
const state: BootstrappedFlags = {
  protocolVersion: 2,
  context: { user: { id: "native-user" } },
  flags: {},
  flagStateVersion: 1,
};

export function NativeContracts() {
  const enabled: boolean = useFlag("release");
  const _undefinedDefault: boolean = useFlag("release", undefined);
  const _legacyAlias: boolean = useFeature("release");
  const _suspended: boolean = useFlagSuspense("release");
  const _direct: Settings = useFlag("settings", settings);
  const _ready: Settings = useFlagSuspense("settings", settings);
  const _arbitrary: FlagValue = useFlag("settings", null);
  const _widened: string = useFlag("model", "quick");
  const defaultValue: FlagDefaultValue = { enabled: false, limits: [1] };
  const _inferred: FlagValueFromDefault<typeof defaultValue> = useFlag(
    "settings",
    defaultValue,
  );
  const mutable = useFlag("settings", {
    model: "quick",
    limits: [2, 5],
  } as const);
  mutable.model = "quality";
  mutable.limits.push(10);
  const options: UseOptInFlagsOptions = { suspense: false };
  const optIn: UseOptInFlagsResult = useOptInFlags(options);
  const setOptIn = useSetOptIn();
  for (const flag of optIn.flags)
    void setOptIn(flag.key, { optedIn: !flag.userOptedIn });
  const track = useTrack();
  void track("Used native flag", { screen: "home" });
  // @ts-expect-error Direct-value reads do not expose v1 wrappers.
  void enabled.isEnabled;
  // @ts-expect-error Usage is separate from reads.
  useFlag("release").track();
  // @ts-expect-error Legacy remote config does not survive the migration.
  void useFlag("settings").config;
  // @ts-expect-error A v1 bootstrap envelope cannot be passed to the native provider.
  const _legacy: BootstrappedFlags = { context: {}, flags: {} };
  return (
    <ReflagBootstrappedProvider publishableKey="synthetic" flags={state} />
  );
}

export const NativeOffline = (
  <ReflagProvider
    publishableKey="synthetic"
    offline
    fallbackFlags={{ release: true, settings: { model: "quick" } }}
  />
);
// Boolean string-array shorthand remains supported by the shared v2 client.
export const BooleanOffline = (
  <ReflagProvider publishableKey="synthetic" fallbackFlags={["release"]} />
);
