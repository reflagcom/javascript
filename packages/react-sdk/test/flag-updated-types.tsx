import { FlagUpdatedEvent, useClient, useOnEvent } from "@reflag/react-sdk";

export function FlagUpdatedTypes() {
  const client = useClient();

  useOnEvent("flagUpdated", (update) => {
    const event: FlagUpdatedEvent = update;
    const key: string = event.key;
    void key;

    if (event.flag) {
      const enabled: boolean = event.flag.isEnabled;
      const configKey: string | undefined = event.flag.config?.key;
      void [enabled, configKey];
    }

    // @ts-expect-error removed flags must be handled before reading their values
    void event.flag.isEnabled;
  });

  // @ts-expect-error the unused public getter is not part of the API
  void client.getFlagValues();
  // @ts-expect-error the new event is per flag, not a value snapshot event
  useOnEvent("flagValuesUpdated", () => undefined);

  return null;
}
