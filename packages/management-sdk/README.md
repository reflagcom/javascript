# @reflag/management-sdk (beta)

Typed SDK for interacting with Reflag’s Management API.

Use `@reflag/management-sdk` to programmatically manage feature flags such as listing flags, and enabling or disabling them for specific users or companies.

For a practical example of what you can build, see the [Customer Admin Panel](https://github.com/reflagcom/javascript/blob/main/packages/management-sdk/examples/customer-admin-panel/README.md) example app.

## Installation

```bash
npm i @reflag/management-sdk
# or
yarn add @reflag/management-sdk
```

## Create a client

Initialize the SDK with a [Reflag Management API Key](https://app.reflag.com/env-current/settings/org-api-access).

```typescript
import { Api } from "@reflag/management-sdk";

const api = new Api({
  accessToken: process.env.REFLAG_API_KEY,
});
```

## API surface

Main exports:

- `Api`: base client
- `createAppClient(appId, config)`: app-scoped client
- `ReflagApiError`: normalized API error type
- Generated request/response types and models from `@reflag/management-sdk`

Core method groups:

- Applications: `listApps`, `getApp`
- Environments: `listEnvironments`, `getEnvironment`
- Flags: `listFlags`, `createFlag`, `updateFlag`
- User/company management: `upsertUser`, `deleteUser`, `upsertCompany`, `deleteCompany`
- User/company evaluation: `getUserFlags`, `updateUserFlags`, `getCompanyFlags`, `updateCompanyFlags`

## Quick start

```typescript
const apps = await api.listApps();
console.log(apps.data);
// [
//   {
//     "org": { "id": "org-1", "name": "Acme Org" },
//     "id": "app-123",
//     "name": "Acme App",
//     "demo": false,
//     "flagKeyFormat": "kebabCaseLower",
//     "environments": [
//       { "id": "env-123", "name": "Development", "isProduction": false, "order": 0 },
//       { "id": "env-456", "name": "Production", "isProduction": true, "order": 1 }
//     ]
//   }
// ]

const app = apps.data[0];
const appId = app?.id;

if (appId) {
  const environments = await api.listEnvironments({
    appId,
    sortBy: "order",
    sortOrder: "asc",
  });

  console.log(environments.data);
  // [
  //   { "id": "env-456", "name": "Production", "isProduction": true, "order": 1 }
  // ]
}
```

## App-scoped client

If most calls are for one app, use `createAppClient` to avoid repeating `appId`.

```typescript
import { createAppClient } from "@reflag/management-sdk";

const appApi = createAppClient("app-123", {
  accessToken: process.env.REFLAG_API_KEY,
});

const environments = await appApi.listEnvironments({
  sortBy: "order",
  sortOrder: "asc",
});
console.log(environments.data);
// [
//   { "id": "env-456", "name": "Production", "isProduction": true, "order": 1 }
// ]

const flags = await appApi.listFlags({});
console.log(flags.data);
// [
//   {
//     "id": "flag-1",
//     "key": "new-checkout",
//     "name": "New checkout",
//     "description": "Rollout for redesigned checkout flow",
//     "stage": { "id": "stage-1", "name": "Beta", "color": "#4f46e5", "order": 2 },
//     "owner": {
//       "id": "user-99",
//       "name": "Jane Doe",
//       "email": "jane@acme.com",
//       "avatarUrl": "https://example.com/avatar.png"
//     },
//     "archived": false,
//     "stale": false,
//     "permanent": false,
//     "createdAt": "2026-03-03T09:00:00.000Z",
//     "lastCheckAt": "2026-03-03T09:30:00.000Z",
//     "lastTrackAt": "2026-03-03T09:31:00.000Z"
//   }
// ]
```

## Common workflows

### Create and update a flag

`createFlag` and `updateFlag` return the latest flag details together with
`flagStateVersions`, keyed by environment ID.

Use `null` to clear nullable fields like `description` or `ownerUserId` on update.

```typescript
const created = await api.createFlag({
  appId: "app-123",
  key: "new-checkout",
  name: "New checkout",
  description: "Rollout for redesigned checkout flow",
  secret: false,
});

const updated = await api.updateFlag({
  appId: "app-123",
  flagId: created.flag.id,
  name: "New checkout experience",
  ownerUserId: null,
});
console.log(updated.flag);
// {
//   "id": "flag-1",
//   "key": "new-checkout",
//   "name": "New checkout experience",
//   "description": "Rollout for redesigned checkout flow",
//   "stage": { "id": "stage-1", "name": "Beta", "color": "#4f46e5", "order": 2 },
//   "owner": {
//     "id": "user-99",
//     "name": "Jane Doe",
//     "email": "jane@acme.com",
//     "avatarUrl": "https://example.com/avatar.png"
//   },
//   "archived": false,
//   "stale": false,
//   "permanent": false,
//   "createdAt": "2026-03-03T09:00:00.000Z",
//   "lastCheckAt": "2026-03-03T09:35:00.000Z",
//   "lastTrackAt": "2026-03-03T09:36:00.000Z",
//   "rolledOutToEveryoneAt": "2026-03-10T12:00:00.000Z",
//   "parentFlagId": "flag-parent-1"
// }
```

### Create, update, and delete entities

Use the entity management methods to synchronously manage users and companies in
an environment. Entity attributes are merged with existing attributes.

```typescript
const company = await api.upsertCompany({
  appId: "app-123",
  envId: "env-456",
  companyId: "company-1",
  name: "Acme, Inc.",
  attributes: { plan: "enterprise", seats: 50 },
});

const user = await api.upsertUser({
  appId: "app-123",
  envId: "env-456",
  userId: "user-1",
  name: "Jane Doe",
  attributes: { role: "admin" },
});

await api.deleteUser({
  appId: "app-123",
  envId: "env-456",
  userId: user.id,
});
await api.deleteCompany({
  appId: "app-123",
  envId: "env-456",
  companyId: company.id,
  deleteUsers: false,
});
```

### Create a user and immediately enable a flag

Use `upsertUser` when the user must be available to a targeting request immediately,
rather than relying on asynchronous runtime tracking ingestion. Await the upsert
before enabling the flag. The flag must already exist, and the Management API key
needs both `write:entities` and `write:flag:targeting` scopes.

```typescript
const scope = { appId: "app-123", envId: "env-456" };
const userId = "user-123";

await api.upsertUser({ ...scope, userId, name: "Jane Doe" });

const { flagStateVersion } = await api.updateUserFlags({
  ...scope,
  userId,
  updates: [{ flagKey: "new-checkout", specificTargetValue: true }],
});

// Optional: evaluate immediately using an initialized Node SDK client
// configured for the same app and environment.
await client.refreshFlags(flagStateVersion);
const flag = client.getFlag("new-checkout", { user: { id: userId } });
```

The upsert makes the user available to the Management API. Refreshing the Node SDK
requests the flag configuration containing the targeting change or newer; see
[Waiting for flag changes to reach an SDK](#waiting-for-flag-changes-to-reach-an-sdk).
The same sequence works for companies using `upsertCompany` and `updateCompanyFlags`.

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
// [
//   {
//     "id": "flag-1",
//     "key": "new-checkout",
//     "name": "New checkout",
//     "createdAt": "2026-03-03T09:00:00.000Z",
//     "value": true,
//     "specificTargetValue": true,
//     "firstExposureAt": "2026-03-03T09:05:00.000Z",
//     "lastExposureAt": "2026-03-03T09:30:00.000Z",
//     "lastCheckAt": "2026-03-03T09:31:00.000Z",
//     "exposureCount": 12,
//     "firstTrackAt": "2026-03-03T09:06:00.000Z",
//     "lastTrackAt": "2026-03-03T09:32:00.000Z",
//     "trackCount": 5
//   }
// ]
```

### Toggle a user flag

Use `true` to explicitly target on, and `null` to remove specific targeting.

```typescript
const updatedUserFlags = await api.updateUserFlags({
  appId: "app-123",
  envId: "env-456",
  userId: "user-1",
  updates: [{ flagKey: "new-checkout", specificTargetValue: true }],
});
console.log(updatedUserFlags.data);
// [
//   {
//     "id": "flag-1",
//     "key": "new-checkout",
//     "name": "New checkout",
//     "createdAt": "2026-03-03T09:00:00.000Z",
//     "value": true,
//     "specificTargetValue": true,
//     "firstExposureAt": "2026-03-03T09:05:00.000Z",
//     "lastExposureAt": "2026-03-03T09:35:00.000Z",
//     "lastCheckAt": "2026-03-03T09:36:00.000Z",
//     "exposureCount": 13,
//     "firstTrackAt": "2026-03-03T09:06:00.000Z",
//     "lastTrackAt": "2026-03-03T09:37:00.000Z",
//     "trackCount": 6
//   }
// ]
```

### Read company flags for an environment

```typescript
const companyFlags = await api.getCompanyFlags({
  appId: "app-123",
  envId: "env-456",
  companyId: "company-1",
});
console.log(companyFlags.data);
// [
//   {
//     "id": "flag-1",
//     "key": "new-checkout",
//     "name": "New checkout",
//     "createdAt": "2026-03-03T09:00:00.000Z",
//     "value": false,
//     "specificTargetValue": null,
//     "firstExposureAt": null,
//     "lastExposureAt": null,
//     "lastCheckAt": "2026-03-03T09:31:00.000Z",
//     "exposureCount": 0,
//     "firstTrackAt": null,
//     "lastTrackAt": null,
//     "trackCount": 0
//   }
// ]
```

### Toggle a company flag

Use `true` to explicitly target on, and `null` to remove specific targeting.

```typescript
const updatedCompanyFlags = await api.updateCompanyFlags({
  appId: "app-123",
  envId: "env-456",
  companyId: "company-1",
  // Use `null` to stop targeting the company specifically for that flag.
  updates: [{ flagKey: "new-checkout", specificTargetValue: null }],
});
console.log(updatedCompanyFlags.data);
// [
//   {
//     "id": "flag-1",
//     "key": "new-checkout",
//     "name": "New checkout",
//     "createdAt": "2026-03-03T09:00:00.000Z",
//     "value": false,
//     "specificTargetValue": null,
//     "firstExposureAt": null,
//     "lastExposureAt": null,
//     "lastCheckAt": "2026-03-03T09:36:00.000Z",
//     "exposureCount": 0,
//     "firstTrackAt": null,
//     "lastTrackAt": null,
//     "trackCount": 0
//   }
// ]
```

## Waiting for flag changes to reach an SDK

Flag changes can take a few seconds to propagate to evaluation SDKs.
`updateUserFlags` and `updateCompanyFlags` return a `flagStateVersion` identifying
the environment version containing the completed change. `createFlag` and
`updateFlag` return `flagStateVersions`, keyed by environment ID.

With `@reflag/node-sdk`, pass this number to `client.refreshFlags(version)` before
evaluating flags to request that version or newer, rather than waiting for the
next automatic refresh. Use a client configured for the same app and environment.

```typescript
// Server-side: `api` is the Management SDK client and `client` is an
// initialized @reflag/node-sdk ReflagClient.
const { flagStateVersion } = await api.updateCompanyFlags({
  appId: "app-123",
  envId: "env-456",
  companyId: "company-1",
  updates: [{ flagKey: "new-checkout", specificTargetValue: true }],
});

await client.refreshFlags(flagStateVersion);
const flag = client.getFlag("new-checkout", {
  user: { id: "user-1" },
  company: { id: "company-1" },
});
```

For `createFlag` or `updateFlag`, pass `result.flagStateVersions[envId]` instead.
The version is a minimum: a successful refresh may receive a newer version that
also includes subsequent changes.

If the refresh fails, the Node SDK keeps its cached or fallback flags rather than
throwing, so awaiting the call does not guarantee synchronization on failure.

## Error handling

The SDK throws `ReflagApiError` for non-2xx API responses.

```typescript
import { ReflagApiError } from "@reflag/management-sdk";

try {
  await api.listApps();
} catch (error) {
  if (error instanceof ReflagApiError) {
    console.error(error.status, error.code, error.message, error.details);
  }
  throw error;
}
```

## Example app

See `packages/management-sdk/examples/customer-admin-panel/README.md` for a small Next.js app using this SDK in server actions.

## License

MIT
