# Reflag Browser SDK

Basic client for [Reflag.com](https://reflag.com). If you're using React, you'll be better off with the Reflag React SDK.

Reflag supports flag toggling, tracking flag usage, [collecting feedback](#qualitative-feedback-on-beta-flags) on flags, and [remotely configuring flags](#remote-config).

## Install

First find your `publishableKey` under [environment settings](https://app.reflag.com/env-current/settings/app-environments) in Reflag.

The package can be imported or used directly in a HTML script tag:

A. Import module:

```typescript
import { ReflagClient } from "@reflag/browser-sdk";

const user = {
  id: 42,
  role: "manager",
};

const company = {
  id: 99,
  plan: "enterprise",
};

const reflagClient = new ReflagClient({ publishableKey, user, company });

await reflagClient.initialize();

const {
  isEnabled,
  config: { payload: question },
  track,
  requestFeedback,
} = reflagClient.getFlag("huddle");

if (isEnabled) {
  // Show flag. When retrieving `isEnabled` the client automatically
  // sends a "check" event for the "huddle" flag which is shown in the
  // Reflag UI.

  // On usage, call `track` to let Reflag know that a user interacted with the flag
  track();

  // The `payload` is a user-supplied JSON in Reflag that is dynamically picked
  // out depending on the user/company.
  const question = payload?.question ?? "Tell us what you think of Huddles";

  // Use `requestFeedback` to create "Send feedback" buttons easily for specific
  // flags. This is not related to `track` and you can call them individually.
  requestFeedback({ title: question });
}

// `track` just calls `reflagClient.track(<flagKey>)` to send an event using the same flag key
// You can also use `track` on the client directly to send any custom event.
reflagClient.track("huddle");

// similarly, `requestFeedback` just calls `reflagClient.requestFeedback({flagKey: <flagKey>})`
// which you can also call directly:
reflagClient.requestFeedback({ flagKey: "huddle" });
```

B. Script tag (client-side directly in html)

See [example/browser.html](https://github.com/reflagcom/javascript/tree/main/packages/browser-sdk/example/browser.html) for a working example:

```html
<script src="https://cdn.jsdelivr.net/npm/@reflag/browser-sdk@2"></script>
<script>
  const reflag = new ReflagBrowserSDK.ReflagClient({
    publishableKey: "publishableKey",
    user: { id: "42" },
    company: { id: "1" },
  });

  reflag.initialize().then(() => {
    console.log("Reflag initialized");
    document.getElementById("loading").style.display = "none";
    document.getElementById("start-huddle").style.display = "block";
  });
</script>
<span id="loading">Loading...</span>
<button
  id="start-huddle"
  style="display: none"
  onClick="reflag.track('Started huddle')"
>
  Click me
</button>
```

### Init options

Supply these to the constructor call:

```typescript
type Configuration = {
  logger: console; // by default only logs warn/error, by passing `console` you'll log everything
  apiBaseUrl?: "https://front.reflag.com";
  sseBaseUrl?: "https://livemessaging.bucket.co";
  feedback?: undefined; // See FEEDBACK.md
  enableTracking?: true; // set to `false` to stop sending track events and user/company updates to Reflag servers. Useful when you're impersonating a user
  fallbackFlags?:
    | string[]
    | Record<string, { key: string; payload: any } | true>; // Enable these flags if unable to contact reflag.com. Can be a list of flag keys or a record with configuration values
  timeoutMs?: number; // Timeout for fetching flags (default: 5000ms)
  staleWhileRevalidate?: boolean; // Revalidate in the background when cached flags turn stale to avoid latency in the UI (default: false)
  staleTimeMs?: number; // at initialization time flags are loaded from the cache unless they have gone stale. Defaults to 0 which means the cache is disabled. Increase this in the case of a non-SPA
  expireTimeMs?: number; // In case we're unable to fetch flags from Reflag, cached/stale flags will be used instead until they expire after `expireTimeMs`. Default is 30 days
  offline?: boolean; // Use the SDK in offline mode. Offline mode is useful during testing and local development
};
```

## Migrating from Bucket SDK

If you have been using the Bucket SDKs, the following list will help you migrate to Reflag SDK:

- `Bucket*` classes, and types have been renamed to `Reflag*` (e.g. `BucketClient` is now `ReflagClient`)
- `Feature*` classes, and types have been renamed to `Feature*` (e.g. `Feature` is now `Flag`, `RawFeatures` is now `RawFlags`)
- All methods that contained `feature` in the name have been renamed to use the `flag` terminology (e.g. `getFeature` is `getFlag`)
- The `fallbackFeatures` property in client constructor and configuration files has been renamed to `fallbackFlags`
- `featureKey` has been renamed to `flagKey` in all methods that accepts that argument
- The new cookies that are stored in the client's browser are now `reflag-*` prefixed instead og `bucket-*`
- The `featuresUpdated` hook has been renamed to `flagsUpdated`
- The `checkIsEnabled` and `checkConfig` hooks have been removed, use `check` from now on

To ease in transition to Reflag SDK, some of the old methods have been preserved as aliases to the new methods:

- `getFeature` method is an alias for `getFlag`
- `getFeatures` method is an alias for `getFlags`
- `featuresUpdated` hook is an alias for `flagsUpdated`

If you are running with strict Content Security Policies active on your website, you will need change them as follows:

- `connect-src https://front.bucket.co` to `connect-src https://front.reflag.com`

Finally, if you have customized the look & feel of the Feedback component, update `--bucket-feedback-*` CSS classes to `--reflag-feedback-*`

## Flag toggles

Reflag determines which flags are active for a given user/company. The user/company is given in the ReflagClient constructor.

If you supply `user` or `company` objects, they must include at least the `id` property otherwise they will be ignored in their entirety.
In addition to the `id`, you must also supply anything additional that you want to be able to evaluate flag targeting rules against.

Attributes cannot be nested (multiple levels) and must be either strings, integers or booleans.
Some attributes are special and used in Reflag UI:

- `name` -- display name for `user`/`company`,
- `email` -- is accepted for `user`s and will be highlighted in the Reflag UI if available,
- `avatar` -- can be provided for both `user` and `company` and should be an URL to an image.

```ts
const reflagClient = new ReflagClient({
  publishableKey,
  user: {
    id: "user_123",
    name: "John Doe",
    email: "john@acme.com"
    avatar: "https://example.com/images/udsy6363"
  },
  company: {
    id: "company_123",
    name: "Acme, Inc",
    avatar: "https://example.com/images/31232ds"
  },
});
```

To retrieve flags along with their targeting information, use `getFlag(key: string)`:

```ts
const huddle = reflagClient.getFlag("huddle");
// {
//   isEnabled: true,
//   config: { key: "zoom", payload: { ... } },
//   track: () => Promise<Response>
//   requestFeedback: (options: RequestFeedbackData) => void
// }
```

You can use `getFlags()` to retrieve all enabled flags currently.

```ts
const flags = reflagClient.getFlags();
// {
//   huddle: {
//     isEnabled: true,
//     targetingVersion: 42,
//     config: ...
//   }
// }
```

`getFlags()` is meant to be more low-level than `getFlag()` and it typically used
by down-stream clients, like the React SDK.

Note that accessing `isEnabled` on the object returned by `getFlags` does not automatically
generate a `check` event, contrary to the `isEnabled` property on the object returned by `getFlag`.

## Remote config

Remote config is a dynamic and flexible approach to configuring flag behavior outside of your app – without needing to re-deploy it.

Similar to `isEnabled`, each flag has a `config` property. This configuration is managed from within Reflag.
It is managed similar to the way access to flags is managed, but instead of the binary `isEnabled` you can have
multiple configuration values which are given to different user/companies.

```ts
const flags = reflagClient.getFlags();
// {
//   huddle: {
//     isEnabled: true,
//     targetingVersion: 42,
//     config: {
//       key: "gpt-3.5",
//       payload: { maxTokens: 10000, model: "gpt-3.5-beta1" }
//     }
//   }
// }
```

`key` is mandatory for a config, but if a flag has no config or no config value was matched against the context, the `key` will be `undefined`. Make sure to check against this case when trying to use the configuration in your application. `payload` is an optional JSON value for arbitrary configuration needs.

Just as `isEnabled`, accessing `config` on the object returned by `getFlags` does not automatically
generate a `check` event, contrary to the `config` property on the object returned by `getFlag`.

## Updating user/company/other context

Attributes given for the user/company/other context in the ReflagClient constructor can be updated for use in flag targeting evaluation with the `updateUser()`, `updateCompany()` and `updateOtherContext()` methods.
They return a promise which resolves once the flags have been re-evaluated follow the update of the attributes.

The following shows how to let users self-opt-in for a new flag. The flag must have the rule `voiceHuddleOptIn IS true` set in the Reflag UI.

```ts
// toggle opt-in for the voiceHuddle flag:
const { isEnabled } = reflagClient.getFlag("voiceHuddle");
// this toggles the flag on/off. The promise returns once flag targeting has been
// re-evaluated.
await reflagClient.updateUser({ voiceHuddleOptIn: (!isEnabled).toString() });
```

> [!NOTE] > `user`/`company` attributes are also stored remotely on the Reflag servers and will automatically be used to evaluate flag targeting if the page is refreshed.

## Toolbar

The Reflag Toolbar is great for toggling flags on/off for yourself to ensure that everything works both when a flag is on and when it's off.

<img width="352" alt="Toolbar screenshot" src="https://github.com/user-attachments/assets/c223df5a-4bd8-49a1-8b4a-ad7001357693" />

The toolbar will automatically appear on `localhost`. However, it can also be incredibly useful in production.
You have full control over when it appears through the `toolbar` configuration option passed to the `ReflagClient`.

You can pass a simple boolean to force the toolbar to appear/disappear:

```typescript
const client = new ReflagClient({
  // show the toolbar even in production if the user is an internal/admin user
  toolbar: user?.isInternal,
  ...
});
```

You can also configure the position of the toolbar on the screen:

```typescript
const client = new ReflagClient({
  toolbar: {
    show: true;
    position: {
      placement: "bottom-left",
      offset: {x: "1rem", y: "1rem"}
    }
  }
  ...
})
```

See [the reference](https://docs.reflag.com/supported-languages/browser-sdk/globals#toolbaroptions) for details.

## Qualitative feedback on beta flags

Reflag can collect qualitative feedback from your users in the form of a [Customer Satisfaction Score](https://en.wikipedia.org/wiki/Customer_satisfaction) and a comment.

### Automated feedback collection

The Reflag Browser SDK comes with automated feedback collection mode enabled by default, which lets the Reflag service ask your users for feedback for relevant flags just after they've used them.

> [!NOTE]
> To get started with automatic feedback collection, make sure you've set `user` in the `ReflagClient` constructor.

Automated feedback surveys work even if you're not using the SDK to send events to Reflag.
It works because the Reflag Browser SDK maintains a live connection to Reflag's servers and can automatically show a feedback prompt whenever the Reflag servers determines that an event should trigger a prompt - regardless of how this event is sent to Reflag.

You can find all the options to make changes to the default behavior in the [Reflag feedback documentation](./FEEDBACK.md).

### Reflag feedback UI

Reflag can assist you with collecting your user's feedback by offering a pre-built UI, allowing you to get started with minimal code and effort.

[Read the Reflag feedback UI documentation](./FEEDBACK.md)

### Reflag feedback SDK

Feedback can be submitted to Reflag using the SDK:

```ts
reflagClient.feedback({
  flagKey: "my-flag-key", // String (required), copy from Flag feedback tab
  score: 5, // Number: 1-5 (optional)
  comment: "Absolutely stellar work!", // String (optional)
});
```

### Reflag feedback API

If you are not using the Reflag Browser SDK, you can still submit feedback using the HTTP API.

See details in [Feedback HTTP API](https://docs.reflag.com/api/http-api#post-feedback)

## Tracking flag usage

The `track` function lets you send events to Reflag to denote flag usage.
By default Reflag expects event names to align with the flag keys, but
you can customize it as you wish.

```ts
reflagClient.track("huddle", { voiceHuddle: true });
```

## Event listeners

Event listeners allow for capturing various events occurring in the `ReflagClient`. This is useful to build integrations with other system or for various debugging purposes. There are 5 kinds of events:

- `check`: Your code used `isEnabled` or `config` for a flag
- `flagsUpdated`: Flags were updated. Either because they were loaded as part of initialization or because the user/company updated
- `user`: User information updated (similar to the `identify` call used in tracking terminology)
- `company`: Company information updated (sometimes to the `group` call used in tracking terminology)
- `track`: Track event occurred.

Use the `on()` method to add an event listener to respond to certain events. See the API reference for details on each hook.

```ts
import { ReflagClient, CheckEvent, RawFlags } from "@reflag/browser-sdk";

const client = new ReflagClient({
  // options
});

// or add the hooks after construction:
const unsub = client.on("check", (check: CheckEvent) =>
  console.log(`Check event ${check}`),
);
// use the returned function to unsubscribe, or call `off()` with the same arguments again
unsub();
```

## Zero PII

The Reflag Browser SDK doesn't collect any metadata and HTTP IP addresses are _not_ being stored.

For tracking individual users, we recommend using something like database ID as userId, as it's unique and doesn't include any PII (personal identifiable information). If, however, you're using e.g. email address as userId, but prefer not to send any PII to Reflag, you can hash the sensitive data before sending it to Reflag:

```ts
import reflag from "@reflag/browser-sdk";
import { sha256 } from "crypto-hash";

reflag.user(await sha256("john_doe"));
```

## Use of cookies

The Reflag Browser SDK uses a couple of cookies to support automated feedback surveys. These cookies are not used for tracking purposes and thus should not need to appear in cookie consent forms.

The two cookies are:

- `reflag-prompt-${userId}`: store the last automated feedback prompt message ID received to avoid repeating surveys
- `reflag-token-${userId}`: caching a token used to connect to Reflag's live messaging infrastructure that is used to deliver automated feedback surveys in real time.

## TypeScript

Types are bundled together with the library and exposed automatically when importing through a package manager.

## Content Security Policy (CSP)

If you are running with strict Content Security Policies active on your website, you will need to enable these directives in order to use the SDK:

| Directive   | Values                                                             | Reason                                                                                                                                |
| ----------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| connect-src | [https://front.reflag.com](https://front.reflag.com)               | Basic functionality`                                                                                                                  |
| connect-src | [https://livemessaging.bucket.co](https://livemessaging.bucket.co) | Server sent events for use in automated feedback surveys, which allows for automatically collecting feedback when a user used a flag. |
| style-src   | 'unsafe-inline'                                                    | The feedback UI is styled with inline styles. Not having this directive results unstyled HTML elements.                               |

If you are including the Reflag tracking SDK with a `<script>`-tag from `jsdelivr.net` you will also need:

| Directive       | Values                                               | Reason                          |
| --------------- | ---------------------------------------------------- | ------------------------------- |
| script-src-elem | [https://cdn.jsdelivr.net](https://cdn.jsdelivr.net) | Loads the Reflag SDK from a CDN |

## License

> MIT License
> Copyright (c) 2025 Bucket ApS
