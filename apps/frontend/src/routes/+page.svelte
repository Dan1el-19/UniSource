<script lang="ts">
  import type { PageData } from './$types';
  import ServiceCard from '$components/ServiceCard.svelte';

  let { data }: { data: PageData } = $props();
</script>

<div class="page-pad">
  <div class="page-header">
    <div>
      <h1 class="page-title">Dashboard</h1>
      <p class="page-sub">{data.services.length} service{data.services.length !== 1 ? 's' : ''} configured</p>
    </div>
    {#if data.services.length > 0}
      <a href="/services/new" class="btn-primary">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        New service
      </a>
    {/if}
  </div>

  {#if data.services.length === 0}
    <div class="empty-hero">
      <div class="empty-hero-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
      </div>
      <h2 class="empty-hero-title">Welcome to UniSource</h2>
      <p class="empty-hero-sub">Create your first service to start managing file uploads.</p>
      <a href="/services/new" class="btn-primary">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Create first service
      </a>
    </div>
  {:else}
    <div class="service-grid">
      {#each data.services as service (service.id)}
        <ServiceCard {service} />
      {/each}
    </div>
  {/if}
</div>

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

  .service-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
  }
  @media (min-width: 600px) {
    .service-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (min-width: 1024px) {
    .service-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  .empty-hero {
    text-align: center;
    padding: 72px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .empty-hero-icon {
    color: var(--color-muted);
    opacity: 0.4;
    margin-bottom: 8px;
  }
  .empty-hero-title {
    font-size: 20px;
    font-weight: 700;
    margin: 0;
  }
  .empty-hero-sub {
    font-size: 13.5px;
    color: var(--color-muted);
    margin: 0 0 8px;
  }
</style>
