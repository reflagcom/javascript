# Reflag Node.js SDK

Node.js, JavaScript/TypeScript client for [Reflag.com](https://reflag.com).

Reflag supports flag toggling, tracking flag usage, collecting feedback on features, and [remotely configuring flags](#remote-config).

## Installation

Install using your favorite package manager:

{% tabs %}
{% tab title="npm" %}

```sh
npm i @reflag/node-sdk
```

{% endtab %}

{% tab title="yarn" %}

```sh
yarn add @reflag/node-sdk
```

{% endtab %}

{% tab title="bun" %}

```sh
bun add @reflag/node-sdk
```

{% endtab %}

{% tab title="pnpm" %}

```sh
pnpm add @reflag/node-sdk
```

{% endtab %}

{% tab title="deno" %}

```sh
deno add npm:@reflag/node-sdk
```

{% endtab %}
{% endtabs %}

Other supported languages/frameworks are in the [Supported languages](https://docs.reflag.com/quickstart/supported-languages) documentation pages.

You can also [use the HTTP API directly](https://docs.reflag.com/api/http-api)

## Migrating from Bucket SDK

If you have been using the Bucket SDKs, the following list will help you migrate to Reflag SDK:

- `Bucket*` classes, and types have been renamed to `Reflag*` (e.g. `BucketClient` is now `ReflagClient`)
- `Feature*` classes, and types have been renamed to `Feature*` (e.g. `Feature` is now `Flag`, `RawFeatures` is now `RawFlags`)
- When using strongly-typed flags, the new `Flags` interface replaced `Features` interface
- All methods that contained `feature` in the name have been renamed to use the `flag` terminology (e.g. `getFeature` is `getFlag`)
- All environment variables that were prefixed with `BUCKET_` are now prefixed with `REFLAG_`
- The `BUCKET_HOST` environment variable and `host` option have been removed from `ReflagClient` constructor, use `REFLAG_API_BASE_URL` instead
- The `BUCKET_FEATURES_ENABLED` and `BUCKET_FEATURES_DISABLED` have been renamed to `REFLAG_FLAGS_ENABLED` and `REFLAG_FLAGS_DISABLED`
- The default configuration file has been renamed from `bucketConfig.json` to `reflag.config.json`
- The `fallbackFeatures` property in client constructor and configuration files has been renamed to `fallbackFlags`
- `featureKey` has been renamed to `flagKey` in all methods that accepts that argument
- The SDKs will not emit `evaluate` and `evaluate-config` events anymore

## Basic usage

To get started you need to obtain your secret key from the [environment settings](https://app.reflag.com/env-current/settings/app-environments)
in Reflag.

> [!CAUTION]
> Secret keys are meant for use in server side SDKs only. Secret keys offer the users the ability to obtain
> information that is often sensitive and thus should not be used in client-side applications.

Reflag will load settings through the various environment variables automatically (see [Configuring](#configuring) below).

1. Find the Reflag secret key for your development environment under [environment settings](https://app.reflag.com/env-current/settings/app-environments) in Reflag.
2. Set `REFLAG_SECRET_KEY` in your `.env` file
3. Create a `reflag.ts` file containing the following:

```typescript
import { ReflagClient } from "@reflag/node-sdk";

// Create a new instance of the client with the secret key. Additional options
// are available, such as supplying a logger and other custom properties.
//
// We recommend that only one global instance of `client` should be created
// to avoid multiple round-trips to our servers.
export const reflagClient = new ReflagClient();

// Initialize the client and begin fetching flag targeting definitions.
// You must call this method prior to any calls to `getFlags()`,
// otherwise an empty object will be returned.
reflagClient.initialize().then({
  console.log("Reflag initialized!")
})
```

Once the client is initialized, you can obtain flags along with the `isEnabled`
status to indicate whether the flag is targeted for this user/company:

> [!IMPORTANT]
> If `user.id` or `company.id` is not given, the whole `user` or `company` object is ignored.

```typescript
// configure the client
const boundClient = reflagClient.bindClient({
  user: {
    id: "john_doe",
    name: "John Doe",
    email: "john@acme.com",
    avatar: "https://example.com/users/jdoe",
  },
  company: {
    id: "acme_inc",
    name: "Acme, Inc.",
    avatar: "https://example.com/companies/acme",
  },
});

// get the huddle flag using company, user and custom context to
// evaluate the targeting.
const { isEnabled, track, config } = boundClient.getFlag("huddle");

if (isEnabled) {
  // this is your flag gated code ...
  // send an event when the flag is used:
  track();

  if (config?.key === "zoom") {
    // this code will run if a given remote configuration
    // is set up.
  }

  // CAUTION: if you plan to use the event for automated feedback surveys
  // call `flush` immediately after `track`. It can optionally be awaited
  // to guarantee the sent happened.
  boundClient.flush();
}
```

You can also use the `getFlags()` method which returns a map of all flags:

```typescript
// get the current flags (uses company, user and custom context to
// evaluate the flags).
const flags = boundClient.getFlags();
const bothEnabled = flags.huddle?.isEnabled && flags.voiceHuddle?.isEnabled;
```

## High performance flag targeting

The SDK contacts the Reflag servers when you call `initialize()`
and downloads the flags with their targeting rules.
These rules are then matched against the user/company information you provide
to `getFlags()` (or through `bindClient(..).getFlags()`). That means the
`getFlags()` call does not need to contact the Reflag servers once
`initialize()` has completed. `ReflagClient` will continue to periodically
download the targeting rules from the Reflag servers in the background.

### Batch Operations

The SDK automatically batches operations like user/company updates and flag tracking events to minimize API calls.
The batch buffer is configurable through the client options:

```typescript
const client = new ReflagClient({
  batchOptions: {
    maxSize: 100, // Maximum number of events to batch
    intervalMs: 1000, // Flush interval in milliseconds
  },
});
```

You can manually flush the batch buffer at any time:

```typescript
await client.flush();
```

> [!TIP]
> It's recommended to call `flush()` before your application shuts down to ensure all events are sent.

### Rate Limiting

The SDK includes automatic rate limiting for flag events to prevent overwhelming the API.
Rate limiting is applied per unique combination of flag key and context. The rate limiter window size is configurable:

```typescript
const client = new ReflagClient({
  rateLimiterOptions: {
    windowSizeMs: 60000, // Rate limiting window size in milliseconds
  },
});
```

### Flag definitions

Flag definitions include the rules needed to determine which flags should be enabled and which config values should be applied to any given user/company.
Flag definitions are automatically fetched when calling `initialize()`.
They are then cached and refreshed in the background.
It's also possible to get the currently in use flag definitions:

```typescript
import fs from "fs";

const client = new ReflagClient();

const flagDefs = await client.getFlagDefinitions();
// [{
//   key: "huddle",
//   description: "Live voice conversations with colleagues."
//   flag: { ... }
//   config: { ... }
// }]
```

## Edge-runtimes like Cloudflare Workers

To use the Reflag NodeSDK with Cloudflare workers, set the `node_compat` flag [in your wrangler file](https://developers.cloudflare.com/workers/runtime-apis/nodejs/#get-started).

Instead of using `ReflagClient`, use `EdgeClient` and make sure you call `ctx.waitUntil(reflag.flush());` before returning from your worker function.

```typescript
import { EdgeClient } from "@reflag/node-sdk";

// set the REFLAG_SECRET_KEY environment variable or pass the secret key in the constructor
const reflag = new EdgeClient();

export default {
  async fetch(request, _env, ctx): Promise<Response> {
    // initialize the client and wait for it to complete
    // if the client was initialized on a previous invocation, this is a no-op.
    await reflag.initialize();
    const flags = reflag.getFlags({
      user: { id: "userId" },
      company: { id: "companyId" },
    });

    // ensure all events are flushed and any requests to refresh the flag cache
    // have completed after the response is sent
    ctx.waitUntil(reflag.flush());

    return new Response(
      `Flags for user ${userId} and company ${companyId}: ${JSON.stringify(flags, null, 2)}`,
    );
  },
};
```

See [examples/cloudflare-worker](examples/cloudflare-worker/src/index.ts) for a deployable example.

Reflag maintains a cached set of flag definitions in the memory of your worker which it uses to decide which flags to turn on for which users/companies.

The SDK caches flag definitions in memory for fast performance. The first request to a new worker instance fetches definitions from Reflag's servers, while subsequent requests use the cache. When the cache expires, it's updated in the background. `ctx.waitUntil(reflag.flush())` ensures completion of the background work, so response times are not affected. This background work may increase wall-clock time for your worker, but it will not measurably increase billable CPU time on platforms like Cloudflare.

## Error Handling

The SDK is designed to fail gracefully and never throw exceptions to the caller. Instead, it logs errors and provides
fallback behavior:

1. **Flag Evaluation Failures**:

   ```typescript
   const { isEnabled } = client.getFlag("my-flag");
   // If flag evaluation fails, isEnabled will be false
   ```

2. **Network Errors**:

   ```typescript
   // Network errors during tracking are logged but don't affect your application
   const { track } = client.getFlag("my-flag");
   if (isEnabled) {
     try {
       await track();
     } catch (error) {
       // The SDK already logged this error
       // Your application can continue normally
     }
   }
   ```

3. **Missing Context**:

   ```typescript
   // The SDK tracks missing context fields but continues operation
   const flags = client.getFlags({
     user: { id: "user123" },
     // Missing company context will be logged but won't cause errors
   });
   ```

4. **Offline Mode**:

   ```typescript
   // In offline mode, the SDK uses flag overrides
   const client = new ReflagClient({
     offline: true,
     flagOverrides: () => ({
       "my-flag": true,
     }),
   });
   ```

The SDK logs all errors with appropriate severity levels. You can customize logging by providing your own logger:

```typescript
const client = new ReflagClient({
  logger: {
    debug: (msg) => console.debug(msg),
    info: (msg) => console.info(msg),
    warn: (msg) => console.warn(msg),
    error: (msg, error) => {
      console.error(msg, error);
      // Send to your error tracking service
      errorTracker.capture(error);
    },
  },
});
```

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

## Configuring

The Reflag `Node.js` SDK can be configured through environment variables,
a configuration file on disk or by passing options to the `ReflagClient`
constructor. By default, the SDK searches for `reflag.config.json` in the
current working directory.

| Option          | Type                    | Description                                                                                                                                                                                                                                         | Env Var                                     |
| --------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `secretKey`     | string                  | The secret key used for authentication with Reflag's servers.                                                                                                                                                                                       | REFLAG_SECRET_KEY                           |
| `logLevel`      | string                  | The log level for the SDK (e.g., `"DEBUG"`, `"INFO"`, `"WARN"`, `"ERROR"`). Default: `INFO`                                                                                                                                                         | REFLAG_LOG_LEVEL                            |
| `offline`       | boolean                 | Operate in offline mode. Default: `false`, except in tests it will default to `true` based off of the `TEST` env. var.                                                                                                                              | REFLAG_OFFLINE                              |
| `apiBaseUrl`    | string                  | The base API URL for the Reflag servers.                                                                                                                                                                                                            | REFLAG_API_BASE_URL                         |
| `flagOverrides` | Record<string, boolean> | An object specifying flag overrides for testing or local development. See [examples/express/app.test.ts](https://github.com/reflagcom/javascript/tree/main/packages/node-sdk/examples/express/app.test.ts) for how to use `flagOverrides` in tests. | REFLAG_FLAGS_ENABLED, REFLAG_FLAGS_DISABLED |
| `configFile`    | string                  | Load this config file from disk. Default: `reflag.config.json`                                                                                                                                                                                      | REFLAG_CONFIG_FILE                          |

> [!NOTE] > `REFLAG_FLAGS_ENABLED` and `REFLAG_FLAGS_DISABLED` are comma separated lists of flags which will be enabled or disabled respectively.

`reflag.config.json` example:

```json
{
  "secretKey": "...",
  "logLevel": "warn",
  "offline": true,
  "apiBaseUrl": "https://proxy.slick-demo.com",
  "flagOverrides": {
    "huddles": true,
    "voiceChat": { "isEnabled": false },
    "aiAssist": {
      "isEnabled": true,
      "config": {
        "key": "gpt-4.0",
        "payload": {
          "maxTokens": 50000
        }
      }
    }
  }
}
```

When using a `reflag.config.json` for local development, make sure you add it to your
`.gitignore` file. You can also set these options directly in the `ReflagClient`
constructor. The precedence for configuration options is as follows, listed in the
order of importance:

1. Options passed along to the constructor directly,
2. Environment variable,
3. The config file.

## Type safe flags

To get type checked flags, install the Reflag CLI:

```sh
npm i --save-dev @reflag/cli
```

then generate the types:

```sh
npx reflag flags types
```

This will generate a `reflag.d.ts` containing all your flags.
Any flag look ups will now be checked against the flags that exist in Reflag.

Here's an example of a failed type check:

```typescript
import { ReflagClient } from "@reflag/node-sdk";

export const reflagClient = new ReflagClient();

reflagClient.initialize().then(() => {
  console.log("Reflag initialized!");

  // TypeScript will catch this error: "invalid-flag" doesn't exist
  reflagClient.getFlag("invalid-flag");

  const {
    isEnabled,
    config: { payload },
  } = reflagClient.getFlag("create-todos");
});
```

![Type check failed](docs/type-check-failed.png "Type check failed")

This is an example of a failed config payload check:

```typescript
reflagClient.initialize().then(() => {
  // TypeScript will catch this error as well: "minLength" is not part of the payload.
  if (isEnabled && todo.length > config.payload.minLength) {
    // ...
  }
});
```

![Config type check failed](docs/type-check-payload-failed.png "Remote config type check failed")

## Testing

When writing tests that cover code with flags, you can toggle flags on/off programmatically to test the different behavior.

`reflag.ts`:

```typescript
import { ReflagClient } from "@reflag/node-sdk";

export const reflag = new ReflagClient();
```

`app.test.ts`:

```typescript
import { reflag } from "./reflag.ts";

beforeAll(async () => await reflag.initialize());
afterEach(() => {
  reflag.clearFlagOverrides();
});

describe("API Tests", () => {
  it("should return 200 for the root endpoint", async () => {
    reflag.flagOverrides = {
      "show-todo": true,
    };

    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Ready to manage some TODOs!" });
  });
});
```

See more on flag overrides in the section below.

## Flag Overrides

Flag overrides allow you to override flags and their configurations locally. This is particularly useful for development and testing. You can specify overrides in three ways:

1. Through environment variables:

```bash
REFLAG_FLAGS_ENABLED=flag1,flag2
REFLAG_FLAGS_DISABLED=flag3,flag4
```

1. Through `reflag.config.json`:

```json
{
  "flagOverrides": {
    "delete-todos": {
      "isEnabled": true,
      "config": {
        "key": "dev-config",
        "payload": {
          "requireConfirmation": true,
          "maxDeletionsPerDay": 5
        }
      }
    }
  }
}
```

1. Programmatically through the client options:

You can use a simple `Record<string, boolean>` and pass it either in the constructor or by setting `client.flagOverrides`:

```typescript
// pass directly in the constructor
const client = new ReflagClient({ flagOverrides: { myFlag: true } });
// or set on the client at a later time
client.flagOverrides = { myFlag: false };

// clear flag overrides. Same as setting to {}.
client.clearFlagOverrides();
```

To get dynamic overrides, use a function which takes a context and returns a boolean or an object with the shape of `{isEnabled, config}`:

```typescript
import { ReflagClient, Context } from "@reflag/node-sdk";

const flagOverrides = (context: Context) => ({
  "delete-todos": {
    isEnabled: true,
    config: {
      key: "dev-config",
      payload: {
        requireConfirmation: true,
        maxDeletionsPerDay: 5,
      },
    },
  },
});

const client = new ReflagClient({
  flagOverrides,
});
```

## Remote Flag Evaluation

In addition to local flag evaluation, Reflag supports remote evaluation using stored context. This is useful when you want to evaluate flags using user/company attributes that were previously sent to Reflag:

```typescript
// First, update user and company attributes
await client.updateUser("user123", {
  attributes: {
    role: "admin",
    subscription: "premium",
  },
});

await client.updateCompany("company456", {
  attributes: {
    tier: "enterprise",
    employees: 1000,
  },
});

// Later, evaluate flags remotely using stored context
const flags = await client.getFlagsRemote("company456", "user123");
// Or evaluate a single flag
const flag = await client.getFlagRemote(
  "create-todos",
  "company456",
  "user123",
);

// You can also provide additional context
const flagsWithContext = await client.getFlagsRemote("company456", "user123", {
  other: {
    location: "US",
    platform: "mobile",
  },
});
```

Remote evaluation is particularly useful when:

- You want to use the most up-to-date user/company attributes stored in Reflag
- You don't want to pass all context attributes with every evaluation
- You need to ensure consistent flag evaluation across different services

## Using with Express

A popular way to integrate the Reflag Node.js SDK is through an express middleware.

```typescript
import reflag from "./reflag";
import express from "express";
import { BoundReflagClient } from "@reflag/node-sdk";

// Augment the Express types to include a `boundReflagClient` property on the
// `res.locals` object.
// This will allow us to access the ReflagClient instance in our route handlers
// without having to pass it around manually
declare global {
  namespace Express {
    interface Locals {
      boundReflagClient: BoundReflagClient;
    }
  }
}

// Add express middleware
app.use((req, res, next) => {
  // Extract the user and company IDs from the request
  // You'll want to use a proper authentication and identification
  // mechanism in a real-world application
  const user = {
    id: req.user?.id,
    name: req.user?.name
    email: req.user?.email
  }

  const company = {
    id: req.user?.companyId
    name: req.user?.companyName
  }

  // Create a new BoundReflagClient instance by calling the `bindClient`
  // method on a `ReflagClient` instance
  // This will create a new instance that is bound to the user/company given.
  const boundReflagClient = reflag.bindClient({ user, company });

  // Store the BoundReflagClient instance in the `res.locals` object so we
  // can access it in our route handlers
  res.locals.boundReflagClient = boundReflagClient;
  next();
});

// Now use res.locals.boundReflagClient in your handlers
app.get("/todos", async (_req, res) => {
  const { track, isEnabled } = res.locals.reflagUser.getFlag("show-todos");

  if (!isEnabled) {
    res.status(403).send({"error": "flag inaccessible"})
    return
  }

  ...
}
```

See [examples/express/app.ts](https://github.com/reflagcom/javascript/tree/main/packages/node-sdk/example/express/app.ts) for a full example.

## Remote flag evaluation with stored context

If you don't want to provide context each time when evaluating flags but
rather you would like to utilize the attributes you sent to Reflag previously
(by calling `updateCompany` and `updateUser`) you can do so by calling `getFlagsRemote`
(or `getFlagRemote` for a specific flag) with providing just `userId` and `companyId`.
These methods will call Reflag's servers and flags will be evaluated remotely
using the stored attributes.

```typescript
// Update user and company attributes
client.updateUser("john_doe", {
  attributes: {
    name: "John O.",
    role: "admin",
  },
});

client.updateCompany("acme_inc", {
  attributes: {
    name: "Acme, Inc",
    tier: "premium"
  },
});
...

// This will evaluate flags with respecting the attributes sent previously
const flags = await client.getFlagsRemote("acme_inc", "john_doe");
```

> [!IMPORTANT]
> User and company attribute updates are processed asynchronously, so there might
> be a small delay between when attributes are updated and when they are available
> for evaluation.

## Opting out of tracking

There are use cases in which you not want to be sending `user`, `company` and
`track` events to [Reflag.com](https://reflag.com). These are usually cases where you could be impersonating
another user in the system and do not want to interfere with the data being
collected by Reflag.

To disable tracking, bind the client using `bindClient()` as follows:

```typescript
// binds the client to a given user and company and set `enableTracking` to `false`.
const boundClient = client.bindClient({ user, company, enableTracking: false });

boundClient.track("some event"); // this will not actually send the event to Reflag.

// the following code will not update the `user` nor `company` in Reflag and will
// not send `track` events either.
const { isEnabled, track } = boundClient.getFlag("user-menu");
if (isEnabled) {
  track();
}
```

Another way way to disable tracking without employing a bound client is to call `getFlag()`
or `getFlags()` by supplying `enableTracking: false` in the arguments passed to
these functions.

> [!IMPORTANT]
> Note, however, that calling `track()`, `updateCompany()` or `updateUser()` in the `ReflagClient`
> will still send tracking data. As such, it is always recommended to use `bindClient()`
> when using this SDK.

## Flushing

ReflagClient employs a batching technique to minimize the number of calls that are sent to
Reflag's servers.

By default, the SDK automatically subscribes to process exit signals and attempts to flush
any pending events. This behavior is controlled by the `flushOnExit` option in the client configuration:

```typescript
const client = new ReflagClient({
  batchOptions: {
    flushOnExit: false, // disable automatic flushing on exit
  },
});
```

## Tracking custom events and setting custom attributes

Tracking allows events and updating user/company attributes in Reflag.
For example, if a customer changes their plan, you'll want Reflag to know about it,
in order to continue to provide up-do-date targeting information in the Reflag interface.

The following example shows how to register a new user, associate it with a company
and finally update the plan they are on.

```typescript
// registers the user with Reflag using the provided unique ID, and
// providing a set of custom attributes (can be anything)
client.updateUser("user_id", {
  attributes: { longTimeUser: true, payingCustomer: false },
});
client.updateCompany("company_id", { userId: "user_id" });

// the user started a voice huddle
client.track("user_id", "huddle", { attributes: { voice: true } });
```

It's also possible to achieve the same through a bound client in the following manner:

```typescript
const boundClient = client.bindClient({
  user: { id: "user_id", longTimeUser: true, payingCustomer: false },
  company: { id: "company_id" },
});

boundClient.track("huddle", { attributes: { voice: true } });
```

Some attributes are used by Reflag to improve the UI, and are recommended
to provide for easier navigation:

- `name` -- display name for `user`/`company`,
- `email` -- the email of the user,
- `avatar` -- the URL for `user`/`company` avatar image.

Attributes cannot be nested (multiple levels) and must be either strings,
integers or booleans.

## Managing `Last seen`

By default `updateUser`/`updateCompany` calls automatically update the given
user/company `Last seen` property on Reflag servers.

You can control if `Last seen` should be updated when the events are sent by setting
`meta.active = false`. This is often useful if you
have a background job that goes through a set of companies just to update their
attributes but not their activity.

Example:

```typescript
client.updateUser("john_doe", {
  attributes: { name: "John O." },
  meta: { active: true },
});

client.updateCompany("acme_inc", {
  attributes: { name: "Acme, Inc" },
  meta: { active: false },
});
```

`bindClient()` updates attributes on the Reflag servers but does not automatically
update `Last seen`.

## Zero PII

The Reflag SDK doesn't collect any metadata and HTTP IP addresses are _not_ being
stored. For tracking individual users, we recommend using something like database
ID as userId, as it's unique and doesn't include any PII (personal identifiable
information). If, however, you're using e.g. email address as userId, but prefer
not to send any PII to Reflag, you can hash the sensitive data before sending
it to Reflag:

```typescript
import { sha256 } from 'crypto-hash';

client.updateUser({ userId: await sha256("john_doe"), ... });
```

## Typescript

Types are bundled together with the library and exposed automatically when importing
through a package manager.

## License

> MIT License
> Copyright (c) 2025 Bucket ApS
