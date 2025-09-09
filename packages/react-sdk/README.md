# Reflag React SDK

React client side library for [Reflag.com](https://reflag.com)

Reflag supports flag toggling, tracking flag usage, [requesting feedback](#userequestfeedback) on features, and [remotely configuring flags](#remote-config).

The Reflag React SDK comes with a [built-in toolbar](https://docs.reflag.com/supported-languages/browser-sdk#toolbar) which appears on `localhost` by default.

## Install

Install via npm:

```shell
npm i @reflag/react-sdk
```

## Migrating from Bucket SDK

If you have been using the Bucket SDKs, the following list will help you migrate to Reflag SDK:

- `Bucket*` classes, and types have been renamed to `Reflag*` (e.g. `BucketClient` is now `ReflagClient`)
- `Feature*` classes, and types have been renamed to `Feature*` (e.g. `Feature` is now `Flag`, `RawFeatures` is now `RawFlags`)
- When using strongly-typed flags, the new `Flags` interface replaced `Features` interface
- All methods that contained `feature` in the name have been renamed to use the `flag` terminology (e.g. `getFeature` is `getFlag`)
- The `fallbackFeatures` property in client constructor and configuration files has been renamed to `fallbackFlags`
- `featureKey` has been renamed to `flagKey` in all methods that accepts that argument
- The SDKs will not emit `evaluate` and `evaluate-config` events anymore
- The new cookies that are stored in the client's browser are now `reflag-*` prefixed instead og `bucket-*`
- The `featuresUpdated` hook has been renamed to `flagsUpdated`
- The `checkIsEnabled` and `checkConfig` hooks have been removed, use `check` from now on

To ease in transition to Reflag SDK, some of the old methods have been preserved as aliases to the new methods:

- `getFeature` method is an alias for `getFlag`
- `getFeatures` method is an alias for `getFlags`
- `useFeature` method is an alias for `useFlag`
- `featuresUpdated` hook is an alias for `flagsUpdated`

If you are running with strict Content Security Policies active on your website, you will need change them as follows:

- `connect-src https://front.bucket.co` to `connect-src https://front.reflag.com`

## Get started

### 1. Add the `ReflagProvider` context provider

Add the `ReflagProvider` context provider to your application:

**Example:**

```tsx
import { ReflagProvider } from "@reflag/react-sdk";

<ReflagProvider
  publishableKey="{YOUR_PUBLISHABLE_KEY}"
  company={{ id: "acme_inc", plan: "pro" }}
  user={{ id: "john doe" }}
  loadingComponent={<Loading />}
>
  {/* children here are shown when loading finishes or immediately if no `loadingComponent` is given */}
</ReflagProvider>;
```

### 2. Create a new flag and set up type safety

Install the Reflag CLI:

```shell
npm i --save-dev @reflag/cli
```

Run `npx reflag new` to create your first flag!
On the first run, it will sign into Reflag and set up type generation for your project:

```shell
❯ npx reflag new
Opened web browser to facilitate login: https://app.reflag.com/api/oauth/cli/authorize

Welcome to ◪ Reflag!

? Where should we generate the types? gen/flags.d.ts
? What is the output format? react
✔ Configuration created at reflag.config.json.

Creating flag for app Slick app.
? New flag name: Huddle
? New flag key: huddle
✔ Created flag Huddle with key huddle (https://app.reflag.com/features/huddles)
✔ Generated react types in gen/flags.d.ts.
```

> [!Note]
> By default, types will be generated in `gen/flags.d.ts`.
> The default `tsconfig.json` file `include`s this file by default, but if your `tsconfig.json` is different, make sure the file is covered in the `include` property.

### 3. Use `useFlag(<flagKey>)` to get flag status

Using the `useFlag` hook from your components lets you toggle flags on/off and track flag usage:

**Example:**

```tsx
function StartHuddleButton() {
  const {
    isEnabled, // boolean indicating if the flag is enabled
    track, // track usage of the flag
  } = useFlag("huddle");

  if (!isEnabled) {
    return null;
  }

  return <button onClick={track}>Start huddle!</button>;
}
```

`useFlag` can help you do much more. See a full example for `useFlag` [see below](#useflag).

## Setting `user` and `company`

Reflag determines which flags are active for a given `user`, `company`, or `otherContext`.
You pass these to the `ReflagProvider` as props.

If you supply `user` or `company` objects, they must include at least the `id` property otherwise they will be ignored in their entirety.
In addition to the `id`, you must also supply anything additional that you want to be able to evaluate flag targeting rules against.
Attributes which are not properties of the `user` or `company` can be supplied using the `otherContext` prop.

Attributes cannot be nested (multiple levels) and must be either strings, numbers or booleans.
A number of special attributes exist:

- `name` -- display name for `user`/`company`,
- `email` -- the email of the user,
- `avatar` -- the URL for `user`/`company` avatar image.

```tsx
 <ReflagProvider
    publishableKey={YOUR_PUBLISHABLE_KEY}
    user={{ id: "user_123", name: "John Doe", email: "john@acme.com" }}
    company={{ id: "company_123", name: "Acme, Inc" }}
    otherContext={{ completedSteps: [1, 4, 7] }}
  >
    <LoadingReflag>
    {/* children here are shown when loading finishes */}
    </LoadingReflag>
  <ReflagProvider>
```

To retrieve flags along with their targeting information, use `useFlag(key: string)` hook (described in a section below).

Note that accessing `isEnabled` on the object returned by `useFlag()` automatically
generates a `check` event.

## Remote config

Remote config is a dynamic and flexible approach to configuring flag behavior outside of your app – without needing to re-deploy it.

Similar to `isEnabled`, each flag accessed using the `useFlag()` hook, has a `config` property. This configuration is managed from within Reflag. It is managed similar to the way access to flags is managed, but instead of the
binary `isEnabled` you can have multiple configuration values which are given to different user/companies.

### Get started with Remote config

1. Update your flag definitions:

```typescript
import "@reflag/react-sdk";

// Define your flags by extending the `Flags` interface in @reflag/react-sdk
declare module "@reflag/react-sdk" {
  interface Flags {
    huddle: {
      // change from `boolean` to an object which sets
      // a type for the remote config for `questionnaire`
      maxTokens: number;
      model: string;
    };
  }
}
```

```ts
const {
  isEnabled,
  config: { key, payload },
} = useFlag("huddles");

// isEnabled: true,
// key: "gpt-3.5",
// payload: { maxTokens: 10000, model: "gpt-3.5-beta1" }
```

`key` is mandatory for a config, but if a flag has no config or no config value was matched against the context, the `key` will be `undefined`. Make sure to check against this case when trying to use the configuration in your application. `payload` is an optional JSON value for arbitrary configuration needs.

Note that, similar to `isEnabled`, accessing `config` on the object returned by `useFlag()` automatically
generates a `check` event.

## `<ReflagProvider>` component

The `<ReflagProvider>` initializes the Reflag SDK, fetches flags and starts listening for automated feedback survey events. The component can be configured using a number of props:

- `publishableKey` is used to connect the provider to an _environment_ on Reflag. Find your `publishableKey` under [environment settings](https://app.reflag.com/env-current/settings/app-environments) in Reflag,
- `company`, `user` and `otherContext` make up the _context_ that is used to determine if a flag is enabled or not. `company` and `user` contexts are automatically transmitted to Reflag servers so the Reflag app can show you which companies have access to which flags etc.
  > [!Note]
  > If you specify `company` and/or `user` they must have at least the `id` property, otherwise they will be ignored in their entirety. You should also supply anything additional you want to be able to evaluate flag targeting against,
- `fallbackFlags`: A list of strings which specify which flags to consider enabled if the SDK is unable to fetch flags. Can be provided in two formats:

  ```ts
  // Simple array of flag keys
  fallbackFlags={["flag1", "flag2"]}

  // Or with configuration overrides
  fallbackFlags: {
      "flag1": true,  // just enable the flag
      "flag2": {      // enable with configuration
        key: "variant-a",
        payload: {
          limit: 100,
          mode: "test"
        }
      }
  }
  ```

- `timeoutMs`: Timeout in milliseconds when fetching flags from the server.
- `staleWhileRevalidate`: If set to `true`, stale flags will be returned while refetching flags in the background.
- `expireTimeMs`: If set, flags will be cached between page loads for this duration (in milliseconds).
- `staleTimeMs`: Maximum time (in milliseconds) that stale flags will be returned if `staleWhileRevalidate` is true and new flags cannot be fetched.
- `offline`: Provide this option when testing or in local development environments to avoid contacting Reflag servers.
- `loadingComponent` lets you specify an React component to be rendered instead of the children while the Reflag provider is initializing. If you want more control over loading screens, `useFlag()` returns `isLoading` which you can use to customize the loading experience:

  ```tsx
  function LoadingReflag({ children }) {
    const { isLoading } = useFlag("myFlag")
    if (isLoading) {
      return <Spinner />
    }

    return children
  }

  //-- Initialize the Reflag provider
  <ReflagProvider publishableKey={YOUR_PUBLISHABLE_KEY} /*...*/>
    <LoadingReflag>
    {/* children here are shown when loading finishes */}
    </LoadingReflag>
  <ReflagProvider>
  ```

- `enableTracking`: Set to `false` to stop sending tracking events and user/company updates to Reflag. Useful when you're impersonating a user (defaults to `true`),
- `apiBaseUrl`: Optional base URL for the Reflag API. Use this to override the default API endpoint,
- `appBaseUrl`: Optional base URL for the Reflag application. Use this to override the default app URL,
- `sseBaseUrl`: Optional base URL for Server-Sent Events. Use this to override the default SSE endpoint,
- `debug`: Set to `true` to enable debug logging to the console,
- `toolbar`: Optional [configuration](https://docs.reflag.com/supported-languages/browser-sdk/globals#toolbaroptions) for the Reflag toolbar,
- `feedback`: Optional configuration for feedback collection

## Hooks

### `useFlag()`

Returns the state of a given flag for the current context. The hook provides type-safe access to flags and their configurations.

```tsx
import { useFlag } from "@reflag/react-sdk";

function StartHuddleButton() {
  const {
    isLoading, // true while flags are being loaded
    isEnabled, // boolean indicating if the flag is enabled
    config: {
      // flag configuration
      key, // string identifier for the config variant
      payload, // type-safe configuration object
    },
    track, // function to track flag usage
    requestFeedback, // function to request feedback for this flag
  } = useFlag("huddle");

  if (isLoading) {
    return <Loading />;
  }

  if (!isEnabled) {
    return null;
  }

  return (
    <>
      <button onClick={track}>Start huddle!</button>
      <button
        onClick={(e) =>
          requestFeedback({
            title: payload?.question ?? "How do you like the Huddles feature?",
            position: {
              type: "POPOVER",
              anchor: e.currentTarget as HTMLElement,
            },
          })
        }
      >
        Give feedback!
      </button>
    </>
  );
}
```

### `useTrack()`

`useTrack()` lets you send custom events to Reflag. Use this whenever a user _uses_ a feature. Create [features](https://docs.reflag.com/introduction/concepts/feature) in Reflag based off of these events to analyze feature usage.
Returns a function to send custom events to Reflag. Use this whenever a user _uses_ a feature. These events can be used to analyze feature usage and create new flags in Reflag.

```tsx
import { useTrack } from "@reflag/react-sdk";

function StartHuddle() {
  <div>
    <button onClick={() => track("Huddle Started", { huddleType: "voice" })}>
      Start voice huddle!
    </button>
  </div>;
}
```

### `useRequestFeedback()`

Returns a function that lets you open up a dialog to ask for feedback on a specific feature. This is useful for collecting targeted feedback about specific features.

`useRequestFeedback()` returns a function that lets you open up a dialog to ask for feedback on a specific feature.
See [Automated Feedback Surveys](https://docs.reflag.com/product-handbook/live-satisfaction) for how to do this automatically, without code.

When using the `useRequestFeedback` you must pass the flag key to `requestFeedback`.
The example below shows how to use `position` to ensure the popover appears next to the "Give feedback!" button.

```tsx
import { useRequestFeedback } from "@reflag/react-sdk";

function FeedbackButton() {
  const requestFeedback = useRequestFeedback();
  return (
    <button
      onClick={(e) =>
        requestFeedback({
          flagKey: "huddle-flag",
          title: "How satisfied are you with file uploads?",
          position: {
            type: "POPOVER",
            anchor: e.currentTarget as HTMLElement,
          },
          // Optional custom styling
          style: {
            theme: "light",
            primaryColor: "#007AFF",
          },
        })
      }
    >
      Give feedback!
    </button>
  );
}
```

See the [Feedback Documentation](https://github.com/reflagcom/javascript/blob/main/packages/browser-sdk/FEEDBACK.md#manual-feedback-collection) for more information on `requestFeedback` options.

### `useSendFeedback()`

Returns a function that lets you send feedback to Reflag. This is useful if you've manually collected feedback through your own UI and want to send it to Reflag.

```tsx
import { useSendFeedback } from "@reflag/react-sdk";

function CustomFeedbackForm() {
  const sendFeedback = useSendFeedback();

  const handleSubmit = async (data: FormData) => {
    await sendFeedback({
      flagKey: "reflag-flag-key",
      score: parseInt(data.get("score") as string),
      comment: data.get("comment") as string,
    });
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

### `useUpdateUser()`, `useUpdateCompany()` and `useUpdateOtherContext()`

These hooks return functions that let you update the attributes for the currently set user, company, or other context. Updates to user/company are stored remotely and affect flag targeting, while "other" context updates only affect the current session.

```tsx
import {
  useUpdateUser,
  useUpdateCompany,
  useUpdateOtherContext,
} from "@reflag/react-sdk";

function FlagOptIn() {
  const updateUser = useUpdateUser();
  const updateCompany = useUpdateCompany();
  const updateOtherContext = useUpdateOtherContext();

  const handleUserUpdate = async () => {
    await updateUser({
      role: "admin",
      betaFlags: "enabled",
    });
  };

  const handleCompanyUpdate = async () => {
    await updateCompany({
      plan: "enterprise",
      employees: 500,
    });
  };

  const handleContextUpdate = async () => {
    await updateOtherContext({
      currentWorkspace: "workspace-123",
      theme: "dark",
    });
  };

  return (
    <div>
      <button onClick={handleUserUpdate}>Update User</button>
      <button onClick={handleCompanyUpdate}>Update Company</button>
      <button onClick={handleContextUpdate}>Update Context</button>
    </div>
  );
}
```

Note: To change the `user.id` or `company.id`, you need to update the props passed to `ReflagProvider` instead of using these hooks.

### `useClient()`

Returns the `ReflagClient` used by the `ReflagProvider`. The client offers more functionality that
is not directly accessible thorough the other hooks.

```tsx
import { useClient } from "@reflag/react-sdk";

function LoggingWrapper({ children }: { children: ReactNode }) {
  const client = useClient();

  useEffect(() => {
    client.on("check", (evt) => {
      console.log(`The flag ${evt.key} is ${evt.value} for user.`);
    });
  }, [client]);

  return children;
}
```

## Content Security Policy (CSP)

See [CSP](https://github.com/reflagcom/javascript/blob/main/packages/browser-sdk/README.md#content-security-policy-csp) for info on using Reflag React SDK with CSP

## License

MIT License

Copyright (c) 2025 Bucket ApS
