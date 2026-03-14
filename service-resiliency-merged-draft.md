# Service resiliency

**Bullet proof feature flags: keep your app running even if Reflag is temporarily unavailable.**

Reflag runs a globally distributed server network with multiple redundancies. Even without any special setup, Reflag already behaves well in many failure cases. Our SDKs are designed to continue serving flags from local or cached state wherever possible, reducing both latency and dependency on live round trips to Reflag for every flag evaluation. In this article, when we talk about the client, we mean your client-side application runtime, such as a browser JavaScript app or a React Native app.

The main remaining risk is startup. If the Reflag servers are unavailable at the exact moment a new Node process or browser session starts, and there is no previously fetched or bootstrapped flag data available locally, that runtime may have no local flag data to start from.

If you want maximum resilience in the exceedingly rare case of a Reflag outage, see [Bullet proof feature flags](#bullet-proof-feature-flags) below for the recommended setup.

## Built-in resilience in Reflag

### Local evaluation

To remove latency and provide downtime protection, the Node SDK and OpenFeature Node provider perform local evaluation of flag rules.

With local evaluation, the SDK downloads flag definitions from Reflag and evaluates user and company properties locally inside your application instead of contacting Reflag on every flag check.

This means:
- flag evaluation is fast
- already-running processes continue working even if Reflag becomes temporarily unavailable
- the in-memory flag definitions remain usable until the process restarts

### Edge runtime support

For edge runtimes such as Cloudflare Workers, the Node SDK also keeps flag definitions cached in memory.

When a worker instance starts:
- the first request fetches definitions from Reflag
- later requests use the cached definitions
- when the cache expires, stale definitions can continue to be used while an update happens in the background

This means requests are not blocked on every refresh, and during disruption, cached definitions continue to be served.

### Client SDK caching

Client-side SDKs cache the last known flags and continue using them if the browser cannot reach Reflag.

This helps protect already-initialized client sessions from temporary network or service disruption.

### Offline mode

All SDKs support offline mode with explicit local flag overrides.

Offline mode is mostly useful for:
- local development
- testing
- controlled fallback behavior

It is different from resilience features like local evaluation or fallback providers because it uses explicit local configuration rather than the latest definitions fetched from Reflag.

## The remaining gap: startup resilience

Even with all of the protections above, one edge case remains:

- a new Node process starts after a deploy or scale-up
- or a browser session starts with no cached or bootstrapped flags
- and at that exact moment Reflag is unavailable

In that case, the runtime may not yet have any local flag data to use.

That is where the final pieces come in:
- `flagsFallbackProvider` for the server
- bootstrapped flags for the client

## Bullet proof feature flags

The most resilient Reflag architecture combines:

- `flagsFallbackProvider` on the server
- bootstrapped flags on the client

In practice, bootstrapping means your server evaluates or prepares the flag data first and then includes that data in the initial response to the client, or exposes it through a bootstrap endpoint. The client then starts from that server-provided flag data instead of needing its own first request to the Reflag servers.

### Server-side startup protection with `flagsFallbackProvider`

`flagsFallbackProvider` lets the Node SDK persist the latest successfully fetched raw flag definitions to durable fallback storage such as:
- a local file
- Redis
- S3
- a custom backend

On startup, the SDK still tries to fetch a live snapshot from Reflag first.

If that initial fetch fails, it can load the last saved snapshot from the fallback provider instead. This allows newly-starting Node processes to initialize even if they cannot reach Reflag during startup.

After successfully fetching updated definitions, the SDK saves the latest snapshot back to the fallback provider to keep it current.

### Client startup protection with bootstrapped flags

Bootstrapped flags let the server pass evaluated or prepared flag data directly to the client when the app loads.

This means the client can start from server-provided flag data instead of making its own first request to the Reflag servers.

This is supported through:
- **React**: `getFlagsForBootstrap()` + `ReflagBootstrappedProvider`
- **React Native**: `ReflagBootstrappedProvider` with pre-fetched flags (see the React SDK bootstrapping patterns)
- **Browser SDK**: `bootstrappedFlags`
- **Vue SDK**: bootstrapped flags via the provider

### Why both client-side and server-side are needed

Using only one of these helps, but does not give you the full resilience story.

- `flagsFallbackProvider` protects **server startup**
- bootstrapped flags protect **client startup**

Using both together gives you the most resilient setup.

## Recommended architecture

For the most resilient production setup:

- use the Node SDK with `flagsFallbackProvider`
- evaluate or prepare flags on the server
- bootstrap those flags into your client app
- let Reflag continue as the primary source of truth whenever available

With this setup:
- already-running Node processes keep using in-memory definitions
- newly-starting Node processes can load the last saved snapshot
- browser clients can start from server-provided flags
- your app becomes highly resilient to Reflag availability issues

## Important clarification

This does not replace Reflag as the source of truth.

Your application should still fetch the latest flag definitions from Reflag whenever possible. These resilience features simply reduce your dependence on Reflag being reachable at the exact moment a process or client starts.
