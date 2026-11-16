# Reflag Node.js SDK

Server-side Boolean and multivariate flag values for [Reflag](https://reflag.com).

## Installation and initialization

```sh
yarn add @reflag/node-sdk
```

Create one client per process and initialize it before reading flags. Obtain your environment's secret key from Reflag's environment settings; complete flag definitions must remain server-side.

```ts
import { ReflagClient } from "@reflag/node-sdk";

export const reflag = new ReflagClient({
  secretKey: process.env.REFLAG_SECRET_KEY,
});
await reflag.initialize();
```

## Read flags

```ts
const context = {
  user: { id: "user-1" },
  company: { id: "acme", plan: "enterprise" },
};

const enabled = reflag.getFlag(context, "new-editor"); // boolean; implicit false
const model = reflag.getFlag(context, "model", "quick"); // string
const limits = reflag.getFlag(context, "limits", { maxItems: 10 }); // { maxItems: number }
```

`getFlag()` returns a Boolean, string, number, array, object, or null. Without a default it is a Boolean read: unavailable or non-Boolean values return `false`. With a positional default, missing values use that default. Valid `false`, `0`, empty strings, arrays, and objects are preserved rather than replaced by truthiness checks.

Non-null defaults specify the expected JSON category: Boolean, number, string, array, or object. A category mismatch logs a warning without the payload and returns the default. This is not nested payload validation: object properties and array elements must still match your authored schema. Use an explicit `null` default for arbitrary JSON or nullable/off selections, and narrow the result before accessing object fields:

```ts
const payload = reflag.getFlag(context, "nullable-settings", null); // FlagValue
// Authored null is preserved, as are any other valid JSON values. Missing uses null.
```

Defaults infer useful types without generated declarations, including widening primitive literals. Readonly defaults are accepted; results and defaults are returned as independent copies. Defaults are ordinary JSON payloads, with no reserved property names.

Each call records a check, even if you don't use the returned value. Reflag uses checks for launch monitoring; they are batched and rate-limited.

`getFlags()` returns a record of flag values; unavailable values may be `undefined`.

```ts
const values = reflag.getFlags(context); // value record; checks each returned root
const bound = reflag.bindClient(context);
const value = bound.getFlag("model", "quick");
const allValues = bound.getFlags();

// Ordinary usage tracking is separate from flag checks.
await bound.track("Document created", { attributes: { source: "editor" } });
await reflag.flush();
```

Binding queues user/company attributes and their association even if the client is subsequently used only for tracking or remote reads. Synchronization is asynchronous and respects offline/tracking guards; failures are logged.

Local reads made before initialization include a `CLIENT_NOT_INITIALIZED` diagnostic in their check's optional `evalErrors`. Targeting diagnostics retain their code, field/operator when applicable, message, and dependency origin. Remote evaluation does not require the local definition cache to be initialized, and bootstrap/diagnostic access does not itself register checks.

`enableTracking: false` disables checks, context synchronization, and bound-client usage tracking. Explicit calls to the root client's `track()`, `updateUser()`, and `updateCompany()` remain separate operations.

## Evaluation and synchronization

The SDK fetches a complete `{ flags, segments }` graph from secret-key-only `GET /flags`. Definitions are validated and prepared before the flags, segments, and snapshot version replace the current cache together. Malformed graphs and stale responses cannot replace last-known-good state.

`getFlag()` evaluates only its root and dependencies. `getFlags()` evaluates the collection. References are reevaluated on every traversal: there is **no context/dependency-result caching**. Only immutable definition preparation is retained. Returned objects are independent copies, so changing a value cannot mutate the saved definitions.

Synchronization modes:

- `push` (default): authenticated SSE updates with reconnect handling.
- `polling`: periodic background refreshes.
- `in-request`: request-driven refreshes, suitable for constrained runtimes.

```ts
await reflag.refreshFlags();
await reflag.refreshFlags(42); // request at least this snapshot version
const definitions = reflag.getFlagDefinitions(); // { flags, segments }, not an array
```

Refreshes are throttled. In-request mode can queue a refresh during the throttle window until a later access; a refresh call is not an unconditional synchronization barrier.

Ordinary warm `/flags` refreshes send `If-None-Match` when the accepted snapshot has an ETag. A bodyless `304` retains the complete prepared graph and version while resetting freshness, without recompiling or saving it again. Cold/fallback initialization and version-targeted requests remain unconditional. Custom HTTP clients can return the exact optional `HttpClientResponse.etag` to enable this behavior; clients without one continue to use full GETs. Validators are enabled only after the snapshot's fallback save succeeds. Failed or pending saves leave refreshes unconditional, and rejected snapshots cannot replace a validator or overwrite fallback storage.

## Fallback providers

```ts
import { ReflagClient, fallbackProviders } from "@reflag/node-sdk";

const client = new ReflagClient({
  secretKey: process.env.REFLAG_SECRET_KEY,
  flagsFallbackProvider: fallbackProviders.file({ directory: ".reflag" }),
});
await client.initialize();
```

Live state is primary. When the initial live fetch fails, the SDK can load a saved complete collection. Later outages retain the in-memory graph rather than reloading older fallback state. Accepted live snapshots are saved in order; `flush()` also waits for pending saves.

Available providers: `static`, `file`, `redis`, `s3`, and `gcs`, plus custom `FlagsFallbackProvider` implementations. A snapshot contains:

```ts
{
  version: 2,
  savedAt: "2026-01-01T00:00:00.000Z",
  flagStateVersion: 42,
  flags: [/* compiled flags */],
  segments: [/* compiled segment predicates */],
}
```

Built-in files/S3/GCS objects use `flags-fallback-v2-<hash-prefix>.json`; Redis uses `<keyPrefix>:v2:<hash-prefix>`.

A static fallback can contain any JSON values:

```ts
fallbackProviders.static({
  flags: { "new-editor": false, model: "quick", limits: null },
});
```

Providers are not loaded in offline mode.

## Overrides and tests

```ts
const client = new ReflagClient({
  offline: true,
  flagOverrides: { "new-editor": true, limits: { maxItems: 5 } },
});
await client.initialize();
client.setFlagOverrides({ model: "quick" });
const remove = client.pushFlagOverrides((context) => ({
  model: context.company?.id === "qa" ? "quality" : "quick",
}));
remove();
client.clearFlagOverrides();
```

Overrides are direct JSON values. Pushed layers win over base overrides and can be removed independently. They apply **after evaluation**, so overriding a dependency's returned value does not rewrite dependent flag evaluations. Offline mode does not fetch, load a provider, or send tracking events.

## Typed flags

Generated declarations are optional. Singular reads infer their return type from the default, or return Boolean when no default is supplied. Optionally augment `Flags` to constrain keys, check non-null defaults against each key's value schema, and type batch records:

```ts
declare module "@reflag/node-sdk" {
  interface Flags {
    "new-editor": boolean;
    model: "quick" | "quality";
    limits: { maxItems: number } | null;
  }
}

const model = reflag.getFlag(context, "model", "quick"); // string
const models = reflag.getFlags(context); // models.model: "quick" | "quality" | undefined
```

Augmentation rejects defaults with the wrong category, missing required properties, or incompatible nested types. Named-interface and readonly defaults are supported. Explicit `null` remains an arbitrary-JSON request, and bare/`undefined` reads still return Boolean. Return types continue to be inferred and widened from the default; generated types do not add nested runtime validation. The Reflag CLI generates schemas from current production-environment variants. See the Express example for a typed integration.

## Bootstrap state

```ts
const bootstrap = reflag.getFlagsForBootstrap(context);
// { protocolVersion: 2, context, flags: { model: { resolved, value,
//     variantKey, sourceVersionId, matchedRuleId, ruleResults, errors, ... } },
//   flagStateVersion }
```

Bootstrap uses batch evaluation and does **not** register checks.

Pass the entire envelope to the Browser, React or Vue SDK's bootstrap option, not just its `flags` property. Use your framework's safe serialization mechanism and never expose secret keys or server-only context in public bootstrap data.

## Remote evaluation

```ts
const enabled = await reflag.getFlagRemote(
  "new-editor",
  undefined,
  "user-1",
  "acme",
);
const model = await reflag.getFlagRemote("model", "quick", "user-1", "acme");
const boundModel = await reflag
  .bindClient(context)
  .getFlagRemote("model", "quick");
const values = await reflag.getFlagsRemote("user-1", "acme", {
  other: { region: "eu" },
});
```

These methods use `/flags/evaluated` and return direct values. Singular remote reads use the same defaults, category checks, and JSON validation as local reads. The root `getFlagRemote(key, defaultValue, userId?, companyId?, context?)` places the default second; use `undefined` for an implicit Boolean read when passing explicit IDs. `getFlagsRemote(userId?, companyId?, context?)` returns a record of flag values.

Each requested singular root registers a check, including a default after a failed/missing remote evaluation, unless tracking is disabled. Explicit IDs, including numeric zero, take precedence over IDs in additional context. Stored attribute updates are asynchronous; remote evaluation need not immediately observe a just-sent update.

## Edge runtimes

Use `EdgeClient` with Node compatibility enabled. It selects in-request synchronization. Call `ctx.waitUntil(client.flush())` before returning from a Worker so queued events and refresh work can complete.

## Configuration

Configuration precedence is constructor options, environment variables, then `reflag.config.json`. Supported environment variables include `REFLAG_SECRET_KEY`, `REFLAG_API_BASE_URL`, `REFLAG_LOG_LEVEL`, `REFLAG_OFFLINE`, `REFLAG_CONFIG_FILE`, and Boolean override lists `REFLAG_FLAGS_ENABLED` / `REFLAG_FLAGS_DISABLED`.

Constructor options also include a custom `logger` / `httpClient`, `flagsSyncMode`, `flagsPushUrl`, `fetchTimeoutMs`, `flagsFetchRetries`, `flagsFallbackProvider`, direct-value `flagOverrides`, and `batchOptions` (`maxSize`, `intervalMs`, `flushOnExit`). `emitEvaluationEvents` is deprecated and has no effect.

Invalid options/context or non-JSON defaults can throw. Network or definition-refresh failures are logged and retain usable state. Singular reads use their caller default (implicit `false`); batch reads retain raw values/`undefined`. Call `await client.flush()` before shutting down, then `client.destroy()` to stop background work. `batchOptions.flushOnExit` only flushes on natural Node process exit (`beforeExit`); it does not install signal handlers or force application shutdown. For signal-driven shutdown or an explicit `process.exit()`, await `flush()` in the application's own shutdown hook before exiting.

## License

MIT License. Copyright (c) 2025 Bucket ApS.
