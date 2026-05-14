<script lang="ts">
  import type { Service } from '$lib/api';
  import UsageBar from './UsageBar.svelte';

  let { service }: { service: Service } = $props();

  function fmtBytes(n: number) {
    if (n >= 1e12) return (n / 1e12).toFixed(1) + ' TB';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + ' GB';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB';
    return (n / 1e3).toFixed(0) + ' KB';
  }
</script>

<a href="/services/{service.id}" class="card">
  <div class="card-top">
    <div class="card-icon">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
    </div>
    <span class="badge">{service.recommended_upload_destination}</span>
  </div>

  <p class="card-name">{service.name}</p>
  <p class="card-id">{service.id}</p>

  <div class="card-storage">
    <UsageBar used={service.current_used_bytes} max={service.max_storage_bytes} />
    <p class="storage-text">{fmtBytes(service.current_used_bytes)} / {fmtBytes(service.max_storage_bytes)}</p>
  </div>
</a>

<style>
  .card {
    display: block;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 18px;
    transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
  }
  .card:hover {
    border-color: var(--color-accent);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(240, 140, 78, 0.1);
  }
  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .card-icon {
    width: 36px;
    height: 36px;
    background: var(--color-accent-soft);
    color: var(--color-accent);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    font-size: 10.5px;
    padding: 3px 10px;
    background: var(--color-accent-soft);
    color: var(--color-accent);
    border-radius: var(--radius-full);
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .card-name {
    font-size: 15px;
    font-weight: 600;
    margin: 0 0 2px;
    color: var(--color-text);
  }
  .card-id {
    font-size: 12px;
    font-family: var(--font-mono);
    color: var(--color-muted);
    margin: 0 0 14px;
  }
  .card-storage {
    margin-top: 4px;
  }
  .storage-text {
    font-size: 11.5px;
    color: var(--color-muted);
    margin: 6px 0 0;
  }
</style>
