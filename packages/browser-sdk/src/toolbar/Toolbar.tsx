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

const TOOLBAR_HIDE_KEY = "reflag-toolbar-hidden";

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

  const wasHidden =
    window?.sessionStorage?.getItem(TOOLBAR_HIDE_KEY) === "true";
  const [isHidden, setIsHidden] = useState(wasHidden);

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

  const hideToolbar = useCallback(() => {
    window?.sessionStorage?.setItem(TOOLBAR_HIDE_KEY, "true");
    setIsHidden(true);
    close();
  }, [close]);

  if (isHidden) {
    return null;
  }

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
          <a
            class="toolbar-header-button"
            data-tooltip="Open Reflag app"
            href={`${appBaseUrl}/env-current`}
          >
            <svg
              width="15"
              height="15"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM9.71002 19.6674C8.74743 17.6259 8.15732 15.3742 8.02731 13H4.06189C4.458 16.1765 6.71639 18.7747 9.71002 19.6674ZM10.0307 13C10.1811 15.4388 10.8778 17.7297 12 19.752C13.1222 17.7297 13.8189 15.4388 13.9693 13H10.0307ZM19.9381 13H15.9727C15.8427 15.3742 15.2526 17.6259 14.29 19.6674C17.2836 18.7747 19.542 16.1765 19.9381 13ZM4.06189 11H8.02731C8.15732 8.62577 8.74743 6.37407 9.71002 4.33256C6.71639 5.22533 4.458 7.8235 4.06189 11ZM10.0307 11H13.9693C13.8189 8.56122 13.1222 6.27025 12 4.24799C10.8778 6.27025 10.1811 8.56122 10.0307 11ZM14.29 4.33256C15.2526 6.37407 15.8427 8.62577 15.9727 11H19.9381C19.542 7.8235 17.2836 5.22533 14.29 4.33256Z" />
            </svg>
          </a>
          <button
            class="toolbar-header-button"
            onClick={hideToolbar}
            data-tooltip="Hide toolbar this session"
          >
            <svg
              width="15"
              height="15"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M17.8827 19.2968C16.1814 20.3755 14.1638 21.0002 12.0003 21.0002C6.60812 21.0002 2.12215 17.1204 1.18164 12.0002C1.61832 9.62282 2.81932 7.5129 4.52047 5.93457L1.39366 2.80777L2.80788 1.39355L22.6069 21.1925L21.1927 22.6068L17.8827 19.2968ZM5.9356 7.3497C4.60673 8.56015 3.6378 10.1672 3.22278 12.0002C4.14022 16.0521 7.7646 19.0002 12.0003 19.0002C13.5997 19.0002 15.112 18.5798 16.4243 17.8384L14.396 15.8101C13.7023 16.2472 12.8808 16.5002 12.0003 16.5002C9.51498 16.5002 7.50026 14.4854 7.50026 12.0002C7.50026 11.1196 7.75317 10.2981 8.19031 9.60442L5.9356 7.3497ZM12.9139 14.328L9.67246 11.0866C9.5613 11.3696 9.50026 11.6777 9.50026 12.0002C9.50026 13.3809 10.6196 14.5002 12.0003 14.5002C12.3227 14.5002 12.6309 14.4391 12.9139 14.328ZM20.8068 16.5925L19.376 15.1617C20.0319 14.2268 20.5154 13.1586 20.7777 12.0002C19.8603 7.94818 16.2359 5.00016 12.0003 5.00016C11.1544 5.00016 10.3329 5.11773 9.55249 5.33818L7.97446 3.76015C9.22127 3.26959 10.5793 3.00016 12.0003 3.00016C17.3924 3.00016 21.8784 6.87992 22.8189 12.0002C22.5067 13.6998 21.8038 15.2628 20.8068 16.5925ZM11.7229 7.50857C11.8146 7.50299 11.9071 7.50016 12.0003 7.50016C14.4855 7.50016 16.5003 9.51488 16.5003 12.0002C16.5003 12.0933 16.4974 12.1858 16.4919 12.2775L11.7229 7.50857Z" />
            </svg>
          </button>
        </DialogHeader>
        <DialogContent innerRef={dialogContentRef}>
          <FlagsTable
            appBaseUrl={appBaseUrl}
            flags={sortedFlags}
            searchQuery={search?.toLocaleLowerCase() ?? null}
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
