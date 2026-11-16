# Reflag Node.js SDK

Feature flags, remote configuration and usage tracking for Node.js servers.

## Get started

Install the SDK:

```sh
yarn add @reflag/node-sdk
```

Create one client per process with your environment's **secret** key, found in your Reflag environment settings. Initialize it before reading flags:

```ts
import { ReflagClient } from "@reflag/node-sdk";

export const reflag = new ReflagClient({
  secretKey: process.env.REFLAG_SECRET_KEY,
});
await reflag.initialize();
```

Then read a flag for a user and company:

```ts
const context = {
  user: { id: "user-1" },
  company: { id: "acme", plan: "enterprise" },
};

if (reflag.getFlag(context, "new-editor")) {
  // Show the new editor
}
```

The SDK downloads your flag definitions and evaluates flags locally, so reads don't make network requests. Keep the secret key on your server.

## Read flags

Without a default, `getFlag()` returns a Boolean. You get `false` if the flag is missing or isn't a Boolean.

To read a configuration value, pass a default. The return type follows the default, and you get the default back if the flag is missing or holds a different type of value:

```ts
const model = reflag.getFlag(context, "model", "quick"); // string
const limits = reflag.getFlag(context, "limits", { maxItems: 10 }); // { maxItems: number }
const payload = reflag.getFlag(context, "nullable-settings", null); // any JSON value; narrow it yourself
```

The SDK checks only the top-level type of a value. If your application depends on nested fields, validate them.

`getFlags(context)` returns all flag values as a record; a value can be `undefined` if the flag is unavailable.

Reading a flag records a check, even if you don't use the value. Reflag uses checks for launch monitoring.

## Bind a client to a request

To avoid passing the context on every call, bind it once, for example per request:

```ts
const bound = reflag.bindClient(context);

const model = bound.getFlag("model", "quick");
const allValues = bound.getFlags();
```

Binding also sends the user's and company's attributes to Reflag, so you can target and filter by them.

## Track usage

```ts
await bound.track("Document created", { attributes: { source: "editor" } });
```

Configure your flag's adoption rules to match the event names you send. Events are sent in batches. Call `await reflag.flush()` to send any queued events, for example before your process exits.

## Keep flags up to date

The client keeps flag definitions up to date in the background. Choose how with `flagsSyncMode`:

- `push` (default): receive updates as soon as flags change.
- `polling`: refresh periodically.
- `in-request`: refresh when flags are read, for environments without long-running background work.

Call `await reflag.refreshFlags()` to request a refresh yourself. If a refresh fails, the client keeps using the flags it already has.

## Fallback providers

A fallback provider saves the latest flag definitions so your service can start even if Reflag is unreachable:

```ts
import { ReflagClient, fallbackProviders } from "@reflag/node-sdk";

const client = new ReflagClient({
  secretKey: process.env.REFLAG_SECRET_KEY,
  flagsFallbackProvider: fallbackProviders.file({ directory: ".reflag" }),
});
await client.initialize();
```

The client uses saved definitions only when it can't fetch them at startup. Built-in providers are `file`, `redis`, `s3`, `gcs` and `static`. You can also implement your own `FlagsFallbackProvider`.

A static provider takes fixed values:

```ts
fallbackProviders.static({
  flags: { "new-editor": false, model: "quick", limits: null },
});
```

## Overrides and tests

Use offline mode and overrides to run tests without contacting Reflag:

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

Overrides pushed with `pushFlagOverrides()` take precedence over base overrides and can be removed independently. In offline mode, the client makes no network requests and sends no events.

## Type safety

Optionally declare your flags to get autocompletion for keys, type checks for defaults and typed `getFlags()` results:

```ts
declare module "@reflag/node-sdk" {
  interface Flags {
    "new-editor": boolean;
    model: "quick" | "quality";
    limits: { maxItems: number } | null;
  }
}
```

The [Reflag CLI](https://docs.reflag.com/api/cli) can generate these declarations for you. Declarations are checked at compile time only.

## Bootstrap the browser

To render flags in the browser without waiting for a network request, evaluate them on the server and pass the result to the Browser, React or Vue SDK's bootstrap option:

```ts
const bootstrap = reflag.getFlagsForBootstrap(context);
```

Pass the whole object, serialized with your framework's usual mechanism. Leave secrets and server-only attributes out of the context you bootstrap, because the browser can read it.

## Remote evaluation

To evaluate flags on Reflag's servers instead of locally, use the remote methods:

```ts
const model = await reflag.getFlagRemote("model", "quick", "user-1", "acme");
const boundModel = await reflag
  .bindClient(context)
  .getFlagRemote("model", "quick");
const values = await reflag.getFlagsRemote("user-1", "acme", {
  other: { region: "eu" },
});
```

On the root client, the default comes second: `getFlagRemote(key, defaultValue, userId?, companyId?, context?)`. Pass `undefined` as the default for a Boolean read.

## Edge runtimes

Use `EdgeClient` in edge runtimes such as Cloudflare Workers, with Node.js compatibility enabled. It refreshes flags as they're read. Call `ctx.waitUntil(client.flush())` before returning from a Worker so queued events are sent.

## Configuration

Options can be set in the constructor, through environment variables, or in `reflag.config.json`, in that order of precedence.

Environment variables include `REFLAG_SECRET_KEY`, `REFLAG_API_BASE_URL`, `REFLAG_LOG_LEVEL`, `REFLAG_OFFLINE`, `REFLAG_CONFIG_FILE`, and `REFLAG_FLAGS_ENABLED` / `REFLAG_FLAGS_DISABLED` to override Boolean flags.

Constructor options include `logger`, `httpClient`, `flagsSyncMode`, `fetchTimeoutMs`, `flagsFetchRetries`, `flagsFallbackProvider`, `flagOverrides`, `enableTracking`, `offline` and `batchOptions` (`maxSize`, `intervalMs`, `flushOnExit`).

## Shutting down

Before your process exits, call `await reflag.flush()` to send queued events, then `reflag.destroy()` to stop background work. `batchOptions.flushOnExit` flushes only when Node exits on its own; if you exit on a signal or call `process.exit()`, call `flush()` in your shutdown handler first.

## License

MIT License. Copyright (c) 2025 Bucket ApS.
