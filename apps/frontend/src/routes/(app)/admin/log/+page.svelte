<script lang="ts">
  import { onMount } from 'svelte';
  import { Activity, ArrowLeft, LoaderCircle, RefreshCw, Upload } from 'lucide-svelte';
  import type { AuditLogListResponse, UploadsListResponse } from '@unisource/sdk';
  import { apiClient } from '$lib/api';
  import { authState } from '../../../../state/auth.svelte';

  const actionLabels: Record<string, string> = {
    upload_completed: 'Upload zakończony',
    file_deleted: 'Plik usunięty',
    folder_deleted: 'Folder usunięty',
    quota_exceeded: 'Przekroczono limit',
    share_link_accessed: 'Link udostępnienia',
  };

  const uploadStatusLabels: Record<string, string> = {
    pending: 'Oczekuje',
    completed: 'Gotowy',
    failed: 'Błąd',
  };

  let sessionReady = $state(false);
  let isLoading = $state(true);
  let isRefreshing = $state(false);
  let error = $state<string | null>(null);
  let auditLog = $state<AuditLogListResponse['items']>([]);
  let uploads = $state<UploadsListResponse['items']>([]);

  function formatBytes(bytes: number | null | undefined) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** power).toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
  }

  function formatDate(ts: number) {
    return new Date(ts * 1000).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
  }

  async function loadFeed() {
    isRefreshing = true;
    error = null;

    try {
      const [auditRes, uploadsRes] = await Promise.all([
        apiClient.admin.auditLog({ limit: 40 }),
        apiClient.admin.listUploads({ limit: 30 }),
      ]);

      auditLog = auditRes.items;
      uploads = uploadsRes.items;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Nie udało się pobrać pełnego logu.';
    } finally {
      isRefreshing = false;
      isLoading = false;
    }
  }

  onMount(() => {
    let cancelled = false;

    (async () => {
      const currentUser = await authState.checkSession();
      if (cancelled) return;

      if (!currentUser) {
        window.location.replace('/login');
        return;
      }

      if (!authState.isAdmin(currentUser)) {
        window.location.replace('/drive');
        return;
      }

      sessionReady = true;
      await loadFeed();
    })();

    return () => {
      cancelled = true;
    };
  });
</script>

