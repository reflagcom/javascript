import { propagatedEvents } from "./constants";
import { Offset } from "./types";

function stopPropagation(e: Event) {
  e.stopPropagation();
}

export function attachContainer(containerId: string) {
  let container = document.querySelector(`#${containerId}`);

  if (!container) {
    container = document.createElement("div");
    container.attachShadow({ mode: "open" });
    (container as HTMLElement).style.all = "initial";
    container.id = containerId;
    document.body.appendChild(container);

    for (const event of propagatedEvents) {
      container.addEventListener(event, stopPropagation, { passive: true });
    }
  }

  return container.shadowRoot!;
}

function parseOffset(offsetInput?: Offset["x"] | Offset["y"]) {
  if (offsetInput === undefined) return "1rem";
  if (typeof offsetInput === "number") return offsetInput + "px";

  return offsetInput;
}

export function parseUnanchoredPosition(position: {
  offset?: Offset;
  placement: string;
}) {
  const offsetY = parseOffset(position.offset?.y);
  const offsetX = parseOffset(position.offset?.x);

  switch (position.placement) {
    case "top-left":
      return {
        top: offsetY,
        left: offsetX,
      };
    case "top-right":
      return {
        top: offsetY,
        right: offsetX,
      };
    case "bottom-left":
      return {
        bottom: offsetY,
        left: offsetX,
      };
    case "bottom-right":
      return {
        bottom: offsetY,
        right: offsetX,
      };
    default:
      console.error("[Reflag]", "Invalid placement", position.placement);
      return parseUnanchoredPosition({ placement: "bottom-right" });
  }
}
