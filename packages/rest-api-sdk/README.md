# @reflag/rest-api-sdk

Typed Node/browser SDK for Reflag's REST API.

## Installation

```bash
npm install @reflag/rest-api-sdk
# or
yarn add @reflag/rest-api-sdk
```

## Create a client

All requests require a Reflag API key.

```typescript
import { Api } from "@reflag/rest-api-sdk";

const api = new Api({
  accessToken: process.env.REFLAG_API_KEY,
  // Optional when using non-default host:
  // basePath: "https://app.reflag.com/api",
});
```

## Quick start

```typescript
const apps = await api.listApps();
console.log(apps.data);

const app = apps.data[0];
const appId = app?.id;

if (appId) {
  const environments = await api.listEnvironments({
    appId,
    sortBy: "order",
    sortOrder: "asc",
  });

  console.log(environments.data);
}
```

## App-scoped client

If most calls are for one app, use `createAppClient` to avoid repeating `appId`.

```typescript
import { createAppClient } from "@reflag/rest-api-sdk";

const appApi = createAppClient("app-123", {
  accessToken: process.env.REFLAG_API_KEY,
});

const environments = await appApi.listEnvironments({
  sortBy: "order",
  sortOrder: "asc",
});

const flags = await appApi.listFlags({});
```

## Common workflows

### Read user flags for an environment

`getUserFlags` evaluates flag results for one user in one environment and returns
the user’s current values plus exposure/check metadata for each flag.

```typescript
const userFlags = await api.getUserFlags({
  appId: "app-123",
  envId: "env-456",
  userId: "user-1",
});

console.log(userFlags.data);
```

### Toggle a user flag

Use `true` to explicitly target on, and `null` to remove specific targeting.

```typescript
await api.updateUserFlags({
  appId: "app-123",
  envId: "env-456",
  userId: "user-1",
  updates: [{ flagKey: "new-checkout", value: true }],
});
```

### Read and update company flags

```typescript
const companyFlags = await api.getCompanyFlags({
  appId: "app-123",
  envId: "env-456",
  companyId: "company-1",
});

await api.updateCompanyFlags({
  appId: "app-123",
  envId: "env-456",
  companyId: "company-1",
  updates: [{ flagKey: "new-checkout", value: null }],
});
```

### Bulk update specific targets for multiple flags

```typescript
await api.updateBulkFlagSpecificTargets({
  appId: "app-123",
  envId: "env-456",
  updates: [
    { flagKey: "new-checkout", value: true, companyId: "company-1" },
    { flagKey: "new-checkout", value: true, userId: "user-1" },
    { flagKey: "legacy-checkout", value: null, userId: "user-1" },
  ],
  notifications: true,
  changeDescription: "Rolling out new checkout to pilot accounts",
});
```

## Error handling

The SDK throws `ReflagApiError` for non-2xx API responses.

```typescript
import { ReflagApiError } from "@reflag/rest-api-sdk";

try {
  await api.listApps();
} catch (error) {
  if (error instanceof ReflagApiError) {
    console.error(error.status, error.code, error.message, error.details);
  }
  throw error;
}
```

## API surface

Main exports:

- `Api`: base client
- `createAppClient(appId, config)`: app-scoped client
- `ReflagApiError`: normalized API error type
- Generated request/response types and models from `@reflag/rest-api-sdk`

Core method groups:

- Applications: `listApps`, `getApp`
- Environments: `listEnvironments`, `getEnvironment`
- Flags: `listFlags`, `getFlagTargeting`, `updateBulkFlagSpecificTargets`
- User/company evaluation: `getUserFlags`, `updateUserFlags`, `getCompanyFlags`, `updateCompanyFlags`

## Example app

See `packages/rest-api-sdk/examples/customer-admin-panel/README.md` for a small Next.js app using this SDK in server actions.

## License

MIT
