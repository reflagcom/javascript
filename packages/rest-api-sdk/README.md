# @reflag/rest-api-sdk

Type-safe REST API client for the Reflag API.

## Installation

```bash
npm install @reflag/rest-api-sdk
# or
yarn add @reflag/rest-api-sdk
```

## Quick Start

All API requests require a Bearer token. Get your API key from the Reflag dashboard.

```typescript
import { Api } from "@reflag/rest-api-sdk";

const api = new Api({
  accessToken: process.env.REFLAG_API_KEY,
});

const apps = await api.listApps();
// {
//   data: [{ id, name, demo, flagKeyFormat, org: { id, name } }]
// }
console.log(apps.data);
```

Most methods take an `appId`, or you can create an app-scoped client to avoid passing it in:

```typescript
import { createAppClient } from "@reflag/rest-api-sdk";

// App-scoped client keeps appId out of each call.
const appApi = createAppClient("app-123", {
  accessToken: process.env.REFLAG_API_KEY,
});

const environments = await appApi.listEnvironments({
  sortBy: "order",
  sortOrder: "asc",
});
// {
//   data: [{ id, name, isProduction, order }],
//   sortBy,
//   sortOrder
// }
console.log(environments.data);
```

## API Methods

### Applications

```typescript
import { Api } from "@reflag/rest-api-sdk";

const api = new Api();

// List all apps
const apps = await api.listApps();
// {
//   data: [{ id, name, demo, flagKeyFormat, org: { id, name } }]
// }

// Filter by organization
const appsByOrg = await api.listApps({ orgId: "org-123" });
// same return shape as listApps()

// Get a single app
const app = await api.getApp({
  appId: "app-123",
});
// {
//   id,
//   name,
//   demo,
//   flagKeyFormat,
//   environments: [{ id, name, isProduction, order, sdkAccess }],
//   stages: [{ id, name, color, assignedFlagCount, order }],
//   segments: [{ id, name, type }],
//   org: { id, name }
// }
```

### Environments

```typescript
import { createAppClient } from "@reflag/rest-api-sdk";

const appApi = createAppClient("app-123");

// App-scoped client (appId is implicit)
const environments = await appApi.listEnvironments({
  sortBy: "order",
  sortOrder: "asc",
});
// {
//   data: [{ id, name, isProduction, order }],
//   sortBy,
//   sortOrder
// }

const environment = await appApi.getEnvironment({
  envId: "env-456",
});
// {
//   id,
//   name,
//   isProduction,
//   order,
//   sdkAccess: { publishableKey, secretKey }
// }
```

### Flags

```typescript
const flags = await api.listFlags({ appId: "app-123" });
// {
//   data: [
//     {
//       id,
//       key,
//       name,
//       description?,
//       stage?,
//       owner?,
//       archived,
//       stale,
//       permanent,
//       createdAt?,
//       lastCheckAt?,
//       lastTrackAt?
//     }
//   ],
//   totalCount,
//   pageSize,
//   pageIndex,
//   sortBy,
//   sortOrder
// }

const targeting = await api.getFlagTargeting({
  appId: "app-123",
  flagKey: "my-feature-flag",
  envId: "env-456",
});
// {
//   flagKey,
//   version,
//   updatedAt,
//   specificTargets: {
//     // Currently only "true" exists because this API supports the true variant.
//     "true": { companyIds, userIds }
//   }
// }

const updated = await api.updateBulkFlagSpecificTargets({
  appId: "app-123",
  envId: "env-456",
  bulkUpdateFlagSpecificTargetsSchema: {
    updates: [
      { flagKey: "new-feature", value: true, companyId: "company-1" },
      { flagKey: "new-feature", value: true, userId: "user-1" },
      { flagKey: "old-feature", value: null, companyId: "company-1" },
    ],
    notifications: true,
    changeDescription: "Enabling new feature for beta testers",
  },
});
// {
//   data: [{ flagKey, version, updatedAt, specificTargets }]
// }
```

### Company Flags

```typescript
const companyFlags = await api.getCompanyFlags({
  appId: "app-123",
  companyId: "company-1",
  envId: "env-456",
});
// {
//   data: [
//     {
//       id,
//       key,
//       name,
//       value,
//       specificallyTargetedValue,
//       firstExposureAt,
//       lastExposureAt,
//       lastCheckAt,
//       exposureCount,
//       firstTrackAt,
//       lastTrackAt,
//       trackCount
//     }
//   ],
//   totalCount,
//   pageSize,
//   pageIndex
// }

const updatedCompanyFlags = await api.updateCompanyFlags({
  appId: "app-123",
  companyId: "company-1",
  envId: "env-456",
  updateEntityFlagsBody: {
    updates: [
      { flagKey: "feature-flag", value: true },
      { flagKey: "another-flag", value: null },
    ],
  },
});
// same return shape as getCompanyFlags()
```

### User Flags

```typescript
const userFlags = await api.getUserFlags({
  appId: "app-123",
  userId: "user-1",
  envId: "env-456",
});
// {
//   data: [
//     {
//       id,
//       key,
//       name,
//       value,
//       specificallyTargetedValue,
//       firstExposureAt,
//       lastExposureAt,
//       lastCheckAt,
//       exposureCount,
//       firstTrackAt,
//       lastTrackAt,
//       trackCount
//     }
//   ],
//   totalCount,
//   pageSize,
//   pageIndex
// }

const updatedUserFlags = await api.updateUserFlags({
  appId: "app-123",
  userId: "user-1",
  envId: "env-456",
  updateEntityFlagsBody: {
    updates: [
      { flagKey: "feature-flag", value: true },
      { flagKey: "beta-feature", value: true },
    ],
  },
});
// same return shape as getUserFlags()
```

## Error Handling

Methods throw on non-2xx responses. Catch errors and inspect the response when needed.

```typescript
try {
  const apps = await api.listApps();
  console.log(apps.data);
} catch (error) {
  if (error instanceof Error) {
    console.error("Request failed", error.message);
  }
  throw error;
}
```

## Types

All generated types are exported for use in your application:

```typescript
import type {
  AppHeader,
  EnvironmentHeader,
  Environment,
  FlagHeader,
  FlagTargeting,
  ErrorResponse,
} from "@reflag/rest-api-sdk";
```

## Regenerating the SDK

To regenerate the SDK:

```bash
yarn generate
```

The schema source lives at `https://app.reflag.com/openapi.json`.

## License

MIT
