---
"@reflag/browser-sdk": minor
"@reflag/react-sdk": minor
---

Add a per-flag `flagUpdated` event that publishes each initial flag value during initialization, including bootstrapped flags after applying cached overrides. Subsequent events fire only when the effective enabled/config value or flag presence changes. Include local overrides and config key/payload changes; ignore targeting/config versions, diagnostics, and opt-in metadata. The payload is `{ key, flag }`, with `flag` undefined on removal. Keep `flagsUpdated` unchanged for raw-data subscribers.

Subscribe React `useFlag()` to updates for its own key so unrelated flag updates and metadata-only changes do not trigger rerenders. Continue reporting the latest evaluation metadata when consumers read enabled/config values.
