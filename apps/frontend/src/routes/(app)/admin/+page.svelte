<script lang="ts">
  import { onMount } from 'svelte';
  import { LoaderCircle, ShieldCheck, HardDrive, Activity, Upload } from 'lucide-svelte';
  import type { ServiceDetailResponse, ServiceUsageResponse, AuditLogListResponse, UploadsListResponse } from '@unisource/sdk';
  import { apiClient } from '$lib/api';
  import { authState } from '../../../state/auth.svelte';

  let sessionReady = $state(false);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  let service = $state<ServiceDetailResponse['service'] | null>(null);
  let usage = $state<ServiceUsageResponse | null>(null);
  let auditLog = $state<AuditLogListResponse['items']>([]);
  let uploads = $state<UploadsListResponse['items']>([]);

  function formatBytes(bytes: number) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  function formatDate(ts: number) {
    return new Date(ts * 1000).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
  }

  const usageColor = $derived.by(() => {
    if (!usage) return 'var(--color-success)';
    if (usage.used_percent > 85) return 'var(--color-danger)';
    if (usage.used_percent > 65) return 'var(--color-warning)';
    return 'var(--color-success)';
  });

  const actionLabels: Record<string, string> = {
    upload_completed:    'Upload zakończony',
    file_deleted:        'Plik usunięty',
    folder_deleted:      'Folder usunięty',
    quota_exceeded:      'Przekroczono limit',
    share_link_accessed: 'Link udostępnienia',
  };

  const uploadStatusLabels: Record<string, string> = {
    pending:   'Oczekuje',
    completed: 'Gotowy',
    failed:    'Błąd',
  };

  onMount(() => {
    let cancelled = false;
    (async () => {
      const user = await authState.checkSession();
      if (cancelled) return;
      if (!user) { window.location.replace('/login'); return; }
      sessionReady = true;

      try {
        const [svcRes, usageRes, auditRes, uploadsRes] = await Promise.all([
          apiClient.admin.serviceDetail(),
          apiClient.admin.usage(),
          apiClient.admin.auditLog({ limit: 25 }),
          apiClient.admin.listUploads({ limit: 20 }),
        ]);
        service = svcRes.service;
        usage = usageRes;
        auditLog = auditRes.items;
        uploads = uploadsRes.items;
      } catch (err) {
        error = err instanceof Error ? err.message : 'Nie udało się pobrać danych admina.';
      } finally {
        isLoading = false;
      }
    })();
    return () => { cancelled = true; };
  });
</script>

