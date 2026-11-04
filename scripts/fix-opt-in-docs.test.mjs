import assert from "node:assert/strict";
import { test } from "node:test";

import { fixOptInDocs } from "./fix-opt-in-docs.mjs";

test("qualifies the browser OptInFlag without changing unrelated types", () => {
  assert.equal(
    fixOptInDocs('type OptInFlag = Omit<OptInFlag, "key"> & { key: FlagKey };'),
    'type OptInFlag = Omit<import("@reflag/browser-sdk").OptInFlag, "key"> & { key: FlagKey };',
  );
  const unrelated = 'type Other = Omit<OptInFlag, "key">;';
  assert.equal(fixOptInDocs(unrelated), unrelated);
});

test("restores optional opt-in settings, not arbitrary scope properties", () => {
  const input = `type SetOptInOptions = {
  optedIn: boolean;
  scope: "user" | "company";
};
type UseOptInFlagsOptions = {
  suspense: boolean;
};
type Other = { scope: string };`;
  const expected = input
    .replace('scope: "user"', 'scope?: "user"')
    .replace("suspense:", "suspense?:");
  assert.equal(fixOptInDocs(input), expected);
  assert.equal(fixOptInDocs(expected), expected);
});

test("marks useOptInFlags options optional in both the signature and table", () => {
  const input = `### useOptInFlags()

function useOptInFlags(options: UseOptInFlagsOptions): UseOptInFlagsResult

<td>\n\n\`options\`\n\n</td>

***
### anotherHook()

\`options\`
`;
  const expected = input
    .replace("(options:", "(options?:")
    .replace("`options`", "`options`?");
  assert.equal(fixOptInDocs(input), expected);
  assert.equal(fixOptInDocs(expected), expected);
});
