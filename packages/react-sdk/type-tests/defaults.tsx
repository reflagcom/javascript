import { FlagValue, useFlag, useFlagSuspense } from "@reflag/react-sdk";

export function DefaultContracts() {
  const _enabled: boolean = useFlag("release");
  const settings = useFlag("settings", {
    model: "quick",
    limits: [1],
  } as const);
  settings.model = "quality";
  settings.limits.push(2);
  const _count: number = useFlag("limit", 1);
  const _model: string = useFlagSuspense("model", "quick");
  const _arbitrary: FlagValue = useFlagSuspense("nullable", null);
  const _ordinaryPayload: { suspense: boolean } = useFlag("payload", {
    suspense: true,
  });
  // @ts-expect-error bare reads return Boolean rather than legacy wrappers
  const { isEnabled: _isEnabled } = useFlag("release");
  const release = useFlag("release");
  // @ts-expect-error assigned reads cannot use legacy wrapper fields either
  void release.isEnabled;
  // @ts-expect-error JSON defaults cannot contain undefined
  useFlag("settings", { invalid: undefined });
  // @ts-expect-error literals widen
  const _literal: "quick" = useFlag("model", "quick");
  return null;
}
