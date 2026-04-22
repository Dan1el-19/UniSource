<script lang="ts">
  import { onMount } from 'svelte';
  import { Activity, LoaderCircle, RefreshCw, Upload } from 'lucide-svelte';
  import type { AuditLogListResponse, UploadsListResponse } from '@unisource/sdk';
  import { apiClient } from '$lib/api';
  import { authState } from '../../../../state/auth.svelte';
  import { formatBytes, formatDate } from '$lib/admin-utils';
  import AdminBadge from '$components/admin/AdminBadge.svelte';
  import AdminButton from '$components/admin/AdminButton.svelte';
  import AdminCard from '$components/admin/AdminCard.svelte';
  import AdminListRow from '$components/admin/AdminListRow.svelte';
  import AdminTabs from '$components/admin/AdminTabs.svelte';

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

  type FeedEntry =
    | { kind: 'audit'; ts: number; data: AuditLogListResponse['items'][0] }
    | { kind: 'upload'; ts: number; data: UploadsListResponse['items'][0] };

  let sessionReady = $state(false);
  let isLoading = $state(true);
  let isRefreshing = $state(false);
  let error = $state<string | null>(null);
  let auditLog = $state<AuditLogListResponse['items']>([]);
  let uploads = $state<UploadsListResponse['items']>([]);

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
      error = err instanceof Error ? err.message : 'Nie udało się pobrać logu.';
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
      if (!currentUser) { window.location.replace('/login'); return; }
      if (!authState.isAdmin(currentUser)) { window.location.replace('/drive'); return; }
      sessionReady = true;
      await loadFeed();
    })();
    return () => { cancelled = true; };
  });

  const feed = $derived<FeedEntry[]>(
    [
      ...auditLog.map((item) => ({ kind: 'audit' as const, ts: item.created_at, data: item })),
      ...uploads.map((item) => ({ kind: 'upload' as const, ts: item.created_at, data: item })),
    ].sort((a, b) => b.ts - a.ts)
  );
</script>

<div class="log-page">
  <header class="page-header">
    <div class="page-header__copy">
      <span class="page-header__eyebrow">Admin</span>
      <h1 class="page-title">Panel administracyjny</h1>
    </div>
    <AdminButton variant="secondary" size="sm" onclick={loadFeed} isLoading={isRefreshing} disabled={isLoading}>
      <RefreshCw size={16} />
      Odśwież
    </AdminButton>
  </header>

  <AdminTabs />

  {#if error}
    <div class="banner banner--error" role="alert">{error}</div>
  {/if}

  {#if !sessionReady || isLoading}
    <div class="page-state">
      <LoaderCircle size={32} class="page-state__spinner" />
    </div>
  {:else}
    <AdminCard label="Log" title="Aktywność">
      {#snippet action()}
        <span class="meta-text">{feed.length} pozycji</span>
      {/snippet}

      {#if feed.length === 0}
        <p class="empty-state">Brak zdarzeń.</p>
      {:else}
        <div class="feed-list">
          {#each feed as entry (entry.kind + entry.data.id)}
            {#if entry.kind === 'audit'}
              <AdminListRow as="article" className="feed-row">
                <span class="feed-row__icon">
                  <Activity size={16} />
                </span>
                <div class="feed-row__content">
                  <strong class="body-text">{actionLabels[entry.data.action] ?? entry.data.action}</strong>
                  <span class="meta-text truncate">{entry.data.resource_type}</span>
                  <span class="user-id truncate">{entry.data.user_id}</span>
                </div>
                <span class="meta-text feed-row__meta">{formatDate(entry.data.created_at)}</span>
              </AdminListRow>
            {:else}
              <AdminListRow as="article" className="feed-row">
                <span class="feed-row__icon">
                  <Upload size={16} />
                </span>
                <div class="feed-row__content">
                  <strong class="body-text truncate">{entry.data.filename}</strong>
                  <span class="meta-text">{formatBytes(entry.data.size)}</span>
                </div>
                <div class="feed-row__meta feed-row__meta--stack">
                  <AdminBadge
                    tone={entry.data.status === 'completed' ? 'success' : entry.data.status === 'failed' ? 'danger' : 'accent'}
                  >
                    {uploadStatusLabels[entry.data.status] ?? entry.data.status}
                  </AdminBadge>
                  <span class="meta-text">{formatDate(entry.data.created_at)}</span>
                </div>
              </AdminListRow>
            {/if}
          {/each}
        </div>
      {/if}
    </AdminCard>
  {/if}
</div>

<style>
  .log-page {
    display: grid;
    gap: 24px;
  }

  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
  }

  .page-header__copy {
    display: grid;
    gap: 8px;
  }

  .page-header__eyebrow {
    display: inline-flex;
    width: fit-content;
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid color-mix(in oklab, var(--color-glass-border) 70%, transparent);
    background: color-mix(in oklab, var(--color-bg-overlay) 80%, transparent);
    color: var(--color-text-secondary);
    font-size: var(--admin-text-meta-size);
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    line-height: var(--admin-text-meta-line-height);
  }

  .page-title {
    color: var(--color-text-primary);
    font-size: var(--admin-text-page-size);
    line-height: var(--admin-text-page-line-height);
    font-weight: 700;
    letter-spacing: -0.03em;
  }

  .body-text {
    color: var(--color-text-secondary);
    font-size: var(--admin-text-body-size);
    line-height: var(--admin-text-body-line-height);
  }

  .meta-text {
    color: var(--color-text-secondary);
    font-size: var(--admin-text-meta-size);
    line-height: var(--admin-text-meta-line-height);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .user-id {
    color: var(--color-text-secondary);
    font-size: var(--admin-text-meta-size);
    line-height: 1.3;
  }

  .banner {
    border-radius: var(--admin-radius-md);
    padding: 12px 16px;
    border: 1px solid color-mix(in oklab, var(--color-danger) 28%, transparent);
    background: color-mix(in oklab, var(--color-danger) 12%, transparent);
    color: color-mix(in oklab, var(--color-danger) 90%, white);
    font-size: var(--admin-text-body-size);
    line-height: var(--admin-text-body-line-height);
  }

  .page-state {
    min-height: 320px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .log-page :global(.page-state__spinner) {
    animation: log-spin 900ms linear infinite;
  }

  @keyframes log-spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .log-page :global(.page-state__spinner) { animation: none; }
  }

  .feed-list {
    display: grid;
    gap: 8px;
  }

  .log-page :global(.feed-row) {
    grid-template-columns: 20px minmax(0, 1fr) auto;
    min-height: 64px;
  }

  .feed-row__icon {
    color: var(--color-text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .feed-row__content {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .feed-row__meta {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    text-align: right;
    white-space: nowrap;
  }

  .feed-row__meta--stack {
    display: grid;
    gap: 6px;
    justify-items: end;
    align-content: center;
  }

  .empty-state {
    color: var(--color-text-secondary);
    font-size: var(--admin-text-body-size);
    line-height: var(--admin-text-body-line-height);
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 959px) {
    .page-header {
      flex-direction: column;
      align-items: flex-start;
    }

    :global(.feed-row) {
      grid-template-columns: 20px minmax(0, 1fr);
    }

    .feed-row__meta {
      grid-column: 2;
      justify-content: flex-start;
      text-align: left;
    }

    .feed-row__meta--stack {
      justify-items: start;
    }
  }
</style>
