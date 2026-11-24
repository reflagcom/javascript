---
"@reflag/cli": major
---

Move the CLI to the v2 management flag API and generate direct-value declarations from current production-environment multivariate variants instead of legacy config wrappers. Add Vue generation, JSON-safe empty-shape inference and property escaping, and update generated coding-agent instructions for the v2 APIs. The CLI update requires compatible management endpoints and SDK v2; SDK v1 applications must retain the CLI 1.x generator.
