# Reflag React SDK v2

Direct-value feature flags for React, backed by [Browser SDK v2](../browser-sdk/README.md).

> Breaking prerelease: requires compatible v2 server endpoints and **Node SDK v2** for bootstrap. The v2 CLI generates direct-value declarations; regenerate legacy wrapper-shaped output when migrating. Useful default-based inference does not require generated declarations. React Native remains on published React/Browser v1 in this repository.

## Setup

```tsx
import { ReflagProvider } from "@reflag/react-sdk";

<ReflagProvider
  publishableKey="your-publishable-key"
  context={{
    user: { id: "alice" },
    company: { id: "acme", plan: "enterprise" },
  }}
>
  <App />
</ReflagProvider>;
```

Provider options forward Browser SDK settings, including `logger`, `debug`, `enableTracking`, `offline`, cache/fallback options, `toolbar`, `feedback`, `credentials` and API origins. A custom logger takes precedence over debug logging. Live updates default to true; set `enableLiveFlagUpdates={false}` to disable them.

## `useFlag(key, defaultValue?)`

```tsx
import { useFlag, useTrack } from "@reflag/react-sdk";

function Huddles() {
  const enabled = useFlag("huddles"); // boolean, implicit false
  const settings = useFlag("huddle-settings", { maxParticipants: 10 });
  const track = useTrack();
  if (!enabled) return null;
  return (
    <button onClick={() => track("Started huddle")}>
      Start huddle (up to {settings.maxParticipants} people)
    </button>
  );
}
```

Bare reads return Boolean/false, including while initial data is unavailable. A positional default infers widened direct types, even without generated declarations:

```ts
useFlag("model", "quick"); // string
useFlag("limit", 10); // number
useFlag("settings", { model: "quick" }); // { model: string }
useFlag("nullable-settings", null); // FlagValue: arbitrary JSON
```

Non-null defaults enforce only the top-level JSON category (Boolean/number/string/array/object). Mismatches return the default and warn without logging the payload. Explicit null accepts authored null and all other JSON; missing values return null. Accepted false, zero and empty strings are preserved. Nested fields/elements are not schema-validated. Values/defaults are independent mutable copies; readonly defaults are accepted.

`useFlag` never suspends. Its second argument is **payload data**, not `{ suspense: ... }` options; ordinary JSON has no reserved keys. Use the dedicated hook below for suspension. Use `useIsLoading()` or the provider's `loadingComponent` when you need an explicit loading UI.

## `useFlagSuspense(key, defaultValue?)`

```tsx
import { Suspense } from "react";
import { useFlagSuspense } from "@reflag/react-sdk";

function Model() {
  const model = useFlagSuspense("model", "quick");
  return <span>{model}</span>;
}

<Suspense fallback={<span>Loading flags…</span>}>
  <Model />
</Suspense>;
```

This hook has the same Boolean/default-based return types. It waits for initialization before reading. Once initialization settles, missing flags return their default rather than suspending forever. Bootstrap values can render immediately. Suspended attempts do not register a root read before data is ready.

The provider's existing `suspense` prop continues to configure **`useOptInFlags` only**. It does not change `useFlag`; `useFlagSuspense` is explicit.

## Checks and usage tracking

A completed getter/hook read registers its requested-root check immediately, even if the value is ignored. Actual delivery remains buffered and identity-aware rate-limited by the Browser SDK. Checks contain selected variant/source/snapshot identity, not payloads. Defaults, category mismatches and local overrides never invent authored selections. Diagnostic/bootstrap inspection registers no checks.

Application usage and feedback remain separate hooks:

```ts
const track = useTrack();
await track("Started huddle", { button: "cta" });
const requestFeedback = useRequestFeedback();
requestFeedback({ flagKey: "huddles", title: "How did it go?" });
const sendFeedback = useSendFeedback();
await sendFeedback({ flagKey: "huddles", score: 5 });
```

See [Browser feedback documentation](../browser-sdk/FEEDBACK.md) for UI/prompt configuration.

## Optional key registration

```ts
import "@reflag/react-sdk";
declare module "@reflag/react-sdk" {
  interface Flags {
    huddles: boolean;
    "huddle-settings": { maxParticipants: number };
  }
}
```

Registration constrains keys and checks non-null defaults against the registered value schema, including required and nested properties. Named-interface and readonly defaults are supported. Explicit `null` remains an arbitrary-JSON request; bare/`undefined` reads remain Boolean. The positional default still determines the widened return type, and generated declarations do not add nested runtime validation. The same rules apply to `useFlagSuspense`. The v2 CLI generates direct-value declarations from current production-environment variants; regenerate legacy wrapper declarations when migrating.

## Bootstrap and SSR

On the server, use Node SDK v2:

```ts
const flags = serverClient.getFlagsForBootstrap(context);
```

Pass the **entire** safe, serialized envelope to the client provider:

```tsx
import { ReflagBootstrappedProvider } from "@reflag/react-sdk";

<ReflagBootstrappedProvider publishableKey={publishableKey} flags={flags}>
  <App />
</ReflagBootstrappedProvider>;
```

The envelope includes `protocolVersion: 2`, context, evaluated flag results and optional `flagStateVersion`. V1 bootstrap is rejected. Use a snapshot version for live updates; later refreshes use browser-visible context. Do not send secrets/server-only attributes to the browser. Disable live updates if later browser evaluation must not replace server-only results.

For a pre-existing Browser v2 client, use `<ReflagClientProvider client={client}>`. The provider does not own its lifecycle; initialize/stop externally, except that a suspending read can start on-demand initialization.

## Context, loading and events

- `useUpdateUser()`, `useUpdateCompany()` and `useUpdateOtherContext()` return async shallow-update functions. `useClient().setContext(context)` replaces the whole context.
- Context changes clear old-context values while fetching. Stale/in-flight responses cannot replace a newer context/snapshot.
- `useIsLoading()` returns provider loading state. `loadingComponent` and `initialLoading` configure initial presentation; they are not getter arguments.
- `useClient()` returns the underlying Browser client. Its `getFlags()` returns direct values/checks; `getFlagResults()` is diagnostic-only.
- `useOnEvent(type, handler, client?)` subscribes and unsubscribes on unmount. A supplied external client works without a provider.

## Opt-in hooks

```tsx
const { flags, isLoading } = useOptInFlags();
const setOptIn = useSetOptIn();
await setOptIn("huddles", { optedIn: true });
await setOptIn("huddles", { optedIn: false, scope: "company" });
```

Metadata arrives with the initial v2 evaluation for regular providers. Bootstrapped providers fetch missing metadata on demand from `/flags/evaluated` without replacing server-derived values. `isLoading` covers initialization and metadata retrieval; it settles on success or failure. Metadata presentation includes `isEnabled` and membership fields, separately from direct flag reads. User/company grants remain independent. Mutations confirm versioned evaluation and membership in a single refresh.

`useOptInFlags({ suspense: true | false })` retains its own per-hook loading options and may inherit provider `suspense`. These options are unrelated to the positional payload defaults used by `useFlag` / `useFlagSuspense`.

## Migration from v1

Use `const enabled = useFlag(key)` instead of destructuring `.isEnabled`. Replace wrapper config access with an authored multivariate flag and positional default. Move `.track()` and `.requestFeedback()` to separate hooks. Replace `useFlag(key, { suspense: true })` with `useFlagSuspense(key)`, and use `useIsLoading()` instead of a flag wrapper's loading property. Upgrade Browser/server bootstrap together. Nothing here publishes the prerelease or deploys its required server changes.
