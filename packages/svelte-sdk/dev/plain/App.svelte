<script lang="ts">
  import { onMount } from 'svelte';
  import { 
    createReflagProvider, 
    useFlag, 
    useTrack, 
    useClient, 
    useIsLoading,
    type ReflagProps 
  } from '../../src';

  // Initialize the Reflag provider
  const reflagConfig: ReflagProps = {
    apiKey: 'demo-api-key',
    user: {
      id: 'demo-user',
      email: 'demo@example.com',
      name: 'Demo User'
    },
    company: {
      id: 'demo-company',
      name: 'Demo Company'
    },
    debug: true
  };

  let providerInitialized = false;

  onMount(() => {
    createReflagProvider(reflagConfig);
    providerInitialized = true;
  });

  // Use the SDK features
  $: client = providerInitialized ? useClient() : null;
  $: isLoading = providerInitialized ? useIsLoading() : null;
  $: track = providerInitialized ? useTrack() : null;
  
  // Example feature flags
  $: huddleFlag = providerInitialized ? useFlag('huddle') : null;
  $: fileUploadsFlag = providerInitialized ? useFlag('file-uploads') : null;

  function handleTrackEvent() {
    if (track) {
      track('button_clicked', { buttonName: 'Track Event' });
    }
  }

  function handleHuddleTrack() {
    if (huddleFlag) {
      huddleFlag.track();
    }
  }

  function handleFileUploadsTrack() {
    if (fileUploadsFlag) {
      fileUploadsFlag.track();
    }
  }

  function handleRequestFeedback() {
    if (huddleFlag) {
      huddleFlag.requestFeedback({
        title: "How was your huddle experience?",
        prompt: "Please let us know how we can improve the huddle feature."
      });
    }
  }
</script>

<main>
  <h1>Reflag Svelte SDK Demo</h1>
  
  {#if !providerInitialized}
    <p>Initializing Reflag provider...</p>
  {:else}
    <div class="status">
      <h2>SDK Status</h2>
      <p>Loading: {$isLoading ? 'Yes' : 'No'}</p>
      <p>Client: {$client ? 'Connected' : 'Not connected'}</p>
    </div>

    <div class="flags">
      <h2>Feature Flags</h2>
      
      <div class="flag-card">
        <h3>Huddle Feature</h3>
        {#if huddleFlag}
          <p>Enabled: {$huddleFlag.isEnabled ? 'Yes' : 'No'}</p>
          <p>Loading: {$huddleFlag.isLoading ? 'Yes' : 'No'}</p>
          <p>Config: {JSON.stringify($huddleFlag.config)}</p>
          
          {#if $huddleFlag.isEnabled}
            <button on:click={handleHuddleTrack}>Start Huddle (Track)</button>
            <button on:click={handleRequestFeedback}>Request Feedback</button>
          {/if}
        {:else}
          <p>Loading flag...</p>
        {/if}
      </div>

      <div class="flag-card">
        <h3>File Uploads Feature</h3>
        {#if fileUploadsFlag}
          <p>Enabled: {$fileUploadsFlag.isEnabled ? 'Yes' : 'No'}</p>
          <p>Loading: {$fileUploadsFlag.isLoading ? 'Yes' : 'No'}</p>
          <p>Config: {JSON.stringify($fileUploadsFlag.config)}</p>
          
          {#if $fileUploadsFlag.isEnabled}
            <button on:click={handleFileUploadsTrack}>Upload File (Track)</button>
          {/if}
        {:else}
          <p>Loading flag...</p>
        {/if}
      </div>
    </div>

    <div class="actions">
      <h2>Actions</h2>
      <button on:click={handleTrackEvent}>Track Custom Event</button>
    </div>
  {/if}
</main>

<style>
  main {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
    font-family: Arial, sans-serif;
  }

  h1 {
    color: #333;
    text-align: center;
    margin-bottom: 2rem;
  }

  h2 {
    color: #555;
    border-bottom: 2px solid #eee;
    padding-bottom: 0.5rem;
  }

  .status, .flags, .actions {
    margin-bottom: 2rem;
    padding: 1rem;
    background: #f9f9f9;
    border-radius: 8px;
  }

  .flag-card {
    background: white;
    padding: 1rem;
    margin: 1rem 0;
    border-radius: 6px;
    border: 1px solid #ddd;
  }

  .flag-card h3 {
    margin-top: 0;
    color: #444;
  }

  button {
    background: #007cba;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    margin: 0.25rem 0.5rem 0.25rem 0;
  }

  button:hover {
    background: #005a8b;
  }

  p {
    margin: 0.5rem 0;
  }
</style>