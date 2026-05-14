<script lang="ts">
  import type { LayoutData } from './$types';
  import { page } from '$app/stores';

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

  const tabs = $derived([
    { label: 'Overview', href: `/services/${data.service.id}` },
    { label: 'API Keys', href: `/services/${data.service.id}/api-keys` },
    { label: 'CORS', href: `/services/${data.service.id}/cors` },
    { label: 'Settings', href: `/services/${data.service.id}/edit` },
  ]);
</script>

<div class="page-pad">
  <a href="/services" class="back-link">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    Services
  </a>

  <div class="svc-header">
    <div>
      <h1 class="svc-name">{data.service.name}</h1>
      <p class="svc-id">{data.service.id}</p>
    </div>
  </div>

  <!-- Tab nav -->
  <nav class="tabs">
    {#each tabs as tab}
      <a
        href={tab.href}
        class="tab-link"
        class:active={$page.url.pathname === tab.href}
      >{tab.label}</a>
    {/each}
  </nav>

  <div class="tab-content">
    {@render children()}
  </div>
</div>

<style>
  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12.5px;
    color: var(--color-muted);
    margin-bottom: 12px;
    transition: color 0.15s;
  }
  .back-link:hover {
    color: var(--color-text);
  }

  .svc-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 4px;
  }
  .svc-name {
    font-size: 20px;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.02em;
  }
  .svc-id {
    font-size: 12px;
    font-family: var(--font-mono);
    color: var(--color-muted);
    margin: 3px 0 0;
  }

  .tabs {
    display: flex;
    gap: 4px;
    margin-top: 16px;
    border-bottom: 1px solid var(--color-border);
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .tabs::-webkit-scrollbar { display: none; }

  .tab-link {
    padding: 9px 16px;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-muted);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: color 0.15s, border-color 0.15s;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .tab-link:hover {
    color: var(--color-text);
  }
  .tab-link.active {
    color: var(--color-accent);
    border-bottom-color: var(--color-accent);
    font-weight: 600;
  }

  .tab-content {
    margin-top: 20px;
  }
</style>
