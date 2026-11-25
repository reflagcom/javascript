---
"@reflag/cli": patch
---

Fix app discovery for users who belong to multiple organizations. `reflag apps list` shows each app's organization, `reflag init` lets you choose an organization, and existing configs resolve their `appId` without requiring an `orgId`. Use `orgId` or `--org-id` to restrict the CLI to one organization. API keys remain scoped to their app.
