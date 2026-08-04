import { useOptInFlags, useSetOptIn } from "@reflag/vue-sdk";

declare module "@reflag/vue-sdk" {
  interface Flags {
    "generated-opt-in-flag": {};
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

  return loading;
}
