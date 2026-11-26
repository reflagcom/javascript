# @reflag/cli

## 1.0.5

### Patch Changes

- ee30ad5: Fix app discovery for users who belong to multiple organizations. `reflag apps list` shows each app's organization, `reflag init` lets you choose an organization, and existing configs resolve their `appId` without requiring an `orgId`. Use `orgId` or `--org-id` to restrict the CLI to one organization. API keys remain scoped to their app.
- 1adfced: Update Express and Zod to patched versions. Preserve CLI schema parsing behavior when migrating to Zod 4.
