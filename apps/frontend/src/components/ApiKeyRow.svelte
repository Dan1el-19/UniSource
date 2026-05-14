<script lang="ts">
  import type { ApiKey } from '$lib/api';
  import StatusBadge from './StatusBadge.svelte';

  let { key: k, serviceId }: { key: ApiKey; serviceId: string } = $props();

  function fmtDate(ts: number | null) {
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleDateString();
  }
</script>

<div class="row">
  <div class="row-info">
    <div class="row-top">
      <span class="row-name">{k.name}</span>
      {#if k.revoked_at}
        <StatusBadge label="revoked" variant="danger" />
      {:else if k.expires_at && k.expires_at < Date.now() / 1000}
        <StatusBadge label="expired" variant="warning" />
      {:else}
        <StatusBadge label="active" variant="success" />
      {/if}
    </div>
    <p class="row-prefix">{k.key_prefix}…</p>
    <p class="row-meta">
      {k.permissions.join(', ')}
      {#if k.expires_at} · Expires {fmtDate(k.expires_at)}{/if}
      {#if k.last_used_at} · Last used {fmtDate(k.last_used_at)}{/if}
    </p>
  </div>

  {#if !k.revoked_at}
    <div class="row-actions">
      <form method="POST" action="?/rotate">
        <input type="hidden" name="keyId" value={k.id} />
        <button type="submit" class="btn-ghost">Rotate</button>
      </form>
      <form method="POST" action="?/revoke">
        <input type="hidden" name="keyId" value={k.id} />
        <button type="submit" class="btn-danger">Revoke</button>
      </form>
    </div>
  {/if}
</div>

<style>
  .row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--color-border);
    transition: background 0.1s;
  }
  .row:last-child {
    border-bottom: none;
  }
  .row:hover {
    background: var(--color-surface-hover);
  }

  @media (max-width: 640px) {
    .row {
      flex-direction: column;
      gap: 10px;
    }
    .row-actions {
      width: 100%;
    }
  }

  .row-info {
    flex: 1;
    min-width: 0;
  }
  .row-top {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .row-name {
    font-size: 14px;
    font-weight: 600;
  }
  .row-prefix {
    font-size: 11.5px;
    font-family: var(--font-mono);
    color: var(--color-muted);
    margin: 3px 0;
  }
  .row-meta {
    font-size: 11.5px;
    color: var(--color-muted);
    margin: 2px 0 0;
  }

  .row-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }
  @media (max-width: 640px) {
    .row-actions form {
      flex: 1;
    }
    .row-actions :global(.btn-ghost),
    .row-actions :global(.btn-danger) {
      width: 100%;
      justify-content: center;
    }
  }
</style>
