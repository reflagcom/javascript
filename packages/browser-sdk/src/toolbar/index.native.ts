import { ReflagClient } from "../client";
import { ToolbarPosition } from "../ui/types";

type ShowToolbarToggleOptions = {
  reflagClient: ReflagClient;
  position?: ToolbarPosition;
};

export const DEFAULT_PLACEMENT = "bottom-right" as const;

export function showToolbarToggle(_options: ShowToolbarToggleOptions) {
  // React Native doesn't support the Reflag toolbar UI.
  console.warn("[Reflag] Toolbar UI is not supported in React Native.");
}
