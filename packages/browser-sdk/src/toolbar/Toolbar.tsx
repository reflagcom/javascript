import { h } from "preact";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";

import { ReflagClient } from "../client";
import { toolbarContainerId } from "../ui/constants";
import { Dialog, DialogContent, DialogHeader, useDialog } from "../ui/Dialog";
import { Logo } from "../ui/icons/Logo";
import { ToolbarPosition } from "../ui/types";
import { parseUnanchoredPosition } from "../ui/utils";

import { FlagSearch, FlagsTable } from "./Flags";
import styles from "./index.css?inline";

export type FlagItem = {
  flagKey: string;
  localOverride: boolean | null;
  isEnabled: boolean;
};

type Flag = {
  flagKey: string;
  isEnabled: boolean;
  localOverride: boolean | null;
};

export default function Toolbar({
  reflagClient,
  position,
}: {
  reflagClient: ReflagClient;
  position: ToolbarPosition;
}) {
  const toggleToolbarRef = useRef<HTMLDivElement>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const [flags, setFlags] = useState<Flag[]>([]);

  const updateFlags = useCallback(() => {
    const rawFlags = reflagClient.getFlags();
    setFlags(
      Object.values(rawFlags)
        .filter((f) => f !== undefined)
        .map(
          (flag) =>
            ({
              flagKey: flag.key,
              localOverride: flag.isEnabledOverride,
              isEnabled: flag.isEnabled,
            }) satisfies FlagItem,
        ),
    );
  }, [reflagClient]);

  const hasAnyOverrides = useMemo(() => {
    return flags.some((f) => f.localOverride !== null);
  }, [flags]);

  useEffect(() => {
    updateFlags();
    reflagClient.on("flagsUpdated", updateFlags);
  }, [reflagClient, updateFlags]);

  const [search, setSearch] = useState<string | null>(null);
  const onSearch = (val: string) => {
    setSearch(val === "" ? null : val);
    dialogContentRef.current?.scrollTo({ top: 0 });
  };

  const sortedFlags = [...flags].sort((a, b) =>
    a.flagKey.localeCompare(b.flagKey),
  );

  const appBaseUrl = reflagClient.getConfig().appBaseUrl;

  const { isOpen, close, toggle } = useDialog();

  return (
    <div class="toolbar">
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <ToolbarToggle
        hasAnyOverrides={hasAnyOverrides}
        innerRef={toggleToolbarRef}
        isOpen={isOpen}
        position={position}
        onClick={toggle}
      />
      <Dialog
        close={close}
        containerId={toolbarContainerId}
        isOpen={isOpen}
        position={{
          type: "POPOVER",
          anchor: toggleToolbarRef.current,
          placement: "top-start",
        }}
        showArrow={false}
        strategy="fixed"
      >
        <DialogHeader>
          <FlagSearch onSearch={onSearch} />
        </DialogHeader>
        <DialogContent innerRef={dialogContentRef}>
          <FlagsTable
            appBaseUrl={appBaseUrl}
            flags={sortedFlags}
            isOpen={isOpen}
            searchQuery={search}
            setIsEnabledOverride={(flagKey, isEnabled) =>
              reflagClient.getFlag(flagKey).setIsEnabledOverride(isEnabled)
            }
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToolbarToggle({
  isOpen,
  position,
  onClick,
  innerRef,
  hasAnyOverrides,
}: {
  isOpen: boolean;
  position: ToolbarPosition;
  onClick: () => void;
  innerRef: React.RefObject<HTMLDivElement>;
  hasAnyOverrides: boolean;
  children?: preact.VNode;
}) {
  const offsets = parseUnanchoredPosition(position);

  const toggleClasses = ["toolbar-toggle", isOpen ? "open" : undefined].join(
    " ",
  );

  const indicatorClasses = [
    "override-indicator",
    hasAnyOverrides ? "show" : undefined,
  ].join(" ");

  return (
    <div ref={innerRef} class={toggleClasses} style={offsets} onClick={onClick}>
      <div class={indicatorClasses} />
      <Logo height="13px" width="13px" />
    </div>
  );
}
