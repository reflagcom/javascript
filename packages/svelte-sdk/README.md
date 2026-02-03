# Reflag Svelte SDK

The Reflag Svelte SDK provides a simple and intuitive way to integrate feature flags into your Svelte applications. Built on top of the Reflag browser SDK, it offers reactive stores and utilities that work seamlessly with Svelte's reactivity system.

## Installation

```bash
npm install @reflag/svelte-sdk
# or
yarn add @reflag/svelte-sdk
# or
pnpm add @reflag/svelte-sdk
```

## Quick Start

### 1. Set up the Provider

First, initialize the Reflag provider at the root of your application:

```javascript
// main.ts or App.svelte
import { createReflagProvider } from '@reflag/svelte-sdk';

// Initialize the provider
createReflagProvider({
  apiKey: 'your-api-key',
  user: {
    id: 'user-123',
    email: 'user@example.com',
    name: 'John Doe'
  },
  company: {
    id: 'company-456',
    name: 'Acme Inc'
  }
});
```

### 2. Use Feature Flags in Components

```svelte
<script lang="ts">
  import { useFlag, useTrack } from '@reflag/svelte-sdk';

  // Get a feature flag
  const huddleFlag = useFlag('huddle');
  const track = useTrack();

  function startHuddle() {
    // Track the feature usage
    huddleFlag.track();
    
    // Your huddle logic here
    console.log('Starting huddle...');
  }
</script>

{#if $huddleFlag.isEnabled}
  <button on:click={startHuddle}>
    {$huddleFlag.config.payload?.buttonText || 'Start Huddle'}
  </button>
{:else}
  <p>Huddle feature is not available</p>
{/if}
```

## API Reference

### Provider

#### `createReflagProvider(props: ReflagProps)`

Creates and initializes the Reflag provider. This should be called once at the root of your application.

**Parameters:**
- `props.apiKey` (string): Your Reflag API key
- `props.user` (object, optional): User context information
- `props.company` (object, optional): Company context information
- `props.otherContext` (object, optional): Additional context information
- `props.debug` (boolean, optional): Enable debug logging

### Stores and Utilities

#### `useFlag(key: string)`

Returns a reactive flag object with the following properties:

- `isEnabled` (Readable<boolean>): Whether the flag is enabled
- `isLoading` (Readable<boolean>): Whether the flag is currently loading
- `config` (Readable<object>): The flag's configuration data
- `track()` (function): Track usage of this flag
- `requestFeedback(options)` (function): Request feedback for this flag

**Example:**
```svelte
<script lang="ts">
  import { useFlag } from '@reflag/svelte-sdk';
  
  const myFlag = useFlag('my-feature');
</script>

{#if $myFlag.isLoading}
  <p>Loading...</p>
{:else if $myFlag.isEnabled}
  <div>Feature is enabled!</div>
  <button on:click={() => myFlag.track()}>Use Feature</button>
{:else}
  <div>Feature is disabled</div>
{/if}
```

#### `useTrack()`

Returns a function to track custom events.

**Example:**
```svelte
<script lang="ts">
  import { useTrack } from '@reflag/svelte-sdk';
  
  const track = useTrack();
  
  function handleClick() {
    track('button_clicked', { buttonName: 'CTA Button' });
  }
</script>

<button on:click={handleClick}>Click me</button>
```

#### `useClient()`

Returns a readable store containing the current ReflagClient instance.

**Example:**
```svelte
<script lang="ts">
  import { useClient } from '@reflag/svelte-sdk';
  
  const client = useClient();
  
  // Access client methods
  $: if ($client) {
    console.log('Client is ready');
  }
</script>
```

#### `useIsLoading()`

Returns a readable store indicating whether the SDK is currently loading.

**Example:**
```svelte
<script lang="ts">
  import { useIsLoading } from '@reflag/svelte-sdk';
  
  const isLoading = useIsLoading();
</script>

{#if $isLoading}
  <div>Loading flags...</div>
{:else}
  <div>Flags loaded!</div>
{/if}
```

#### `useRequestFeedback()`

Returns a function to request feedback from users.

**Example:**
```svelte
<script lang="ts">
  import { useRequestFeedback } from '@reflag/svelte-sdk';
  
  const requestFeedback = useRequestFeedback();
  
  function askForFeedback() {
    requestFeedback({
      flagKey: 'my-feature',
      title: 'How was your experience?',
      prompt: 'Please let us know how we can improve this feature.'
    });
  }
</script>

<button on:click={askForFeedback}>Give Feedback</button>
```

#### `useSendFeedback()`

Returns a function to send feedback programmatically.

#### `useUpdateUser()`, `useUpdateCompany()`, `useUpdateOtherContext()`

Return functions to update context information, which will trigger flag re-evaluation.

**Example:**
```svelte
<script lang="ts">
  import { useUpdateUser } from '@reflag/svelte-sdk';
  
  const updateUser = useUpdateUser();
  
  function upgradeUser() {
    updateUser({ plan: 'premium' });
  }
</script>

<button on:click={upgradeUser}>Upgrade to Premium</button>
```

## TypeScript Support

The SDK includes full TypeScript support. You can extend the `Flags` interface to get type-safe flag keys:

```typescript
// types/reflag.d.ts
declare module '@reflag/svelte-sdk' {
  interface Flags {
    'huddle': {
      config: {
        payload: {
          buttonText: string;
          maxParticipants: number;
        };
      };
    };
    'file-uploads': {
      config: {
        payload: {
          maxFileSize: number;
          allowedTypes: string[];
        };
      };
    };
  }
}
```

Now you'll get full type safety:

```svelte
<script lang="ts">
  import { useFlag } from '@reflag/svelte-sdk';
  
  // TypeScript knows this returns the correct type
  const huddle = useFlag('huddle');
  
  // TypeScript knows config.payload has buttonText and maxParticipants
  $: buttonText = $huddle.config.payload?.buttonText || 'Start Huddle';
</script>
```

## Error Handling

The SDK will throw an error if you try to use any of the utilities without first calling `createReflagProvider()`:

```javascript
// This will throw an error
const flag = useFlag('my-flag'); // Error: ReflagProvider is missing
```

Make sure to call `createReflagProvider()` before using any other SDK functions.

## Development

To run the development example:

```bash
cd packages/svelte-sdk
yarn dev
```

This will start a development server with a demo application showing the SDK in action.

## Testing

```bash
yarn test
```

## Building

```bash
yarn build
```

## License

MIT