<section class="log-wrap">
  <div class="page-header">
    <div class="page-copy">
      <a class="ghost-btn compact" href="/admin">
        <ArrowLeft size={16} />
        Wróć do panelu
      </a>
      <div>
        <span class="section-kicker">Feed</span>
        <h1>Pełny log administracyjny</h1>
        <p>Szerszy widok ostatnich zdarzeń i uploadów, poza głównym ekranem admina.</p>
      </div>
    </div>

    <button class="ghost-btn compact" type="button" onclick={loadFeed} disabled={isRefreshing || isLoading}>
      <RefreshCw size={16} class={isRefreshing ? 'is-spinning' : ''} />
      {isRefreshing ? 'Odświeżanie…' : 'Odśwież'}
    </button>
  </div>

  {#if error}
    <div class="banner banner-error" role="alert">{error}</div>
  {/if}

  {#if !sessionReady || isLoading}
    <div class="state-wrap">
      <div class="spin"><LoaderCircle size={36} /></div>
    </div>
  {:else}
    <div class="log-grid">
      <section class="card glass">
        <div class="section-head">
          <div>
            <span class="section-kicker">Audit log</span>
            <h2>Zdarzenia</h2>
          </div>
        </div>

        {#if auditLog.length === 0}
          <p class="empty-text">Brak zdarzeń.</p>
        {:else}
          <div class="list-wrap">
            {#each auditLog as event (event.id)}
              <article class="feed-item">
                <div class="item-main">
                  <div class="item-label">
                    <Activity size={15} />
                    <strong>{actionLabels[event.action] ?? event.action}</strong>
                  </div>
                  <span class="muted">{event.resource_type}</span>
                  <span class="muted mono truncate">{event.user_id}</span>
                </div>
                <span class="muted">{formatDate(event.created_at)}</span>
              </article>
            {/each}
          </div>
        {/if}
      </section>

      <section class="card glass">
        <div class="section-head">
          <div>
            <span class="section-kicker">Uploady</span>
            <h2>Ostatnie operacje</h2>
          </div>
        </div>

        {#if uploads.length === 0}
          <p class="empty-text">Brak uploadów.</p>
        {:else}
          <div class="list-wrap">
            {#each uploads as upload (upload.id)}
              <article class="feed-item">
                <div class="item-main">
                  <div class="item-label">
                    <Upload size={15} />
                    <strong class="truncate">{upload.filename}</strong>
                  </div>
                  <span class="muted">{formatBytes(upload.size)}</span>
                  <span class="pill status-{upload.status}">{uploadStatusLabels[upload.status] ?? upload.status}</span>
                </div>
                <span class="muted">{formatDate(upload.created_at)}</span>
              </article>
            {/each}
          </div>
        {/if}
      </section>
    </div>
  {/if}
</section>

<style>
  .log-wrap {
    width: 100%;
    max-width: 1240px;
    margin: 0 auto;
    padding: var(--space-4) var(--shell-px) calc(88px + env(safe-area-inset-bottom));
    display: grid;
    gap: var(--space-4);
  }

  .page-header,
  .section-head,
  .feed-item,
  .item-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .page-header,
  .section-head {
    align-items: flex-start;
  }

  .page-copy {
    display: grid;
    gap: var(--space-3);
  }

  .section-kicker {
    display: inline-flex;
    width: fit-content;
    padding: 5px 10px;
    border-radius: var(--radius-full);
    background: color-mix(in oklab, var(--color-bg-overlay) 82%, transparent);
    border: 1px solid color-mix(in oklab, var(--color-glass-border) 70%, transparent);
    color: var(--color-text-secondary);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1,
  h2 {
    color: var(--color-text-primary);
    letter-spacing: -0.03em;
  }

  h1 {
    font-size: clamp(1.5rem, 4vw, 2.1rem);
    line-height: 1.04;
  }

  h2 {
    font-size: clamp(1rem, 3vw, 1.3rem);
    line-height: 1.1;
  }

  .page-copy p,
  .muted,
  .empty-text {
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .banner {
    border-radius: var(--radius-md);
    padding: 10px 12px;
    border: 1px solid color-mix(in oklab, var(--color-danger) 28%, transparent);
    background: color-mix(in oklab, var(--color-danger) 12%, transparent);
    color: color-mix(in oklab, var(--color-danger) 88%, #fff);
  }

  .state-wrap {
    min-height: 42dvh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .spin,
  .is-spinning {
    animation: spin 900ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .log-grid {
    display: grid;
    gap: var(--space-4);
  }

  .card {
    border-radius: calc(var(--radius-lg) + 2px);
    border-color: color-mix(in oklab, var(--color-glass-border) 92%, rgba(255, 255, 255, 0.04));
    background:
      linear-gradient(180deg, color-mix(in oklab, var(--color-bg-elevated) 72%, transparent), color-mix(in oklab, var(--color-bg-surface) 84%, transparent));
    backdrop-filter: blur(calc(var(--color-glass-blur) * 0.8)) saturate(135%);
    -webkit-backdrop-filter: blur(calc(var(--color-glass-blur) * 0.8)) saturate(135%);
    box-shadow:
      0 12px 32px rgba(0, 0, 0, 0.14),
      inset 0 1px 0 rgba(255, 255, 255, 0.04);
    padding: var(--space-4);
    display: grid;
    gap: var(--space-4);
  }

  .list-wrap {
    display: grid;
    gap: var(--space-2);
  }

  .feed-item {
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    border: 1px solid color-mix(in oklab, var(--color-border-subtle) 90%, transparent);
    background: color-mix(in oklab, var(--color-bg-overlay) 62%, transparent);
  }

  .item-main {
    min-width: 0;
    display: grid;
    gap: 6px;
  }

  .item-label {
    justify-content: flex-start;
  }

  .pill {
    width: fit-content;
    padding: 5px 10px;
    border-radius: var(--radius-full);
    font-size: 11px;
    border: 1px solid var(--color-border-subtle);
  }

  .status-completed {
    background: color-mix(in oklab, var(--color-success) 16%, transparent);
    color: var(--color-success);
  }

  .status-failed {
    background: color-mix(in oklab, var(--color-danger) 16%, transparent);
    color: var(--color-danger);
  }

  .status-pending {
    background: color-mix(in oklab, var(--color-accent) 15%, transparent);
    color: var(--color-text-primary);
  }

  .ghost-btn {
    min-height: 40px;
    border-radius: var(--radius-md);
    padding: 0 14px;
    border: 1px solid var(--color-border-default);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: fit-content;
    max-width: 100%;
    background: color-mix(in oklab, var(--color-bg-overlay) 78%, transparent);
    color: var(--color-text-primary);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .compact {
    min-height: 38px;
    padding: 0 12px;
  }

  .mono {
    font-family: var(--font-mono);
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (min-width: 920px) {
    .log-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
    }
  }

  @media (max-width: 919px) {
    .page-header,
    .feed-item {
      flex-direction: column;
      align-items: stretch;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spin,
    .is-spinning {
      animation: none;
    }
  }
</style>
