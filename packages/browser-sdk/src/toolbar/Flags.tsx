import { Fragment, h } from "preact";

import { Switch } from "./Switch";
import { FlagItem } from "./Toolbar";

const isFound = (flagKey: string, searchQuery: string | null) => {
  return flagKey.toLocaleLowerCase().includes(searchQuery ?? "");
};

export function FlagsTable({
  flags,
  searchQuery,
  appBaseUrl,
  setIsEnabledOverride,
}: {
  flags: FlagItem[];
  searchQuery: string | null;
  appBaseUrl: string;
  setIsEnabledOverride: (key: string, isEnabled: boolean | null) => void;
}) {
  const hasFlags = flags.length > 0;
  const hasShownFlags = flags.some((flag) =>
    isFound(flag.flagKey, searchQuery),
  );

  // List flags that match the search query first then alphabetically
  const searchedFlags =
    searchQuery === null
      ? flags
      : [...flags].sort((a, b) => {
          const aMatches = isFound(a.flagKey, searchQuery);
          const bMatches = isFound(b.flagKey, searchQuery);

          // If both match or both don't match, sort alphabetically
          if (aMatches === bMatches) {
            const aStartsWith = a.flagKey
              .toLocaleLowerCase()
              .startsWith(searchQuery);
            const bStartsWith = b.flagKey
              .toLocaleLowerCase()
              .startsWith(searchQuery);

            // If one starts with search query and the other doesn't, prioritize the one that starts with it
            if (aStartsWith && !bStartsWith) return -1;
            if (bStartsWith && !aStartsWith) return 1;

            // Otherwise sort alphabetically
            return a.flagKey.localeCompare(b.flagKey);
          }

          // Otherwise, matching flags come first
          return aMatches ? -1 : 1;
        });

  return (
    <Fragment>
      {(!hasFlags || !hasShownFlags) && (
        <div class="flags-table-empty">
          No flags {hasFlags ? `matching "${searchQuery}"` : "found"}
        </div>
      )}
      <table class="flags-table">
        <tbody>
          {searchedFlags.map((flag, index) => (
            <FlagRow
              key={flag.flagKey}
              appBaseUrl={appBaseUrl}
              flag={flag}
              index={index}
              isNotVisible={
                searchQuery !== null && !isFound(flag.flagKey, searchQuery)
              }
              setEnabledOverride={(override) =>
                setIsEnabledOverride(flag.flagKey, override)
              }
            />
          ))}
        </tbody>
      </table>
    </Fragment>
  );
}

function FlagRow({
  setEnabledOverride,
  appBaseUrl,
  flag,
  index,
  isNotVisible,
}: {
  flag: FlagItem;
  appBaseUrl: string;
  setEnabledOverride: (isEnabled: boolean | null) => void;
  index: number;
  isNotVisible: boolean;
}) {
  return (
    <tr
      key={flag.flagKey}
      class={["flag-row", isNotVisible ? "not-visible" : undefined].join(" ")}
    >
      <td class="flag-name-cell">
        <div class="flag-name-content">
          {flag.isLiveTargeting && (
            <span
              class="live-targeting-indicator"
              data-tooltip="Currently mounted in React"
              data-tooltip-left
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M13 19.9381C16.6187 19.4869 19.4869 16.6187 19.9381 13H17V11H19.9381C19.4869 7.38128 16.6187 4.51314 13 4.06189V7H11V4.06189C7.38128 4.51314 4.51314 7.38128 4.06189 11H7V13H4.06189C4.51314 16.6187 7.38128 19.4869 11 19.9381V17H13V19.9381ZM12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 14C10.8954 14 10 13.1046 10 12C10 10.8954 10.8954 10 12 10C13.1046 10 14 10.8954 14 12C14 13.1046 13.1046 14 12 14Z" />
              </svg>
            </span>
          )}
          <a
            class="flag-link"
            href={`${appBaseUrl}/env-current/flags/by-key/${flag.flagKey}`}
            rel="noreferrer"
            tabIndex={index + 1}
            target="_blank"
          >
            {flag.flagKey}
          </a>
        </div>
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
