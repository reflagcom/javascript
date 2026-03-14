---
"@reflag/node-sdk": minor
---

Introduce flag fallback providers

Add support for `flagsFallbackProvider`, a reliability feature that lets the Node SDK persist the latest successfully fetched flag definitions to fallback storage such as a local file, S3, Redis, or a custom backend.

Reflag servers remain the primary source of truth. On startup, the SDK still tries to fetch a live snapshot first. If that initial fetch fails, it can load the last saved snapshot from the fallback provider so new processes can still initialize in the exceedingly rare case that Reflag has an outage.

After successfully fetching updated flag definitions, the SDK saves the latest definitions back through the provider to keep the fallback snapshot up to date.

This improves service startup reliability and outage recovery without changing normal flag evaluation behavior.
