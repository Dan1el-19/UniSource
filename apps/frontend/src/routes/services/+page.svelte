<script lang="ts">
  import type { PageData } from './$types';
  import SectionHeader from '$components/SectionHeader.svelte';
  import EmptyState from '$components/EmptyState.svelte';
  import StatusBadge from '$components/StatusBadge.svelte';

  let { data }: { data: PageData } = $props();

  function fmtBytes(n: number) {
    if (n >= 1e12) return (n / 1e12).toFixed(1) + ' TB';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + ' GB';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB';
    return (n / 1e3).toFixed(0) + ' KB';
  }
</script>

<div class="page-pad">
  <SectionHeader title="Services">
    <a href="/services/new" class="btn-primary">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      New service
    </a>
  </SectionHeader>

  {#if data.services.length === 0}
    <EmptyState message="No services configured." action={{ label: 'Create first service', href: '/services/new' }} />
  {:else}
    <!-- Desktop table -->
    <div class="card mt-4 desktop-only">
      <table class="svc-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Storage</th>
            <th>Destination</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each data.services as s (s.id)}
            <tr>
              <td class="mono">{s.id}</td>
              <td class="fw">{s.name}</td>
              <td class="muted">{fmtBytes(s.current_used_bytes)} / {fmtBytes(s.max_storage_bytes)}</td>
              <td><StatusBadge label={s.recommended_upload_destination} /></td>
              <td class="actions">
                <a href="/services/{s.id}" class="btn-ghost">Manage</a>
                <form method="POST" action="?/delete" onsubmit={(e) => { if (!confirm(`Delete "${s.name}"? This cannot be undone.`)) e.preventDefault(); }}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" class="btn-danger">Delete</button>
                </form>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Mobile cards -->
    <div class="mobile-cards">
      {#each data.services as s (s.id)}
        <a href="/services/{s.id}" class="svc-card">
          <div class="svc-card-top">
            <div>
              <span class="svc-card-name">{s.name}</span>
              <span class="svc-card-id">{s.id}</span>
            </div>
            <StatusBadge label={s.recommended_upload_destination} />
          </div>
          <div class="svc-card-bottom">
            <span class="svc-card-storage">{fmtBytes(s.current_used_bytes)} / {fmtBytes(s.max_storage_bytes)}</span>
            <form method="POST" action="?/delete" onsubmit={(e) => { e.stopPropagation(); if (!confirm(`Delete "${s.name}"?`)) e.preventDefault(); }}>
              <input type="hidden" name="id" value={s.id} />
              <button type="submit" class="btn-danger" onclick={(e: MouseEvent) => e.stopPropagation()}>Delete</button>
            </form>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>

<style>
  .desktop-only { display: none; }
  @media (min-width: 768px) {
    .desktop-only { display: block; }
  }

  .mobile-cards { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
  @media (min-width: 768px) {
    .mobile-cards { display: none; }
  }

  /* Desktop table */
  .svc-table {
    width: 100%;
    font-size: 13px;
    border-collapse: collapse;
  }
  .svc-table th {
    text-align: left;
    padding: 10px 14px;
    font-size: 11px;
    font-weight: 700;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--color-border);
  }
  .svc-table td {
    padding: 12px 14px;
    border-bottom: 1px solid var(--color-border);
  }
  .svc-table tr:last-child td {
    border-bottom: none;
  }
  .svc-table tr:hover td {
    background: var(--color-surface-hover);
  }
  .svc-table .mono {
    font-family: var(--font-mono);
    font-size: 11.5px;
  }
  .svc-table .fw { font-weight: 600; }
  .svc-table .muted { color: var(--color-muted); }
  .svc-table .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  /* Mobile cards */
  .svc-card {
    display: block;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 16px;
    transition: border-color 0.15s;
  }
  .svc-card:hover {
    border-color: var(--color-accent);
  }
  .svc-card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 12px;
  }
  .svc-card-name {
    display: block;
    font-size: 15px;
    font-weight: 600;
  }
  .svc-card-id {
    display: block;
    font-size: 11.5px;
    font-family: var(--font-mono);
    color: var(--color-muted);
    margin-top: 2px;
  }
  .svc-card-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .svc-card-storage {
    font-size: 12px;
    color: var(--color-muted);
  }
</style>
