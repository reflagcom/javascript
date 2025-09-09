import { h } from "preact";
import { useEffect, useState } from "preact/hooks";

import { Switch } from "./Switch";
import { FlagItem } from "./Toolbar";

export function FlagsTable({
  flags,
  searchQuery,
  appBaseUrl,
  isOpen,
  setIsEnabledOverride,
}: {
  flags: FlagItem[];
  searchQuery: string | null;
  appBaseUrl: string;
  isOpen: boolean;
  setIsEnabledOverride: (key: string, isEnabled: boolean | null) => void;
}) {
  const hasFlags = flags.length > 0;
  const hasShownFlags = flags.some((flag) =>
    flag.flagKey
      .toLocaleLowerCase()
      .includes(searchQuery?.toLocaleLowerCase() ?? ""),
  );

  // List flags that match the search query first then alphabetically
  const searchedFlags =
    searchQuery === null
      ? flags
      : [...flags].sort((a, b) => {
          const aMatches = a.flagKey.includes(searchQuery);
          const bMatches = b.flagKey.includes(searchQuery);

          // If both match or both don't match, sort alphabetically
          if (aMatches === bMatches) {
            return a.flagKey.localeCompare(b.flagKey);
          }

          // Otherwise, matching flags come first
          return aMatches ? -1 : 1;
        });

  return (
    <table class="flags-table" style={{ "--n": searchedFlags.length }}>
      <tbody>
        {(!hasFlags || !hasShownFlags) && (
          <tr>
            <td class="flag-empty-cell" colSpan={3}>
              No flags {!hasShownFlags ? `matching "${searchQuery} "` : ""}
              found
            </td>
          </tr>
        )}
        {searchedFlags.map((flag, index) => (
          <FlagRow
            key={flag.flagKey}
            appBaseUrl={appBaseUrl}
            flag={flag}
            index={index}
            isNotVisible={
              searchQuery !== null &&
              !flag.flagKey
                .toLocaleLowerCase()
                .includes(searchQuery.toLocaleLowerCase())
            }
            isOpen={isOpen}
            setEnabledOverride={(override) =>
              setIsEnabledOverride(flag.flagKey, override)
            }
          />
        ))}
      </tbody>
    </table>
  );
}

function FlagRow({
  setEnabledOverride,
  appBaseUrl,
  flag,
  isOpen,
  index,
  isNotVisible,
}: {
  flag: FlagItem;
  appBaseUrl: string;
  setEnabledOverride: (isEnabled: boolean | null) => void;
  isOpen: boolean;
  index: number;
  isNotVisible: boolean;
}) {
  const [showOnOpen, setShowOnOpen] = useState(isOpen);
  useEffect(() => {
    setShowOnOpen(isOpen);
  }, [isOpen]);
  return (
    <tr
      key={flag.flagKey}
      class={[
        "flag-row",
        showOnOpen ? "show-on-open" : undefined,
        isNotVisible ? "not-visible" : undefined,
      ].join(" ")}
      style={{ "--i": index }}
    >
      <td class="flag-name-cell">
        <a
          class="flag-link"
          href={`${appBaseUrl}/env-current/flags/by-key/${flag.flagKey}`}
          rel="noreferrer"
          tabIndex={index + 1}
          target="_blank"
        >
          {flag.flagKey}
        </a>
      </td>
      <td class="flag-reset-cell">
        {flag.localOverride !== null ? (
          <Reset setEnabledOverride={setEnabledOverride} tabIndex={index + 1} />
        ) : null}
      </td>
      <td class="flag-switch-cell">
        <Switch
          checked={flag.localOverride ?? flag.isEnabled}
          tabIndex={index + 1}
          onChange={(e) => {
            const isChecked = e.currentTarget.checked;
            const isOverridden = isChecked !== flag.isEnabled;
            setEnabledOverride(isOverridden ? isChecked : null);
          }}
        />
      </td>
    </tr>
  );
}

export function FlagSearch({ onSearch }: { onSearch: (val: string) => void }) {
  return (
    <input
      class="search-input"
      placeholder="Search flags"
      tabIndex={0}
      type="search"
      autoFocus
      onInput={(s) => onSearch(s.currentTarget.value)}
    />
  );
}

function Reset({
  setEnabledOverride,
  ...props
}: {
  setEnabledOverride: (isEnabled: boolean | null) => void;
} & h.JSX.HTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      class="reset"
      href=""
      onClick={(e) => {
        e.preventDefault();
        setEnabledOverride(null);
      }}
      {...props}
    >
      reset
    </a>
  );
}
