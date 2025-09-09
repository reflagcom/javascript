import { h, render } from "preact";

import { ReflagClient } from "../client";
import { toolbarContainerId } from "../ui/constants";
import { ToolbarPosition } from "../ui/types";
import { attachContainer } from "../ui/utils";

import Toolbar from "./Toolbar";

type showToolbarToggleOptions = {
  reflagClient: ReflagClient;
  position?: ToolbarPosition;
};

export const DEFAULT_PLACEMENT = "bottom-right" as const;

export function showToolbarToggle(options: showToolbarToggleOptions) {
  const shadowRoot = attachContainer(toolbarContainerId);
  const position: ToolbarPosition = options.position ?? {
    placement: DEFAULT_PLACEMENT,
  };

  render(h(Toolbar, { ...options, position }), shadowRoot);
}
