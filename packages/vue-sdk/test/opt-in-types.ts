import { useFlag, useOptInFlags, useSetOptIn } from "@reflag/vue-sdk";

declare module "@reflag/vue-sdk" {
  interface Flags {
    "generated-opt-in-flag": boolean;
    legacy: { isEnabled: boolean; config: { payload: string } };
  }
}

export function GeneratedOptInTypes() {
  const { flags, isLoading } = useOptInFlags();
  const setOptIn = useSetOptIn();

  for (const flag of flags.value) {
    void setOptIn(flag.key, { optedIn: !flag.userOptedIn });
  }

  const loading: boolean = isLoading.value;

  // @ts-expect-error generated flag types still reject unknown literal keys
  void setOptIn("unknown-flag", { optedIn: true });

  const enabled: boolean = useFlag("generated-opt-in-flag").value;
  // @ts-expect-error old registered wrappers cannot change the Boolean contract
  void useFlag("legacy").value.isEnabled;
  // @ts-expect-error registration still constrains singular keys
  useFlag("unknown-flag");
  return loading || enabled;
}
