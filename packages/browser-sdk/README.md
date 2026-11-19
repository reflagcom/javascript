# Reflag Browser SDK

Feature flags, remote configuration, usage tracking and feedback for browser applications.

## Get started

### 1. Create a client

Install the SDK:

```sh
npm install @reflag/browser-sdk
```

Create a client with your **publishable** key and the signed-in user's context:

```ts
import { ReflagClient } from "@reflag/browser-sdk";

const reflag = new ReflagClient({
  publishableKey: "your-publishable-key",
  user: { id: "alice", role: "manager" },
  company: { id: "acme", plan: "enterprise" },
});
await reflag.initialize();
```

Publishable keys are safe to ship to the browser. Keep secret keys on your server.

### 2. Create a flag

Create a flag with the key `huddles` in the Reflag app.

### 3. Read the flag

```ts
if (reflag.getFlag("huddles")) {
  await reflag.track("Started huddle");
}
```

## Read flags

Pass a flag key to check whether the flag is enabled:

```ts
const enabled = reflag.getFlag("huddles"); // true or false
```

To read a configuration value, pass a default as the second argument. You get back a value of the same type as the default:

```ts
const model = reflag.getFlag("model", "quick"); // string
const settings = reflag.getFlag("assistant-settings", { model: "quick" }); // { model: string }
```

If the flag doesn't exist, or its value has a different type, you get `false`, or your default if you passed one. Pass `null` as the default to accept any JSON value and narrow it yourself.

The SDK checks only the top-level type of a value. If your application depends on nested fields, validate them.

`getFlags()` returns all flag values as a record.

Each read records a check, which Reflag uses for launch monitoring.

## Track usage and feedback

```ts
await reflag.track("Started huddle", { button: "cta" });
reflag.requestFeedback({ flagKey: "huddles", title: "How did it go?" });
await reflag.feedback({ flagKey: "huddles", score: 5 });
```

`requestFeedback()` opens the feedback form. `feedback()` sends feedback you collected yourself.

Configure your flag's adoption rules to match the event names you send. See [FEEDBACK.md](./FEEDBACK.md) to configure feedback prompts and the feedback UI.

## Update context

```ts
await reflag.updateUser({ role: "admin" });
await reflag.updateCompany({ plan: "enterprise" });
await reflag.updateOtherContext({ region: "eu" });

// Replace the whole context, for example after the user switches company:
await reflag.setContext({
  user: { id: "bob" },
  company: { id: "other-company" },
});
```

The update methods merge into their section of the context, while `setContext()` replaces all of it. User and company sections need an `id`. Flag values are refetched for the new context.

## Bootstrap from the server

To render flags immediately, without waiting for a network request, evaluate them on your server with the **Node.js SDK** and pass the result to the browser:

```ts
// On the server
const bootstrappedState = serverClient.getFlagsForBootstrap(context);
```

```ts
// In the browser
const reflag = new ReflagClient({ publishableKey, bootstrappedState });
await reflag.initialize();
```

Use Node SDK v2 and pass the whole object returned by `getFlagsForBootstrap()`, including `protocolVersion: 2`, serialized with your framework's usual mechanism. V1 bootstrap data and the old `bootstrappedFlags` option are not supported. Live updates require `flagStateVersion` in the bootstrap data. Leave secrets and server-only attributes out of the context you bootstrap, because the browser can read it.

Later refreshes evaluate flags using the browser's context. If values that depend on server-only attributes must not change, leave `enableLiveFlagUpdates` off (the default).

## Let users opt in to flags

```ts
const optInFlags = reflag.getOptInFlags();
try {
  const response = await reflag.setOptIn("huddles", { optedIn: true });
  if (!response?.ok) console.error("Could not update opt-in");
} catch (error) {
  console.error("Could not update opt-in", error);
}
```

Each entry includes the flag's `key`, `name`, `description` and whether the user or company has opted in. User and company opt-ins are independent; pass `scope: "company"` to change the company's opt-in. Use `getIsLoadingOptInFlags()` and the `optInFlagsLoadingUpdated` event to show a loading state.

Opt-in metadata arrives with flag values and is cached with them. Bootstrapped clients fetch missing metadata on demand without replacing server-evaluated values. This request can happen even with live updates disabled. Loading settles on success or failure; failed metadata requests do not expose an error, so call `reflag.refresh()` to retry.

Check the mutation's returned `Response.ok` and catch rejections. HTTP failures return a readable non-OK response without refreshing; skipped calls return `undefined`. Successful mutations wait for updated values and membership confirmation, but confirmation can fail after membership has changed remotely.

## Overrides and toolbar

Override flags locally while developing or testing:

```ts
reflag.setFlagOverride("huddles", true);
reflag.setFlagOverride("assistant-settings", { model: "local" });
reflag.setFlagOverride("huddles", undefined); // remove the override
```

The toolbar shows on `localhost` by default and lets you toggle Boolean flags for yourself. Use the `toolbar` option to show it elsewhere, for example to internal users in production:

```ts
const reflag = new ReflagClient({
  publishableKey,
  toolbar: user.isInternal, // show the toolbar to internal users
});
```

## Events

`on(event, handler)` subscribes to client events and returns an unsubscribe function. Events include `stateUpdated`, `flagsUpdated`, `check`, `track`, `user`, `company` and `optInFlagsLoadingUpdated`.

## Configuration

| Option                     | Description                                                     |
| -------------------------- | --------------------------------------------------------------- |
| `fallbackFlags`            | Values to use if flags can't be fetched                         |
| `enableLiveFlagUpdates`    | Update flags when they change in Reflag; default `false`        |
| `staleTimeMs`              | How long cached flags count as fresh; default `0`               |
| `staleWhileRevalidate`     | Use stale cached flags while fetching new ones; default `false` |
| `expireTimeMs`             | How long cached flags are kept; default 30 days                 |
| `timeoutMs`                | Flag request timeout; default 5,000 ms                          |
| `enableTracking`           | Set to `false` to stop sending checks and usage events          |
| `offline`                  | Make no network requests, for example in tests                  |
| `toolbar`, `feedback`      | Toolbar and feedback UI options                                 |
| `logger`                   | Custom logger                                                   |
| `apiBaseUrl`, `appBaseUrl` | Override the API and app URLs                                   |
| `credentials`              | Fetch credentials mode                                          |
| `storage`                  | Custom async storage for the flag cache                         |
| `eventSourceFactory`       | Custom EventSource implementation for runtimes without one      |
| `trackingQueue`            | Event batching: `flushDelayMs` and `maxSize`                    |

## Shut down

Call `await reflag.stop()` to send buffered events and close the client, for example when the user signs out.

## Content Security Policy (CSP)

If your site uses a strict Content Security Policy, allow:

| Directive     | Value                      | Reason                             |
| ------------- | -------------------------- | ---------------------------------- |
| `connect-src` | `https://front.reflag.com` | API requests and live updates      |
| `style-src`   | `'unsafe-inline'`          | The feedback UI uses inline styles |
