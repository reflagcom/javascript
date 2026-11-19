import {
  useFlag,
  useFlagSuspense,
  useOptInFlags,
  useSetOptIn,
  type FlagKey,
  type Flags as NativeFlags,
  type FlagValue,
  type TypedFlags,
} from "@reflag/react-native-sdk";

interface Settings {
  model: "quick" | "quality";
  prompt: { tone: string };
  methods: string[];
}

// Native reexports React's hooks and registry, including CLI --format react declarations.
declare module "@reflag/react-sdk" {
  interface Flags {
    release: boolean;
    settings: Settings;
    arbitrary: FlagValue;
    methods: string[];
    count: number;
  }
}

export function RegisteredNativeContracts() {
  const key: FlagKey = "release";
  const _registered: NativeFlags["release"] = useFlag(key);
  const _collection: TypedFlags = {
    release: true,
    settings: undefined,
    arbitrary: null,
    methods: [],
    count: 0,
  };
  const fallback: Settings = {
    model: "quick",
    prompt: { tone: "concise" },
    methods: ["standard"],
  };
  const _settings: Omit<Settings, "model"> & { model: string } = useFlag(
    "settings",
    fallback,
  );
  const _ready: Omit<Settings, "model"> & { model: string } = useFlagSuspense(
    "settings",
    fallback,
  );
  const _booleanFirst: boolean = useFlag("settings");
  const _arbitrary: FlagValue = useFlag("settings", null);
  const mutable = useFlag("settings", {
    model: "quick",
    prompt: { tone: "concise" },
    methods: ["standard"],
  } as const);
  mutable.model = "quality";
  mutable.prompt.tone = "detailed";
  mutable.methods.push("express");
  const setOptIn = useSetOptIn();
  for (const flag of useOptInFlags().flags)
    void setOptIn(flag.key, { optedIn: !flag.userOptedIn });
  // @ts-expect-error Registered keys constrain native reads.
  useFlag("unknown");
  // @ts-expect-error Another numeric flag must not permit a wrong-category default.
  useFlag("settings", 123);
  // @ts-expect-error Registered required properties cannot be omitted.
  useFlag("settings", { model: "quick" });
  // @ts-expect-error Nested field types are checked for defaults.
  useFlag("settings", { model: "quick", prompt: { tone: 3 }, methods: [] });
  // @ts-expect-error Registered arrays constrain element types.
  useFlag("methods", [123]);
  // @ts-expect-error Suspense reads retain schema checks.
  useFlagSuspense("settings", false);
  // @ts-expect-error Explicit generics cannot bypass registered keys/schemas.
  useFlag<number>("settings", 123);
  // @ts-expect-error Opt-in keys use the same registry.
  void setOptIn("unknown", { optedIn: true });
  return null;
}
