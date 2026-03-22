# @reflag/management-sdk (beta)

Typed SDK for Reflag's Management API.

## Installation

```bash
npm install @reflag/management-sdk
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

`createFlag` and `updateFlag` return `{ flag }` with the latest flag details.

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
