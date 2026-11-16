# Reflag Browser SDK

Feature flags, remote configuration, usage tracking and feedback for browser applications.

## Get started

Install the SDK:

```sh
npm install @reflag/browser-sdk
```

Create a client with your **publishable** key and the signed-in user's context, then read a flag:

```ts
import { ReflagClient } from "@reflag/browser-sdk";

const reflag = new ReflagClient({
  publishableKey: "your-publishable-key",
  user: { id: "alice", role: "manager" },
  company: { id: "acme", plan: "enterprise" },
});
await reflag.initialize();

if (reflag.getFlag("huddles")) {
  await reflag.track("Started huddle");
}
```

Publishable keys are safe to ship to the browser. Keep secret keys on your server.

## Read flags

Without a default, `getFlag()` returns a Boolean. You get `false` if the flag is missing or isn't a Boolean:

```ts
const enabled = reflag.getFlag("huddles"); // boolean
```

To read a configuration value, pass a default. The return type follows the default, and you get the default back if the flag is missing or holds a different type of value:

```ts
const model = reflag.getFlag("model", "quick"); // string
const limit = reflag.getFlag("limit", 10); // number
const settings = reflag.getFlag("assistant-settings", { model: "quick" }); // { model: string }
```

Pass `null` to accept any JSON value, then narrow it yourself:

```ts
const value = reflag.getFlag("nullable-settings", null);
```

The SDK checks only the top-level type of a value. If your application depends on nested fields, validate them.

`getFlags()` returns all flag values as a record. Reading a flag records a check, even if you don't use the value. Reflag uses checks for launch monitoring.

## Track usage and feedback

```ts
await reflag.track("Started huddle", { button: "cta" });
reflag.requestFeedback({ flagKey: "huddles", title: "How did it go?" });
```

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

Pass the whole object returned by `getFlagsForBootstrap()`, serialized with your framework's usual mechanism. Leave secrets and server-only attributes out of the context you bootstrap, because the browser can read it.

Later refreshes evaluate flags using the browser's context. If values that depend on server-only attributes must not change, disable live updates.

## Let users opt in to flags

```ts
const optInFlags = reflag.getOptInFlags();
await reflag.setOptIn("huddles", { optedIn: true });
await reflag.setOptIn("huddles", { optedIn: false, scope: "company" });
```

Each entry includes the flag's `key`, `name`, `description` and whether the user or company has opted in. User and company opt-ins are independent. Use `getIsLoadingOptInFlags()` and the `optInFlagsLoadingUpdated` event to show a loading state.

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

Call `await reflag.stop()` to send buffered events and close the client.

## Content Security Policy (CSP)

If your site uses a strict Content Security Policy, allow:

| Directive     | Value                      | Reason                             |
| ------------- | -------------------------- | ---------------------------------- |
| `connect-src` | `https://front.reflag.com` | API requests and live updates      |
| `style-src`   | `'unsafe-inline'`          | The feedback UI uses inline styles |