<section class="admin-wrap">
  <header>
    <div class="header-icon"><ShieldCheck size={20} /></div>
    <div>
      <h1>Panel Administratora</h1>
      <p>Zarządzanie serwisem i monitoring</p>
    </div>
  </header>

  {#if error}
    <div class="banner banner-error" role="alert">{error}</div>
  {/if}

  {#if !sessionReady || isLoading}
    <div class="state-wrap">
      <div class="spin"><LoaderCircle size={36} /></div>
    </div>
  {:else}
    <div class="grid-2">
      <div class="card glass">
        <div class="card-header">
          <HardDrive size={18} />
          <h2>Informacje o serwisie</h2>
        </div>
        {#if service}
          <dl class="info-list">
            <div class="info-row"><dt>Nazwa</dt><dd>{service.name}</dd></div>
            <div class="info-row"><dt>ID</dt><dd class="mono">{service.id}</dd></div>
            <div class="info-row"><dt>Maks. rozmiar pliku</dt><dd>{formatBytes(service.max_file_size_bytes)}</dd></div>
            <div class="info-row"><dt>Limit storage</dt><dd>{formatBytes(service.max_storage_bytes)}</dd></div>
          </dl>
        {/if}
      </div>

      <div class="card glass">
        <div class="card-header">
          <Activity size={18} />
          <h2>Użycie storage</h2>
        </div>
        {#if usage}
          <div class="usage-bar-wrap">
            <div class="usage-bar-track">
              <div
                class="usage-bar-fill"
                style="width: {Math.min(usage.used_percent, 100)}%; background: {usageColor};"
              ></div>
            </div>
            <div class="usage-labels">
              <span class="usage-pct" style="color: {usageColor};">{usage.used_percent.toFixed(1)}%</span>
              <span class="usage-nums">{formatBytes(usage.current_used_bytes)} / {formatBytes(usage.max_storage_bytes)}</span>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <div class="card glass mt">
      <div class="card-header">
        <Activity size={18} />
        <h2>Ostatnie zdarzenia</h2>
      </div>
      {#if auditLog.length === 0}
        <p class="empty-text">Brak zdarzeń.</p>
      {:else}
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Akcja</th>
                <th>Użytkownik</th>
                <th>Typ zasobu</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {#each auditLog as event (event.id)}
                <tr>
                  <td><span class="action-badge">{actionLabels[event.action] ?? event.action}</span></td>
                  <td class="mono">{event.user_id.slice(0, 12)}…</td>
                  <td>{event.resource_type}</td>
                  <td class="date-cell">{formatDate(event.created_at)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>

    <div class="card glass mt">
      <div class="card-header">
        <Upload size={18} />
        <h2>Ostatnie uploady</h2>
      </div>
      {#if uploads.length === 0}
        <p class="empty-text">Brak uploadów.</p>
      {:else}
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Plik</th>
                <th>Rozmiar</th>
                <th>Status</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {#each uploads as upload (upload.id)}
                <tr>
                  <td class="filename-cell">{upload.filename}</td>
                  <td>{formatBytes(upload.size)}</td>
                  <td>
                    <span class="status-badge status-{upload.status}">
                      {uploadStatusLabels[upload.status] ?? upload.status}
                    </span>
                  </td>
                  <td class="date-cell">{formatDate(upload.created_at)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .admin-wrap {
    width: 100%;
    max-width: 1100px;
    margin: 0 auto;
    padding: var(--space-4) var(--shell-px) calc(84px + env(safe-area-inset-bottom));
  }

  header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-6);
  }

  .header-icon {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
    background: color-mix(in oklab, var(--color-accent-muted) 80%, transparent);
    border: 1px solid var(--color-border-default);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-primary);
    flex-shrink: 0;
  }

  h1 {
    font-size: clamp(1.5rem, 2vw, 2rem);
    letter-spacing: -0.02em;
    color: var(--color-text-primary);
    line-height: 1.1;
  }

  header p { color: var(--color-text-secondary); font-size: var(--text-sm); }

  .banner {
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    font-size: var(--text-sm);
    padding: 9px 12px;
    margin-bottom: var(--space-3);
  }

  .banner-error {
    border-color: color-mix(in oklab, var(--color-danger) 30%, transparent);
    background: color-mix(in oklab, var(--color-danger) 14%, transparent);
    color: color-mix(in oklab, var(--color-danger) 90%, #fff);
  }

  .state-wrap {
    min-height: 40dvh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .spin { animation: spin 900ms linear infinite; color: var(--color-text-secondary); }
  @keyframes spin { to { transform: rotate(360deg); } }

  .grid-2 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--space-4);
  }

  .card {
    border-radius: var(--radius-lg);
    border-color: var(--color-glass-border);
    padding: var(--space-5);
  }

  .card.mt { margin-top: var(--space-4); }

  .card-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
    color: var(--color-text-secondary);
  }

  .card-header h2 {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .info-list { display: grid; gap: var(--space-2); }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
    min-height: 36px;
    border-bottom: 1px solid var(--color-border-subtle);
    padding-bottom: var(--space-2);
  }

  .info-row:last-child { border-bottom: none; }
  .info-row dt { font-size: var(--text-sm); color: var(--color-text-secondary); }
  .info-row dd { font-size: var(--text-sm); color: var(--color-text-primary); font-weight: 500; text-align: right; }
  .mono { font-family: var(--font-mono); font-size: 11px !important; }

  .usage-bar-wrap { display: grid; gap: var(--space-3); }

  .usage-bar-track {
    height: 8px;
    border-radius: var(--radius-full);
    background: var(--color-bg-overlay);
    overflow: hidden;
  }

  .usage-bar-fill {
    height: 100%;
    border-radius: var(--radius-full);
    transition: width 600ms var(--ease-out-expo);
  }

  .usage-labels {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-2);
  }

  .usage-pct { font-size: var(--text-2xl); font-weight: 600; letter-spacing: -0.03em; line-height: 1; }
  .usage-nums { font-size: var(--text-xs); color: var(--color-text-secondary); }

  .table-wrap { overflow-x: auto; }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  .data-table th {
    text-align: left;
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 6px 8px;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .data-table td {
    padding: 10px 8px;
    color: var(--color-text-primary);
    border-bottom: 1px solid var(--color-border-subtle);
    vertical-align: middle;
  }

  .data-table tr:last-child td { border-bottom: none; }

  .action-badge {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 500;
    background: var(--color-accent-muted);
    color: var(--color-text-primary);
    white-space: nowrap;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 500;
  }

  .status-badge.status-completed {
    background: color-mix(in oklab, var(--color-success) 16%, transparent);
    color: var(--color-success);
  }

  .status-badge.status-pending {
    background: color-mix(in oklab, var(--color-warning) 16%, transparent);
    color: var(--color-warning);
  }

  .status-badge.status-failed {
    background: color-mix(in oklab, var(--color-danger) 16%, transparent);
    color: var(--color-danger);
  }

  .filename-cell {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .date-cell { color: var(--color-text-secondary); white-space: nowrap; }
  .empty-text { color: var(--color-text-secondary); font-size: var(--text-sm); padding: var(--space-2) 0; }

  @media (min-width: 768px) {
    .admin-wrap { padding-top: var(--space-6); padding-bottom: var(--space-8); }
  }

  @media (prefers-reduced-motion: reduce) {
    .spin { animation: none; }
    .usage-bar-fill { transition: none; }
  }
</style>
