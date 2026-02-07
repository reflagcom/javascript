# @reflag/rest-api-sdk

Type-safe REST API client for the Reflag API.

## Installation

```bash
npm install @reflag/rest-api-sdk
# or
yarn add @reflag/rest-api-sdk
```

## Quick Start

```typescript
import { Api } from "@reflag/rest-api-sdk";

const api = new Api({
  accessToken: process.env.REFLAG_API_KEY,
});

const apps = await api.listApps();
console.log(apps.data);
```

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
console.log(environments.data);
```

## Authentication

All API requests require a Bearer token. Get your API key from the Reflag dashboard.

```typescript
import { Api } from "@reflag/rest-api-sdk";

const api = new Api({
  accessToken: "your-api-key",
});
```

## API Methods

### Applications

```typescript
import { Api } from "@reflag/rest-api-sdk";

const api = new Api();

// List all apps
const apps = await api.listApps();

// Filter by organization
const appsByOrg = await api.listApps({ orgId: "org-123" });

// Get a single app
const app = await api.getApp({
  appId: "app-123",
});
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

const environment = await appApi.getEnvironment({
  envId: "env-456",
});
```

You can also pass `appId` with every call instead of using `createAppClient`:

```typescript
const environments = await api.listEnvironments({
  appId: "app-123",
  sortBy: "order",
  sortOrder: "asc",
});

const environment = await api.getEnvironment({
  appId: "app-123",
  envId: "env-456",
});
```

### Flags

```typescript
const flags = await api.listFlags({ appId: "app-123" });

const targeting = await api.getFlagTargeting({
  appId: "app-123",
  flagKey: "my-feature-flag",
  envId: "env-456",
});

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
```

### Company Flags

```typescript
const companyFlags = await api.getCompanyFlags({
  appId: "app-123",
  companyId: "company-1",
  envId: "env-456",
});

const updatedCompanyFlags = await api.updateCompanyFlags({
  appId: "app-123",
  companyId: "company-1",
  envId: "env-456",
  updateEntityFlagsBody: {
    flags: {
      "feature-flag": true,
      "another-flag": false,
    },
  },
});
```

### User Flags

```typescript
const userFlags = await api.getUserFlags({
  appId: "app-123",
  userId: "user-1",
  envId: "env-456",
});

const updatedUserFlags = await api.updateUserFlags({
  appId: "app-123",
  userId: "user-1",
  envId: "env-456",
  updateEntityFlagsBody: {
    flags: {
      "feature-flag": true,
      "beta-feature": true,
    },
  },
});
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
  EnvironmentDetails,
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
