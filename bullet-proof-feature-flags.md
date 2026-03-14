# Bullet proof feature flags

**Keep your app running even if Reflag is temporarily unavailable.**

Reflag servers remain the primary source of truth. Even without any special setup, Reflag already behaves well in many failure cases: the Node SDK keeps using flag definitions it has already fetched in memory, and client-side SDKs can often continue from cached or previously bootstrapped flags when those are available.

The main remaining risk is startup. If the Reflag servers are down at the exact moment a new server process or client starts, and there is no saved snapshot or cached bootstrap data available yet, the browser or node process may have no local flag data to start from. In Node, this can happen after a deploy or scale-up event when a new process has not fetched flag definitions yet. In React and other client-side apps, this can happen when the client has no cached or bootstrapped flags and would otherwise need to make its first fetch from the Reflag servers.

Reflag runs a globally distributed server network with multiple redundancies. However, if you want maximum resilience in the exceedingly rare case of a Reflag outage, you should architect your application so it does not depend on live access to the Reflag servers during those startup paths.

The pattern is simple:

- on the server, use the Node SDK with `flagsFallbackProvider`
- on the client, bootstrap flags from your server instead of doing an initial client-side fetch from the Reflag servers

Together, this gives you what we call **bullet proof feature flags**.

## What this means

With this setup:

- already-running Node processes keep using the flag definitions they already have in memory
- newly-starting Node processes can initialize from the last saved snapshot
- web clients can render from flags provided by your server
- both server and client startup become highly resilient to Reflag availability issues

This is the most resilient way to use Reflag in production.

## The two parts of the setup

To get the full benefit, you need both server-side and client-side resilience.

### 1. Server-side resilience with `flagsFallbackProvider`

In the Node SDK, `flagsFallbackProvider` lets you persist the latest successfully fetched raw flag definitions to fallback storage such as:

- a local file
- Redis
- S3
- a custom backend

On startup, the SDK still tries to fetch a live snapshot from Reflag first.

If that initial fetch fails, the SDK can load the last saved snapshot from the fallback provider instead. That means new Node processes can still initialize even if they cannot reach Reflag during startup.

After successfully fetching updated flag definitions, the SDK saves the latest snapshot back through the fallback provider so it stays current.

This protects **server startup**.

### 2. Client-side resilience with bootstrapped flags

For client-side applications, you should bootstrap flags from your server.

This means the client starts with flag data that your server already prepared, instead of making its own initial request to the Reflag servers.

This protects **client startup**.

Depending on your SDK, that looks like:

- **React**: `getFlagsForBootstrap()` + `ReflagBootstrappedProvider`
- **React Native**: `ReflagBootstrappedProvider` with pre-fetched flags (following the React SDK bootstrapping patterns)
- **Browser SDK**: `bootstrappedFlags`
- **Vue SDK**: bootstrapped flags passed into the provider

## Why you need both

Using only one half of the setup improves reliability, but it does not give you the full bullet proof architecture.

### Only using `flagsFallbackProvider`

This helps your server start reliably.

But if your client app still depends on an initial fetch from the Reflag servers, then client startup can still be affected by a Reflag outage.

### Only using bootstrapped flags

This helps your client render reliably from server-provided flags.

But your server still needs to start successfully and produce those flags in the first place. Without a fallback provider, a newly-starting Node process may still fail to initialize if it cannot reach Reflag during startup.

### Using both together

This gives you the most resilient setup:

- the server can start from the last saved snapshot
- the client can start from server-provided flags
- fresh flag definitions are still fetched from Reflag whenever available

## Typical reliability flow

1. Your Node server starts and tries to fetch live flag definitions from Reflag.
2. If that succeeds, it uses those definitions immediately.
3. The server saves the latest definitions through `flagsFallbackProvider`.
4. Your server generates bootstrapped flags for the client.
5. The client starts from those bootstrapped flags instead of making an initial request to the Reflag servers.
6. If a future Node process starts while Reflag is unavailable, it can load the last saved snapshot from the fallback provider and still initialize.
7. Once Reflag becomes available again, the server resumes fetching the latest definitions and refreshes the saved snapshot.

## Recommended setup by SDK

### React

For React applications, the recommended resilient setup is:

- Node SDK on the server with `flagsFallbackProvider`
- `getFlagsForBootstrap()` on the server
- `ReflagBootstrappedProvider` in the React app

This means your React app does not depend on an initial client-side fetch from the Reflag servers on first render.

### Browser SDK

For non-React web apps using the Browser SDK:

- use the Node SDK on the server with `flagsFallbackProvider`
- generate bootstrap data on the server
- initialize the Browser SDK with `bootstrappedFlags`

This gives you the same resilience pattern: reliable server startup plus reliable client startup.

### Vue

For Vue applications:

- use the Node SDK on the server with `flagsFallbackProvider`
- generate bootstrapped flags on the server
- pass those bootstrapped flags into the Vue SDK provider

Again, the goal is to avoid depending on a live Reflag request during client initialization.

## Important clarification

This setup does not replace Reflag as the primary source of truth.

Your application should still fetch fresh flag definitions from Reflag whenever possible. What this setup changes is that your application becomes much less dependent on Reflag being reachable at the exact moment a Node process or browser session starts.

## Related docs

- Node SDK: fallback providers
- React SDK: bootstrapping with `ReflagBootstrappedProvider`
- Browser SDK: `bootstrappedFlags`
- Vue SDK: bootstrapped flags
