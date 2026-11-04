import {
  useFlag,
  useFlagSuspense,
  useOptInFlags,
  useSetOptIn,
} from "@reflag/react-sdk";

declare module "@reflag/react-sdk" {
  interface Flags {
    "generated-opt-in-flag": boolean;
    legacy: { isEnabled: boolean; config: { payload: string } };
  }
}

export function GeneratedOptInTypes() {
  const { flags } = useOptInFlags();
  const setOptIn = useSetOptIn();

  for (const flag of flags) {
    void setOptIn(flag.key, { optedIn: !flag.userOptedIn });
  }

  // @ts-expect-error generated flag types still reject unknown literal keys
  void setOptIn("unknown-flag", { optedIn: true });

  const enabled: boolean = useFlag("generated-opt-in-flag");
  const suspended: boolean = useFlagSuspense("legacy");
  // @ts-expect-error registered legacy declarations cannot restore wrapper semantics
  void useFlag("legacy").isEnabled;
  // @ts-expect-error registration still constrains singular keys
  useFlag("unknown-flag");
  return enabled && suspended;
}
