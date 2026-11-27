import { Fragment, h } from "preact";

import { Switch } from "./Switch";
import type { FlagItem } from "./Toolbar";

const isFound = (flagKey: string, searchQuery: string | null) => {
  return flagKey.toLocaleLowerCase().includes(searchQuery ?? "");
};

export function FlagsTable({
  flags,
  searchQuery,
  appBaseUrl,
  setOverride,
}: {
  flags: FlagItem[];
  searchQuery: string | null;
  appBaseUrl: string;
  setOverride: (key: string, value: boolean | undefined) => void;
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
              setOverride={(value) => setOverride(flag.flagKey, value)}
            />
          ))}
        </tbody>
      </table>
    </Fragment>
  );
}

function FlagRow({
  setOverride,
  appBaseUrl,
  flag,
  index,
  isNotVisible,
}: {
  flag: FlagItem;
  appBaseUrl: string;
  setOverride: (value: boolean | undefined) => void;
  index: number;
  isNotVisible: boolean;
}) {
  return (
    <tr
      key={flag.flagKey}
      class={["flag-row", isNotVisible ? "not-visible" : undefined].join(" ")}
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
        {flag.hasOverride ? (
          <a
            class="reset"
            href=""
            tabIndex={index + 1}
            onClick={(e) => {
              e.preventDefault();
              setOverride(undefined);
            }}
          >
            reset
          </a>
        ) : null}
      </td>
      <td class="flag-switch-cell">
        <Switch
          checked={flag.value}
          tabIndex={index + 1}
          onChange={(e) => {
            setOverride(flag.hasOverride ? undefined : e.currentTarget.checked);
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
