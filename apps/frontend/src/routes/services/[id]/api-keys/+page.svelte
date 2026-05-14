<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import ApiKeyRow from '$components/ApiKeyRow.svelte';
  import NewKeyModal from '$components/NewKeyModal.svelte';
  import EmptyState from '$components/EmptyState.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let showNewKey = $state(false);
  let revealedKey = $state<string | null>(null);

  $effect(() => {
    if (form && 'created' in form && form.created?.plaintext_key) {
      revealedKey = form.created.plaintext_key;
      showNewKey = false;
    }
    if (form && 'rotated' in form && form.rotated?.plaintext_key) {
      revealedKey = form.rotated.plaintext_key;
    }
  });
</script>

<div>
  <div class="section-top">
    <h2 class="section-title">API Keys</h2>
    <button onclick={() => (showNewKey = true)} class="btn-primary">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      New key
    </button>
  </div>

  {#if revealedKey}
    <div class="alert-success key-reveal">
      <p class="key-reveal-title">Key created — copy it now, it won't be shown again.</p>
      <div class="key-reveal-row">
        <code class="key-reveal-code">{revealedKey}</code>
        <button
          onclick={() => { navigator.clipboard.writeText(revealedKey!); }}
          class="btn-ghost">Copy</button>
      </div>
      <button onclick={() => (revealedKey = null)} class="key-dismiss">Dismiss</button>
    </div>
  {/if}

  {#if form?.error}
    <div class="alert-error">{form.error}</div>
  {/if}

  {#if data.keys.length === 0}
    <EmptyState message="No API keys yet." action={{ label: 'Create first key', href: '#' }} />
  {:else}
    <div class="card">
      {#each data.keys as key (key.id)}
        <ApiKeyRow {key} serviceId={data.service.id} />
      {/each}
    </div>
  {/if}
</div>

{#if showNewKey}
  <NewKeyModal serviceId={data.service.id} onclose={() => (showNewKey = false)} />
{/if}

<style>
  .section-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    gap: 12px;
  }
  .section-title {
    font-size: 16px;
    font-weight: 700;
    margin: 0;
  }

  .key-reveal {
    margin-bottom: 16px;
  }
  .key-reveal-title {
    font-size: 12px;
    font-weight: 700;
    margin: 0 0 10px;
  }
  .key-reveal-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .key-reveal-code {
    flex: 1;
    font-size: 11.5px;
    font-family: var(--font-mono);
    background: rgba(0,0,0,0.3);
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    word-break: break-all;
  }
  .key-dismiss {
    background: none;
    border: none;
    color: var(--color-muted);
    font-size: 12px;
    cursor: pointer;
    padding: 0;
    margin-top: 8px;
  }
  .key-dismiss:hover {
    color: var(--color-text);
  }
</style>
