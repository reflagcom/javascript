---
"@reflag/browser-sdk": patch
---

Treat unsuccessful feedback form submissions as errors instead of showing success and invoking `onAfterSubmit` with unsaved feedback. Applies to manual and automated forms, and allows retrying Send.
