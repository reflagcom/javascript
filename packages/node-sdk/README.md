# Reflag Node.js SDK

Feature flags, remote configuration and usage tracking for Node.js servers.

## Get started

### 1. Create a client

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

Keep the secret key on your server.

### 2. Create a flag

Install the Reflag CLI and create a flag:

```sh
yarn add --dev @reflag/cli
npx reflag new
```

The first time you run it, it signs you in to Reflag, saves its settings in `reflag.config.json` and generates types for your flags in `gen/flags.d.ts`. Choose `node` when asked for the output format, and make sure your `tsconfig.json` includes the generated file. You can also create flags in the Reflag app.

### 3. Read the flag

Read a flag for a user and company:

```ts
const context = {
  user: { id: "user-1" },
  company: { id: "acme", plan: "enterprise" },
};

if (reflag.getFlag(context, "new-editor")) {
  // Show the new editor
}
```

The SDK downloads your flag definitions and evaluates flags locally, so reads don't make network requests.

## Read flags

Pass a context and a flag key to check whether the flag is enabled:

```ts
const enabled = reflag.getFlag(context, "new-editor"); // true or false
```

Pass a default as the third argument to read a configuration value. The default sets the expected JSON type:

```ts
const model = reflag.getFlag(context, "model", "quick"); // string
const limits = reflag.getFlag(context, "limits", { maxItems: 10 }); // { maxItems: number }
```

If the flag is missing or has a different JSON type, such as a string instead of a number, the SDK returns your default. Without a default, it expects a Boolean and falls back to `false`. Pass `null` to allow any JSON value, then check its type before using it.

The SDK doesn't check object fields or fill in missing fields from your default.

`getFlags(context)` returns an object mapping flag keys to values.

Each read records a check, which Reflag uses for launch monitoring.

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

Configure your flag's adoption rules to match the event names you send. Events are sent in batches; see [Shutting down](#shutting-down) to send them before your process exits.

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

Declaring your flags gives you autocompletion for keys, type checks for defaults and typed `getFlags()` results. If you created a flag with `npx reflag new`, the declarations are already generated; run `npx reflag flags types` again when your flags change. A declaration looks like this:

```ts
declare module "@reflag/node-sdk" {
  interface Flags {
    "new-editor": boolean;
    model: "quick" | "quality";
    limits: { maxItems: number } | null;
  }
}
```

Declarations are checked at compile time only. See the [Reflag CLI](https://docs.reflag.com/api/cli) for more options.

## Bootstrap the browser

To render flags in the browser without waiting for a network request, evaluate them on the server and pass the result to the Browser, React or Vue SDK's bootstrap option:

```ts
const bootstrap = reflag.getFlagsForBootstrap(context);
```

Pass the whole object, serialized with your framework's usual mechanism.

The result includes the full context you pass in, so every user, company and other attribute in it is visible to the browser. Bootstrap with a context that contains only what the client may see.

## Remote evaluation

To evaluate flags on Reflag's servers instead of locally, use the remote methods:

```ts
// Root client: key, default, user ID, company ID
const model = await reflag.getFlagRemote("model", "quick", "user-1", "acme");
const boundModel = await reflag
  .bindClient(context)
  .getFlagRemote("model", "quick");
const values = await reflag.getFlagsRemote("user-1", "acme", {
  other: { region: "eu" },
});
```

To read a Boolean with the root client, pass `undefined` as the default.

## Edge runtimes

Use `EdgeClient` in edge runtimes such as Cloudflare Workers, with Node.js compatibility enabled. It refreshes flags as they're read, instead of in the background:

```ts
import { EdgeClient } from "@reflag/node-sdk";

let reflag: EdgeClient | undefined;

export default {
  async fetch(request, env, ctx) {
    reflag ??= new EdgeClient({ secretKey: env.REFLAG_SECRET_KEY });
    await reflag.initialize();
    const enabled = reflag.getFlag({ user: { id: "user-1" } }, "new-editor");
    ctx.waitUntil(reflag.flush());
    return new Response(enabled ? "New editor" : "Old editor");
  },
};
```

Call `ctx.waitUntil(reflag.flush())` before returning so queued events are sent.

## Configuration

Options can be set in the constructor, through environment variables, or in `reflag.config.json`, in that order of precedence.

| Option                  | Environment variable                            | Description                                                          |
| ----------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| `secretKey`             | `REFLAG_SECRET_KEY`                             | Your environment's secret key                                        |
| `apiBaseUrl`            | `REFLAG_API_BASE_URL`                           | Override the API URL                                                 |
| `logLevel`, `logger`    | `REFLAG_LOG_LEVEL`                              | Log level (default `INFO`) or a custom logger                        |
| `offline`               | `REFLAG_OFFLINE`                                | Make no network requests, for example in tests                       |
| `configFile`            | `REFLAG_CONFIG_FILE`                            | Path to a config file other than `reflag.config.json`                |
| `flagOverrides`         | `REFLAG_FLAGS_ENABLED`, `REFLAG_FLAGS_DISABLED` | Override flags; the variables take comma-separated Boolean flag keys |
| `flagsSyncMode`         |                                                 | How flag definitions are kept up to date; default `push`             |
| `flagsFallbackProvider` |                                                 | Where to save flag definitions for startup                           |
| `fetchTimeoutMs`        |                                                 | Request timeout; default 10,000 ms                                   |
| `flagsFetchRetries`     |                                                 | Retries for fetching flag definitions; default 3                     |
| `batchOptions`          |                                                 | Event batching: `maxSize`, `intervalMs` and `flushOnExit`            |
| `httpClient`            |                                                 | Custom HTTP client                                                   |

To stop sending checks and events for a context, include `enableTracking: false` in it:

```ts
const untracked = reflag.bindClient({ ...context, enableTracking: false });
```

## Shutting down

Before your process exits, call `await reflag.flush()` to send queued events, then `reflag.destroy()` to stop background work. `batchOptions.flushOnExit` flushes only when Node exits on its own; if you exit on a signal or call `process.exit()`, call `flush()` in your shutdown handler first.

## License

MIT License. Copyright (c) 2025 Bucket ApS.
