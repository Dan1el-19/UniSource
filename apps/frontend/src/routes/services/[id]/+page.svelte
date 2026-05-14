<script lang="ts">
  import type { LayoutData } from './$types';
  import UsageBar from '$components/UsageBar.svelte';
  import AdminCard from '$components/AdminCard.svelte';

  let { data }: { data: LayoutData } = $props();
  const s = $derived(data.service);

  function fmtBytes(n: number) {
    if (n >= 1e12) return (n / 1e12).toFixed(1) + ' TB';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + ' GB';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB';
    return (n / 1e3).toFixed(0) + ' KB';
  }
</script>

<div class="overview-grid">
  <AdminCard title="Storage">
    <UsageBar used={s.current_used_bytes} max={s.max_storage_bytes} />
    <p class="storage-text">
      <strong>{fmtBytes(s.current_used_bytes)}</strong> used of {fmtBytes(s.max_storage_bytes)}
    </p>
  </AdminCard>

  <AdminCard title="Settings">
    <dl class="settings-list">
      <div class="setting-row">
        <dt>Bucket</dt>
        <dd>{s.default_bucket}</dd>
      </div>
      <div class="setting-row">
        <dt>Max file size</dt>
        <dd>{fmtBytes(s.max_file_size_bytes)}</dd>
      </div>
      <div class="setting-row">
        <dt>Upload destination</dt>
        <dd>{s.recommended_upload_destination}</dd>
      </div>
    </dl>
    <a href="/services/{s.id}/cors" class="cors-link">
      Manage CORS
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
    </a>
  </AdminCard>

  {#if s.cloudflare_config}
    <AdminCard title="Cloudflare Config">
      <pre class="cf-config">{JSON.stringify(s.cloudflare_config, null, 2)}</pre>
    </AdminCard>
  {/if}
</div>

<style>
  .overview-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
  }
  @media (min-width: 640px) {
    .overview-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .storage-text {
    font-size: 13px;
    color: var(--color-muted);
    margin: 10px 0 0;
  }
  .storage-text strong {
    color: var(--color-text);
    font-weight: 600;
  }

  .settings-list {
    margin: 0;
  }
  .setting-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    font-size: 13px;
  }
  .setting-row + .setting-row {
    border-top: 1px solid var(--color-border);
  }
  .setting-row dt {
    color: var(--color-muted);
  }
  .setting-row dd {
    font-weight: 500;
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .cors-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12.5px;
    color: var(--color-accent);
    font-weight: 600;
    margin-top: 12px;
    transition: gap 0.15s;
  }
  .cors-link:hover {
    gap: 8px;
  }

  .cf-config {
    font-size: 11.5px;
    font-family: var(--font-mono);
    color: var(--color-muted);
    overflow: auto;
    max-height: 160px;
    margin: 0;
    line-height: 1.6;
  }
</style>
