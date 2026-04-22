<script lang="ts">
  import { onMount } from 'svelte';
  import { Activity, ArrowLeft, LoaderCircle, RefreshCw, Upload } from 'lucide-svelte';
  import type { AuditLogListResponse, UploadsListResponse } from '@unisource/sdk';
  import { apiClient } from '$lib/api';
  import { authState } from '../../../../state/auth.svelte';
  import AdminBadge from '$components/admin/AdminBadge.svelte';
  import AdminButton from '$components/admin/AdminButton.svelte';
  import AdminCard from '$components/admin/AdminCard.svelte';
  import AdminListRow from '$components/admin/AdminListRow.svelte';

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
    return new Date(ts * 1000).toLocaleString('pl-PL', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
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

<section class="admin-log">
  <header class="page-header">
    <div class="page-header__copy">
      <a class="back-link" href="/admin">
        <ArrowLeft size={16} />
        Wróć do panelu
      </a>
      <span class="page-header__eyebrow">Feed</span>
      <h1 class="page-title">Pełny log administracyjny</h1>
      <p class="page-body">Rozszerzony widok zdarzeń i uploadów poza głównym dashboardem.</p>
    </div>

    <AdminButton variant="secondary" size="sm" onclick={loadFeed} isLoading={isRefreshing} disabled={isLoading}>
      <RefreshCw size={16} />
      Odśwież
    </AdminButton>
  </header>

  {#if error}
    <div class="banner banner--error" role="alert">{error}</div>
  {/if}

  {#if !sessionReady || isLoading}
    <div class="page-state">
      <LoaderCircle size={32} class="page-state__spinner" />
    </div>
  {:else}
    <div class="log-grid">
      <AdminCard
        className="log-card"
        label="Audit log"
        title="Zdarzenia"
        description="Wyrównana lista zdarzeń z jednolitą wysokością i stałym rozstawem metadanych."
      >
        <div class="log-list">
          {#if auditLog.length === 0}
            <p class="empty-state">Brak zdarzeń.</p>
          {:else}
            {#each auditLog as event (event.id)}
              <AdminListRow as="article" className="log-row">
                <span class="log-row__icon">
                  <Activity size={16} />
                </span>
                <div class="log-row__content">
                  <strong class="body-text">{actionLabels[event.action] ?? event.action}</strong>
                  <span class="meta-text truncate">{event.resource_type}</span>
                  <span class="body-text truncate">{event.user_id}</span>
                </div>
                <span class="meta-text log-row__meta">{formatDate(event.created_at)}</span>
              </AdminListRow>
            {/each}
          {/if}
        </div>
      </AdminCard>

      <AdminCard
        className="log-card"
        label="Uploady"
        title="Ostatnie operacje"
        description="Ten sam system wierszy, badge’y statusu i czytelny podział na treść oraz metadane."
      >
        <div class="log-list">
          {#if uploads.length === 0}
            <p class="empty-state">Brak uploadów.</p>
          {:else}
            {#each uploads as upload (upload.id)}
              <AdminListRow as="article" className="log-row">
                <span class="log-row__icon">
                  <Upload size={16} />
                </span>
                <div class="log-row__content">
                  <strong class="body-text truncate">{upload.filename}</strong>
                  <span class="meta-text">{formatBytes(upload.size)}</span>
                </div>
                <div class="log-row__meta log-row__meta--stack">
                  <AdminBadge tone={upload.status === 'completed' ? 'success' : upload.status === 'failed' ? 'danger' : 'accent'}>
                    {uploadStatusLabels[upload.status] ?? upload.status}
                  </AdminBadge>
                  <span class="meta-text">{formatDate(upload.created_at)}</span>
                </div>
              </AdminListRow>
            {/each}
          {/if}
        </div>
      </AdminCard>
    </div>
  {/if}
</section>

<style>
  .admin-log {
    --admin-space-1: 8px;
    --admin-space-2: 12px;
    --admin-space-3: 16px;
    --admin-space-4: 24px;
    --admin-space-5: 32px;
    --admin-text-page-size: 32px;
    --admin-text-page-line-height: 1.1;
    --admin-text-section-size: 20px;
    --admin-text-section-line-height: 1.2;
    --admin-text-card-size: 16px;
    --admin-text-card-line-height: 1.25;
    --admin-text-body-size: 14px;
    --admin-text-body-line-height: 1.4;
    --admin-text-meta-size: 12px;
    --admin-text-meta-line-height: 1.3;
    --admin-radius-md: 16px;
    --admin-radius-lg: 24px;
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
    padding: 24px 24px calc(88px + env(safe-area-inset-bottom));
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
    line-height: var(--admin-text-meta-line-height);
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .page-title {
    color: var(--color-text-primary);
    font-size: var(--admin-text-page-size);
    line-height: var(--admin-text-page-line-height);
    font-weight: 700;
    letter-spacing: -0.03em;
  }

  .page-body,
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

  .back-link {
    display: inline-flex;
    width: fit-content;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 12px;
    border-radius: var(--admin-radius-md);
    border: 1px solid color-mix(in oklab, var(--color-glass-border) 82%, transparent);
    background: color-mix(in oklab, var(--color-bg-overlay) 76%, transparent);
    color: var(--color-text-primary);
    font-size: var(--admin-text-body-size);
    line-height: var(--admin-text-body-line-height);
    font-weight: 600;
    text-decoration: none;
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

  :global(.page-state__spinner) {
    animation: admin-log-spin 900ms linear infinite;
  }

  @keyframes admin-log-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .log-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 24px;
  }

  :global(.log-card) {
    grid-column: span 12;
  }

  .log-list {
    display: grid;
    gap: 16px;
  }

  :global(.log-row) {
    grid-template-columns: 16px minmax(0, 1fr) auto;
  }

  .log-row__icon {
    color: var(--color-text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .log-row__content {
    min-width: 0;
    display: grid;
    gap: 8px;
  }

  .log-row__meta {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    text-align: right;
  }

  .log-row__meta--stack {
    display: grid;
    gap: 12px;
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

  @media (min-width: 1120px) {
    :global(.log-card) {
      grid-column: span 6;
    }
  }

  @media (max-width: 959px) {
    .admin-log {
      --admin-text-page-size: 24px;
    }

    .page-header {
      flex-direction: column;
      align-items: stretch;
    }

    :global(.log-row) {
      grid-template-columns: 16px minmax(0, 1fr);
    }

    .log-row__meta {
      grid-column: 2;
      justify-content: flex-start;
      text-align: left;
    }

    .log-row__meta--stack {
      justify-items: start;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.page-state__spinner) {
      animation: none;
    }
  }
</style>
