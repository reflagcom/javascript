---
"@reflag/browser-sdk": minor
---

Add `enableLiveFlagUpdates` support. When enabled, the browser SDK subscribes to Reflag SSE and refreshes flags automatically when they change. The browser SDK keeps live flag updates disabled by default.

The browser SDK now accepts `bootstrappedState` with `{ context, flags, flagStateVersion? }`. `flagStateVersion` lets bootstrapped clients avoid redundant refreshes immediately after hydration, ignore stale bootstrapped payloads, and request the newest flag state after a live update. Existing `bootstrappedFlags` usage still works for initial rendering, but live updates after bootstrapping require `flagStateVersion`; if it is missing, the client warns and disables live updates for that client.

Browser SSE now uses `apiBaseUrl` by default, which points to `https://front.reflag.com` unless overridden. Live flag updates and feedback notifications now share `https://front.reflag.com`, so default CSP setups only need to allow `connect-src https://front.reflag.com` instead of `https://livemessaging.bucket.co`. `sseBaseUrl` remains available as an override if you need a separate SSE host.
