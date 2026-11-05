import type { ShallowRef } from "vue";

import { FlagValue, useFlag } from "@reflag/vue-sdk";

interface Prompt {
  tone: string;
}
interface Settings {
  model: "quick" | "quality";
  prompt: Prompt;
  methods: string[];
}

declare module "@reflag/vue-sdk" {
  interface Flags {
    enabled: boolean;
    settings: Settings;
    days: number;
    arbitrary: FlagValue;
    unknownArray: FlagValue[];
    methods: string[];
    model: "quick" | "quality";
    nullable: Settings | null;
  }
}

export function RegisteredContracts() {
  const fallback: Settings = {
    model: "quick",
    prompt: { tone: "concise" },
    methods: ["standard"],
  };
  const _settings = useFlag("settings", fallback);
  const _arbitraryShape = useFlag("arbitrary", fallback);
  const _unknownArray = useFlag("unknownArray", [fallback]);
  const mutable = useFlag("settings", {
    model: "quick",
    prompt: { tone: "concise" },
    methods: ["standard"],
  } as const);
  mutable.value.model = "quality";
  mutable.value.prompt.tone = "detailed";
  mutable.value.methods.push("express");
  const _bare: ShallowRef<boolean> = useFlag("settings");
  const _model: ShallowRef<string> = useFlag("model", "quick");
  const _array: ShallowRef<string[]> = useFlag("methods", [
    "standard",
  ] as const);
  const _arbitrary: ShallowRef<FlagValue> = useFlag("settings", null);
  const _nullable: ShallowRef<FlagValue> = useFlag("nullable", null);
  // @ts-expect-error Registered keys reject unknown names.
  useFlag("unknown", false);
  // @ts-expect-error A numeric flag elsewhere in the registry must not permit this mismatch.
  useFlag("settings", 123);
  // @ts-expect-error Required fields must be present.
  useFlag("settings", { model: "quick" });
  // @ts-expect-error Nested property types must match.
  useFlag("settings", { model: "quick", prompt: { tone: 3 }, methods: [] });
  // @ts-expect-error Registered literal unions constrain defaults.
  useFlag("model", "unknown");
  // @ts-expect-error Array elements must match.
  useFlag("methods", [123]);
  // @ts-expect-error An explicit generic must not bypass the key's registered schema.
  useFlag<number>("settings", 123);
}
