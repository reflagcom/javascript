---
"@reflag/node-sdk": minor
---

`getFlagsForBootstrap()` now includes `flagStateVersion` when the Node SDK has received a flag-state version from Reflag:

```ts
type BootstrappedFlags = {
  context: Context;
  flags: RawFlags;
  flagStateVersion?: number;
};
```

Client SDKs use `flagStateVersion` to keep live flag updates working after bootstrapping. It lets bootstrapped clients avoid redundant refreshes immediately after hydration, ignore stale bootstrapped payloads, and request the newest flag state after a live update.

The Node SDK now uses Reflag's server push SSE endpoint (`GET https://front.reflag.com/sse/server`) for live flag definition updates instead of `https://pubsub.reflag.com`. If you override `flagsPushUrl`, the SDK opens that URL with the same authenticated streaming GET behavior.
