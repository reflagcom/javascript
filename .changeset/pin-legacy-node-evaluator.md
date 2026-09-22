---
"@reflag/node-sdk": patch
---

Keep the existing Node SDK on evaluator 1.1.1 through the `@reflag/flag-evaluation-v1` npm alias. This preserves its legacy protocol and prevents the evaluator's v2 workspace release from automatically upgrading its dependency before SDK migration.
