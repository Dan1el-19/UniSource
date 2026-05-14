<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import EmptyState from '$components/EmptyState.svelte';
  import StatusBadge from '$components/StatusBadge.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let showNew = $state(false);
  let revealedKey = $state<string | null>(null);

  $effect(() => {
    if (form && 'created' in form && form.created?.plaintext_key) {
      revealedKey = form.created.plaintext_key;
      showNew = false;
    }
  });

  function handleModalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && showNew) showNew = false;
  }
</script>

<svelte:window onkeydown={handleModalKeydown} />

<div class="page-pad">
  <div class="page-header">
    <div>
      <h1 class="page-title">Account Keys</h1>
      <p class="page-sub">Keys that span multiple services</p>
    </div>
    <button onclick={() => (showNew = true)} class="btn-primary">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      New key
    </button>
  </div>

  {#if revealedKey}
    <div class="alert-success key-reveal">
      <p class="key-reveal-title">Key created — copy it now.</p>
      <div class="key-reveal-row">
        <code class="key-reveal-code">{revealedKey}</code>
        <button onclick={() => navigator.clipboard.writeText(revealedKey!)} class="btn-ghost">Copy</button>
      </div>
      <button onclick={() => (revealedKey = null)} class="key-dismiss">Dismiss</button>
    </div>
  {/if}

  {#if form?.error}
    <div class="alert-error">{form.error}</div>
  {/if}

  {#if data.keys.length === 0}
    <EmptyState message="No account-level keys yet." />
  {:else}
    <div class="card">
      {#each data.keys as key (key.id)}
        <div class="ak-row">
          <div class="ak-info">
            <div class="ak-top">
              <span class="ak-name">{key.name}</span>
              {#if key.revoked_at}
                <StatusBadge label="revoked" variant="danger" />
              {/if}
            </div>
            <p class="ak-prefix">{key.key_prefix}…</p>
            <p class="ak-meta">Services: {key.service_ids.join(', ') || '—'}</p>
            <p class="ak-meta">Permissions: {key.permissions.join(', ')}</p>
          </div>
          {#if !key.revoked_at}
            <div class="ak-actions">
              <form method="POST" action="?/revoke">
                <input type="hidden" name="keyId" value={key.id} />
                <button type="submit" class="btn-danger">Revoke</button>
              </form>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if showNew}
  <!-- svelte-ignore a11y_interactive_supports_focus a11y_click_events_have_key_events -->
  <div class="modal-overlay" role="dialog" aria-modal="true" onclick={() => (showNew = false)} onkeydown={handleModalKeydown} tabindex="-1">
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div class="modal" onclick={(e: MouseEvent) => e.stopPropagation()} onkeydown={(e: KeyboardEvent) => e.stopPropagation()}>
      <div class="modal-header">
        <h2 class="modal-title">New Account Key</h2>
        <button class="modal-close" onclick={() => (showNew = false)} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <form method="POST" action="?/create">
        <div class="modal-body">
          <div class="field">
            <label for="ak-name">Name</label>
            <input id="ak-name" name="name" type="text" required placeholder="My integration" />
          </div>
          <div class="field">
            <label for="ak-perms">Permissions</label>
            <input id="ak-perms" name="permissions" type="text" placeholder="upload, files:read" required />
          </div>
          <div class="field">
            <label for="ak-svcs">Service IDs</label>
            <input id="ak-svcs" name="service_ids" type="text" placeholder="usrc, chmura-blokserwis" required />
          </div>
        </div>
        <div class="modal-footer">
          <button type="submit" class="btn-primary">Create key</button>
          <button type="button" onclick={() => (showNew = false)} class="btn-ghost">Cancel</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
    flex-wrap: wrap;
  }
  .page-title {
    font-size: 22px;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.02em;
  }
  .page-sub {
    font-size: 13px;
    color: var(--color-muted);
    margin: 4px 0 0;
  }

  .key-reveal {
    margin-bottom: 20px;
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
  .key-dismiss:hover { color: var(--color-text); }

  /* Account key rows */
  .ak-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--color-border);
    transition: background 0.1s;
  }
  .ak-row:last-child { border-bottom: none; }
  .ak-row:hover { background: var(--color-surface-hover); }

  .ak-info { flex: 1; min-width: 0; }
  .ak-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .ak-name { font-size: 14px; font-weight: 600; }
  .ak-prefix { font-size: 11.5px; font-family: var(--font-mono); color: var(--color-muted); margin: 3px 0; }
  .ak-meta { font-size: 11.5px; color: var(--color-muted); margin: 1px 0; }
  .ak-actions { flex-shrink: 0; }

  @media (max-width: 640px) {
    .ak-row { flex-direction: column; gap: 10px; }
    .ak-actions { width: 100%; }
    .ak-actions form { width: 100%; }
    .ak-actions :global(.btn-danger) { width: 100%; justify-content: center; }
  }

  /* Modal */
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 50; padding: 16px;
    animation: fadeIn 0.15s ease;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .modal {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    width: 100%; max-width: 440px;
    max-height: 90vh; overflow-y: auto;
    animation: slideUp 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

  .modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 20px 0;
  }
  .modal-title { font-size: 16px; font-weight: 700; margin: 0; }
  .modal-close {
    display: flex; align-items: center; justify-content: center;
    width: 30px; height: 30px;
    background: transparent; border: none;
    color: var(--color-muted); cursor: pointer;
    border-radius: var(--radius-sm);
    transition: background 0.15s, color 0.15s;
  }
  .modal-close:hover { background: var(--color-surface-hover); color: var(--color-text); }

  .modal-body {
    display: flex; flex-direction: column; gap: 14px;
    padding: 18px 20px;
  }
  .modal-footer {
    display: flex; gap: 8px;
    padding: 0 20px 20px;
  }

  @media (max-width: 480px) {
    .modal-footer { flex-direction: column; }
    .modal-footer :global(.btn-primary),
    .modal-footer :global(.btn-ghost) { width: 100%; justify-content: center; }
  }

  :global(.alert-error) { margin-bottom: 20px; }
</style>
