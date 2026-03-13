---
"@reflag/node-sdk": minor
---

introduce flag fallback providers

Flag fallback providers let the Node SDK keep an up-to-date copy of raw flag definitions in alternative storage, such as a local file, S3, Redis, or any custom backend.

On startup, Reflag remains the primary source of truth and the SDK still tries to fetch a live snapshot first. If that initial fetch fails, the SDK can load the last saved snapshot through `flagsFallbackProvider` so new processes can still initialize during a Reflag outage. After later successful live fetches and background refreshes, the SDK saves the latest definitions back through the provider to keep the fallback snapshot current.

This improves reliability for startup fallback and outage recovery, especially in multi-process deployments where individual instances may need to boot while Reflag is temporarily unavailable.
