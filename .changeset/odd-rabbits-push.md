---
"@reflag/browser-sdk": minor
"@reflag/react-sdk": minor
"@reflag/react-native-sdk": minor
"@reflag/vue-sdk": minor
---

Add `enableLiveFlagUpdates` to the browser-facing SDKs.

When enabled, the SDK subscribes to the Reflag pubsub SSE endpoint and refreshes flags after live update notifications. The browser SDK defaults this option to `false`, while the React, React Native, and Vue SDKs enable it by default.

The browser SDK now uses a single shared pubsub SSE connection for live flag updates and automated feedback, preserves `flagStateVersion` across cached and fetched flag state, and uses `waitForVersion=<flagStateVersion>` when refreshing after a pushed flag update while ignoring stale wait responses.
