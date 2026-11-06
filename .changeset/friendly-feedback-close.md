---
"@reflag/browser-sdk": patch
---

Call `onAfterSubmit` once per feedback form, including when a user saves a score and closes without pressing Send. Closing after Send does not repeat the callback, and closing during a save waits for it to finish. Close-only callbacks include the latest saved score and an empty comment, never an unsubmitted comment draft. Applies to both automated surveys and manually requested feedback.
