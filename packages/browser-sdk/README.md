# Reflag Browser SDK v2

Client-side feature flags and JSON values for [Reflag](https://reflag.com).

> This is a breaking v2 prerelease. It requires the v2 evaluated-flags/check protocol on the server. Do not switch existing v1 applications or bootstrap consumers without coordinating that upgrade. Nothing in this branch publishes or deploys the SDK/server.

## Get started

```ts
import { ReflagClient } from "@reflag/browser-sdk";

const reflag = new ReflagClient({
  publishableKey: "your-publishable-key",
  user: { id: "alice", role: "manager" },
  company: { id: "acme", plan: "enterprise" },
});
await reflag.initialize();

const enabled = reflag.getFlag("huddles"); // boolean, implicit false
const settings = reflag.getFlag("assistant-settings", { model: "quick" });
// settings: { model: string }

if (enabled) {
  // Application usage tracking is separate from reading the flag.
  await reflag.track("Started huddle");
}
```

Use only a **publishable** key in a browser. Secret keys belong on your server.

## Direct-value reads

```ts
reflag.getFlag("release"); // boolean; missing/mismatched -> false
reflag.getFlag("model", "quick"); // string
reflag.getFlag("limit", 10); // number
reflag.getFlag("settings", { model: "quick" });
reflag.getFlag("nullable-settings", null); // FlagValue (arbitrary JSON)
```

- Defaults are positional JSON values; generation is not required for useful types. Primitive literals widen, and readonly defaults are accepted.
- A non-null default accepts only the same **top-level JSON category**: Boolean, number, string, array or object. A mismatch warns without logging the payload and returns the default. A bare read can never return a truthy object.
- Explicit `null` accepts any JSON value, including authored null. Missing values return null.
- Falsy selected values (`false`, `0`, `""`, null) are preserved when accepted by the requested category.
- Object fields and array elements are **not schema-validated**. Validate untrusted/nested payloads in your application.
- Values and defaults are returned as independent mutable copies. There are no reserved JSON property names.

`getFlags()` returns a direct-value record (entries may be undefined) and registers checks for its returned roots. `getFlagResults()` returns owned evaluated diagnostics **without checks**; it is intended for tooling, not ordinary application reads. `getFlagsForBootstrap()` serializes protocol-v2 evaluated state without checks.

## Checks and delivery

Calling a getter registers a requested-root check immediately, even if its return value is ignored. There are no `.isEnabled`, `.config`, `.value` or flag `.track()` wrappers. Delivery remains buffered through `/bulk` and identity-aware rate-limited.

A selected check carries the authored selected key as `evalResult`, its `sourceVersionId` and the available snapshot `flagStateVersion`. Payload equality is not identity: equal-valued selections or segment-only snapshot changes remain distinguishable on subsequent reads. Defaults, category mismatches, local overrides and static fallback values do not fabricate authored selections. Diagnostics and bootstrap serialization generate no checks. The server evaluates dependencies; fetching their results does not itself register reads.

`enableTracking: false` disables checks and user/company/usage tracking. `offline: true` skips HTTP and tracking. `await reflag.stop()` flushes buffered events and closes the client's background transports.

## Context, refresh and cache

```ts
await reflag.updateUser({ role: "admin" });
await reflag.updateCompany({ plan: "enterprise" });
await reflag.updateOtherContext({ region: "eu" });
await reflag.setContext({
  user: { id: "bob" },
  company: { id: "other-company" },
});
await reflag.refresh();
```

`setContext()` replaces the context; update methods shallow-merge their section. User/company sections require IDs, including valid numeric zero. Context supports nested JSON and arrays. A context change clears the old context's values while fetching; stale/in-flight responses cannot replace a newer context or snapshot.

Values come from `GET /flags/evaluated`, not legacy `/features/evaluated`. Server evaluation retains the complete internal graph and authorized public roots. The Browser SDK does not cache dependency evaluations of its own.

Constructor options include:

| Option                          | Behavior                                                                    |
| ------------------------------- | --------------------------------------------------------------------------- |
| `apiBaseUrl`, `appBaseUrl`      | API origin and toolbar/feedback links                                       |
| `credentials`                   | Fetch credentials mode; `include` also enables default SSE credentials      |
| `timeoutMs`                     | Flag request timeout; default 5,000 ms                                      |
| `staleTimeMs`                   | Fresh-cache duration; default 0                                             |
| `staleWhileRevalidate`          | Serve stale cached state while revalidating; default false                  |
| `expireTimeMs`                  | Cache expiry; default 30 days                                               |
| `storage`                       | Optional async storage adapter                                              |
| `fallbackFlags`                 | Value record or array of enabled Boolean keys, without authored provenance  |
| `enableLiveFlagUpdates`         | Refresh after SSE publications; default false in Browser, true in React/Vue |
| `eventSourceFactory`            | Optional EventSource-compatible transport                                   |
| `trackingQueue`                 | Buffered-delivery `flushDelayMs` and `maxSize`                              |
| `logger`, `toolbar`, `feedback` | Logging, Boolean override toolbar and feedback options                      |

Evaluated cache and override storage use isolated v2 keys. V1 cache entries are never interpreted as v2 values. Malformed refreshes leave known-good state intact. Valid saved v2 selections retain their real provenance on restore. There is no automatic periodic HTTP fallback after an SSE failure; manual refresh/context updates remain available.

## Overrides and toolbar

```ts
reflag.setFlagOverride("release", true);
reflag.setFlagOverride("settings", { model: "local" });
reflag.setFlagOverride("nullable-settings", null); // a real null override
reflag.setFlagOverride("release", undefined); // clear the override
```

Overrides apply after server evaluation and do not rewrite authored dependency results. The built-in toolbar appears on localhost by default and offers Boolean overrides only. It uses diagnostic access, so opening it does not register application checks.

## Server bootstrap

Generate the full payload with **Node SDK v2** on your server:

```ts
const bootstrappedState = serverClient.getFlagsForBootstrap(context);
// Send via your framework's safe JSON/hydration mechanism.
```

```ts
const reflag = new ReflagClient({ publishableKey, bootstrappedState });
await reflag.initialize();
const enabled = reflag.getFlag("release");
```

The payload includes `protocolVersion: 2`, context, evaluated diagnostics/selections and an optional snapshot version. V1 payloads and the old `bootstrappedFlags` option are rejected. Preserve the entire envelope; do not pass just its `flags` property. A version is required for bootstrapped live updates. Never embed secrets or server-only context in public bootstrap data. Later refreshes use browser-visible context and can differ from server-only evaluation; disable live updates when that is inappropriate.

## End-user opt-in

```ts
const options = reflag.getOptInFlags();
const loading = reflag.getIsLoadingOptInFlags();
await reflag.setOptIn("huddles", { optedIn: true });
await reflag.setOptIn("huddles", { optedIn: false, scope: "company" });
```

The list contains presentation/membership metadata (`key`, `name`, `description`, `isEnabled`, `userOptedIn`, `companyOptedIn`, `isOptedIn`); this is not the ordinary flag getter API. User/company grants remain independent. The selected scope requires its ID. Successful mutations wait for versioned evaluation and membership confirmation.

Metadata arrives with ordinary `/flags/evaluated` responses and is cached with the evaluated snapshot. Bootstrapped clients whose snapshot lacks metadata fetch it on demand from the same v2 endpoint, without replacing server-derived values or provenance with browser-context evaluations. Loading settles on success or failure, including an empty list. Opt-in mutations confirm values and membership together in one versioned refresh. `optInFlagsLoadingUpdated` and `flagsUpdated` support UI subscriptions.

## Tracking, feedback and events

Use `track(eventName, attributes?)`, `feedback(payload)` and `requestFeedback({ flagKey, ... })` on the client. See [FEEDBACK.md](./FEEDBACK.md) for the feedback UI and prompting configuration.

`on(event, handler)` returns an unsubscribe function. Events include `stateUpdated`, `flagsUpdated` (evaluated diagnostics), `check`, `track`, `user`, `company` and `optInFlagsLoadingUpdated`.

## Migration from v1

- Replace `getFlag(key).isEnabled` with `getFlag(key)`.
- Replace legacy remote config access with a separately authored multivariate flag and a positional default. Legacy config is **not** automatically converted into v2 values.
- Move flag `.track()` / `.requestFeedback()` calls to ordinary client methods.
- Replace wrapper overrides with `setFlagOverride(key, value)`; undefined clears, null is a value.
- `getFlags()` now returns values and registers checks. Tooling should use `getFlagResults()`.
- Upgrade both ends of bootstrap to v2. Old Browser/framework clients remain incompatible with v2 bootstrap.
