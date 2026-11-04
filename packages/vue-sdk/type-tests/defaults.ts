import type { ShallowRef } from "vue";

import { FlagValue, useFlag } from "@reflag/vue-sdk";

export function DefaultContracts() {
  const enabled: ShallowRef<boolean> = useFlag("release");
  const settings = useFlag("settings", {
    model: "quick",
    limits: [1],
  } as const);
  settings.value.model = "quality";
  settings.value.limits.push(2);
  const _model: ShallowRef<string> = useFlag("model", "quick");
  const _arbitrary: ShallowRef<FlagValue> = useFlag("nullable", null);
  // @ts-expect-error legacy wrappers are no longer returned
  const { isEnabled: _isEnabled } = useFlag("release");
  // @ts-expect-error Boolean refs do not contain legacy wrapper fields
  void enabled.value.isEnabled;
  // @ts-expect-error JSON defaults cannot contain undefined
  useFlag("settings", { invalid: undefined });
  // @ts-expect-error literal defaults widen
  const _literal: ShallowRef<"quick"> = useFlag("model", "quick");
}
