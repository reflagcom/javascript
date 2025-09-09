import { MiddlewareData, Placement } from "@floating-ui/dom";
import { Fragment, FunctionComponent, h, Ref } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import {
  arrow,
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "./packages/floating-ui-preact-dom";
import styles from "./Dialog.css?inline";
import { Position } from "./types";
import { parseUnanchoredPosition } from "./utils";

type CssPosition = Partial<
  Record<"top" | "left" | "right" | "bottom", number | string>
>;

export interface OpenDialogOptions {
  /**
   * Control the placement and behavior of the dialog.
   */
  position: Position;

  strategy?: "fixed" | "absolute";

  isOpen: boolean;
  close: () => void;
  onDismiss?: () => void;

  containerId: string;

  showArrow?: boolean;

  children?: preact.ComponentChildren;
}

export function useDialog({
  onClose,
  onOpen,
  initialValue = false,
}: {
  onClose?: () => void;
  onOpen?: () => void;
  initialValue?: boolean;
} = {}) {
  const [isOpen, setIsOpen] = useState<boolean>(initialValue);

  const open = useCallback(() => {
    setIsOpen(true);
    onOpen?.();
  }, [onOpen]);
  const close = useCallback(() => {
    setIsOpen(false);
    onClose?.();
  }, [onClose]);
  const toggle = useCallback(() => {
    if (isOpen) onClose?.();
    else onOpen?.();
    setIsOpen((prev) => !prev);
  }, [isOpen, onClose, onOpen]);

  return {
    isOpen,
    open,
    close,
    toggle,
  };
}

export const Dialog: FunctionComponent<OpenDialogOptions> = ({
  position,
  isOpen,
  close,
  onDismiss,
  containerId,
  strategy,
  children,
  showArrow = true,
}) => {
  const arrowRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const anchor = position.type === "POPOVER" ? position.anchor : null;
  const placement =
    position.type === "POPOVER" ? position.placement : undefined;

  const {
    refs,
    floatingStyles,
    middlewareData,
    placement: actualPlacement,
  } = useFloating({
    elements: {
      reference: anchor,
    },
    strategy,
    transform: false,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      flip({
        padding: 10,
        mainAxis: true,
        crossAxis: true,
      }),
      shift(),
      offset(8),
      arrow({
        element: arrowRef,
      }),
    ],
  });

  let unanchoredPosition: CssPosition = {};
  if (position.type === "DIALOG") {
    unanchoredPosition = parseUnanchoredPosition(position);
  }

  const dismiss = useCallback(() => {
    close();
    onDismiss?.();
  }, [close, onDismiss]);

  useEffect(() => {
    // Only enable 'quick dismiss' for popovers
    if (position.type === "MODAL" || position.type === "DIALOG") return;

    const escapeHandler = (e: KeyboardEvent) => {
      if (e.key == "Escape") {
        dismiss();
      }
    };

    const clickOutsideHandler = (e: MouseEvent) => {
      if (
        !(e.target instanceof Element) ||
        !e.target.closest(`#${containerId}`)
      ) {
        dismiss();
      }
    };

    const observer = new MutationObserver((mutations) => {
      if (position.anchor === null) return;

      mutations.forEach((mutation) => {
        const removedNodes = Array.from(mutation.removedNodes);
        const hasBeenRemoved = removedNodes.some((node) => {
          return node === position.anchor || node.contains(position.anchor);
        });

        if (hasBeenRemoved) {
          close();
        }
      });
    });

    window.addEventListener("mousedown", clickOutsideHandler);
    window.addEventListener("keydown", escapeHandler);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
    });

    return () => {
      window.removeEventListener("mousedown", clickOutsideHandler);
      window.removeEventListener("keydown", escapeHandler);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- anchor only exists in popover
  }, [position.type, close, (position as any).anchor, dismiss, containerId]);

  function setDiagRef(node: HTMLDialogElement | null) {
    refs.setFloating(node);
    dialogRef.current = node;
  }

  useEffect(() => {
    if (!dialogRef.current) return;
    if (isOpen && !dialogRef.current.hasAttribute("open")) {
      dialogRef.current[position.type === "MODAL" ? "showModal" : "show"]();
    }
    if (!isOpen && dialogRef.current.hasAttribute("open")) {
      dialogRef.current.close();
    }
  }, [dialogRef, isOpen, position.type]);

  const classes = [
    "dialog",
    position.type === "MODAL"
      ? "modal"
      : position.type === "POPOVER"
        ? "anchored"
        : `unanchored unanchored-${position.placement}`,
    actualPlacement,
  ].join(" ");

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <dialog
        ref={setDiagRef}
        class={classes}
        style={anchor ? floatingStyles : unanchoredPosition}
      >
        {children && <Fragment>{children}</Fragment>}

        {anchor && showArrow && (
          <DialogArrow
            arrowData={middlewareData?.arrow}
            arrowRef={arrowRef}
            placement={actualPlacement}
          />
        )}
      </dialog>
    </>
  );
};

function DialogArrow({
  arrowData,
  arrowRef,
  placement,
}: {
  arrowData: MiddlewareData["arrow"];
  arrowRef: Ref<HTMLDivElement>;
  placement: Placement;
}) {
  const { x: arrowX, y: arrowY } = arrowData ?? {};

  const staticSide =
    {
      top: "bottom",
      right: "left",
      bottom: "top",
      left: "right",
    }[placement.split("-")[0]] || "bottom";

  const arrowStyles = {
    left: arrowX != null ? `${arrowX}px` : "",
    top: arrowY != null ? `${arrowY}px` : "",
    right: "",
    bottom: "",
    [staticSide]: "-4px",
  };
  return (
    <div
      ref={arrowRef}
      class={["arrow", placement].join(" ")}
      style={arrowStyles}
    />
  );
}

export function DialogHeader({
  children,
  innerRef,
}: {
  children: preact.ComponentChildren;
  innerRef?: Ref<HTMLElement>;
}) {
  return (
    <header ref={innerRef} class="dialog-header">
      {children}
    </header>
  );
}

export function DialogContent({
  children,
  innerRef,
}: {
  children: preact.ComponentChildren;
  innerRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div ref={innerRef} class="dialog-content">
      {children}
    </div>
  );
}
