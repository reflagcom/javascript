export function getCursorRules() {
  return `
---
description: Guidelines for Reflag SDK v2 direct-value flags
globs: "**/*.ts, **/*.tsx, **/*.js, **/*.jsx, **/*.vue"
---

${rules}
`.trim();
}

export function getCopilotInstructions() {
  return rules;
}

const rules = /* markdown */ `
# Reflag SDK v2

These instructions apply to Node, Browser, React, and Vue SDK v2. Native and OpenFeature integrations may still use SDK v1; do not mix their declarations or bootstrap formats with v2.

## Direct-value reads

- Singular reads return the selected JSON value, not a flag wrapper. Do not use flag .isEnabled, .config.payload, .value, .track(), or feedback methods. Vue's .value is the normal ref API, not a flag wrapper.
- A read without a default requests Boolean with implicit false, even when generated types register a JSON flag. Generated types do not change runtime read categories.
- For other values, pass a JSON default immediately after the key. It selects the top-level category and supplies missing/mismatched-value fallback behavior.
- Non-null defaults must match the registered value schema, if types are generated. Without registration, return types are inferred from the default. Literal values widen, and readonly defaults produce mutable results.
- Explicit null requests arbitrary JSON and returns FlagValue; narrow or validate it before using object properties. It is not a request for a null-only value.
- Preserve authored false, zero, empty strings, empty arrays, and null. Do not substitute defaults with truthiness checks.
- Defaults must be ordinary JSON: no functions, Dates, undefined, or cycles. Objects and arrays returned by the SDK are independent mutable copies.
- Runtime category checks are not nested schema validation. Generated declarations are a snapshot inferred from authored variants; regenerate when flags change and validate externally when stronger runtime guarantees are needed.

## Generated declarations

Use reflag flags types after configuring the project. This CLI targets SDK v2 and loads the current production-environment variants through the management flag API. It does not generate legacy remote-config wrappers.

Example generated shape:

\`\`\`typescript
import "@reflag/react-sdk";
declare module "@reflag/react-sdk" {
  interface Flags {
    huddles: boolean;
    "huddle-settings": { tokens: number; model: string };
  }
}
\`\`\`

## React

Configure ReflagProvider with the publishable key and appropriate user/company context. Never expose a secret key in browser code.

\`\`\`tsx
import { useFlag } from "@reflag/react-sdk";

function HuddleButton() {
  const enabled = useFlag("huddles");
  const settings = useFlag("huddle-settings", { tokens: 128, model: "quick" });
  if (!enabled) return null;
  return <button>{settings.model}: {settings.tokens} tokens</button>;
}
\`\`\`

useFlag is non-suspending. Use useFlagSuspense explicitly inside a React Suspense boundary when initialization must complete before reading. Use separate useTrack and feedback hooks rather than methods on flag results.

## Node

Initialize the client, then supply context directly or bind a context-specific client. Defaults are the third argument to an unbound getFlag and the second argument to bound or remote getters.

\`\`\`typescript
import { ReflagClient } from "@reflag/node-sdk";

const client = new ReflagClient({ secretKey: process.env.REFLAG_SECRET_KEY! });
await client.initialize();
const context = { user: { id: "user_123" }, company: { id: "company_456" } };
const enabled = client.getFlag(context, "huddles");
const bound = client.bindClient(context);
const settings = bound.getFlag("huddle-settings", { tokens: 128, model: "quick" });
\`\`\`

Use getFlagRemote for explicit remote evaluation. getFlags returns a record of values that may be undefined; reading a complete record is not a replacement for choosing a singular read's category/default.

## Vue and Browser

Vue useFlag has the same default rules and returns a ref; access settings.value.model for an object-valued ref. Browser client.getFlag(key, defaultValue) returns a direct value, not a ref or wrapper.

## Further resources

- [Documentation](https://docs.reflag.com)
- [Repository](https://github.com/reflagcom/javascript)
- Prefer the installed package README and declarations for the exact SDK version in use.
`.trim();
