# `onAfterSubmit` timing demo

Shows the real gap between a user submitting feedback and `onAfterSubmit`
firing, and proves what happens to that callback — and to the feedback
itself — if the tab goes away before the request completes.

Builds the actual widget from this branch's `src/`, talking to a local mock
API instead of `front.reflag.com`.

## Run it

From the repo root, with dependencies installed for `@reflag/browser-sdk`
(`yarn install` once):

```sh
cd packages/browser-sdk
node example/feedback-after-submit-demo/start.mjs
```

Open the printed URL (defaults to `http://localhost:5183`).

## What to look at

1. **Artificial latency** — widen the delay so the gap between submit and
   `onAfterSubmit` is easy to see.
2. **Live widget** — submit feedback for real. The banner stays red for as
   long as the request is pending (`onAfterSubmit` has not run yet) and only
   turns green once the callback actually fires.
3. **Navigate away mid-submit** — fires the same request the widget's Send
   button does, then navigates away before the response can arrive,
   simulating a closed tab. The table's "server actually received it?" column
   is ground truth from the mock API's own log, independent of whatever the
   tab believes happened. On localhost this often still arrives — the request
   is tiny and loopback latency is near zero, so sending finishes before the
   navigation can interrupt it. On a real network that's not guaranteed:
   without `keepalive` (which the SDK doesn't set for this request), a slower
   connection can lose it outright; the `keepalive` checkbox bypasses the SDK
   to show what setting it would buy you. What's guaranteed every time,
   regardless of network speed or `keepalive`, is the other column: the
   client never sees `onAfterSubmit` fire, because the page that would have
   run it is gone.
