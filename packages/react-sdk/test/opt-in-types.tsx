import { useOptInFlags, useSetOptIn } from "@reflag/react-sdk";

declare module "@reflag/react-sdk" {
  interface Flags {
    "generated-opt-in-flag": {};
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

  return null;
}
