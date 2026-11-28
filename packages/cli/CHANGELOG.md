# @reflag/cli

## 2.0.0

### Major Changes

- 0fe8795: Move the CLI to the v2 management flag API and generate direct-value declarations from current production-environment multivariate variants instead of legacy config wrappers. Add Vue generation, JSON-safe empty-shape inference and property escaping, and update generated coding-agent instructions for the v2 APIs. The CLI update requires compatible management endpoints and SDK v2; SDK v1 applications must retain the CLI 1.x generator.

### Patch Changes

- e438bad: Fix app discovery for users who belong to multiple organizations. `reflag apps list` shows each app's organization, `reflag init` lets you choose an organization, and existing configs resolve their `appId` without requiring an `orgId`. Use `orgId` or `--org-id` to restrict the CLI to one organization. API keys remain scoped to their app.
- 1adfced: Update Express and Zod to patched versions. Preserve CLI schema parsing behavior when migrating to Zod 4.

## 2.0.0-next.1

### Major Changes

- 0fe8795: Move the CLI to the v2 management flag API and generate direct-value declarations from current production-environment multivariate variants instead of legacy config wrappers. Add Vue generation, JSON-safe empty-shape inference and property escaping, and update generated coding-agent instructions for the v2 APIs. The CLI update requires compatible management endpoints and SDK v2; SDK v1 applications must retain the CLI 1.x generator.

## 1.0.5-next.0

### Patch Changes

- 1adfced: Update Express and Zod to patched versions. Preserve CLI schema parsing behavior when migrating to Zod 4.
