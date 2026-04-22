<!-- apps/frontend/src/routes/(app)/admin/service/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { HardDrive, LoaderCircle, RefreshCw, Save } from 'lucide-svelte';
  import type { ServiceDetailResponse, ServiceUsageResponse } from '@unisource/sdk';
  import { apiClient } from '$lib/api';
  import { authState } from '../../../../state/auth.svelte';
  import { formatBytes } from '$lib/admin-utils';
  import AdminButton from '$components/admin/AdminButton.svelte';
  import AdminCard from '$components/admin/AdminCard.svelte';
  import AdminInput from '$components/admin/AdminInput.svelte';
  import AdminProgress from '$components/admin/AdminProgress.svelte';
  import AdminTabs from '$components/admin/AdminTabs.svelte';

  type ByteUnit = 'MB' | 'GB' | 'TB';
  type ProgressTone = 'accent' | 'success' | 'warning' | 'danger';

  const BYTE_FACTORS: Record<ByteUnit, number> = {
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  };

  type LimitDraft = { value: string; unit: ByteUnit };

  let sessionReady = $state(false);
  let isLoading = $state(true);
  let isRefreshing = $state(false);
  let isSavingService = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  let service = $state<ServiceDetailResponse['service'] | null>(null);
  let usage = $state<ServiceUsageResponse | null>(null);
  let serviceStorageDraft = $state<LimitDraft>({ value: '', unit: 'GB' });
  let serviceFileDraft = $state<LimitDraft>({ value: '', unit: 'MB' });

  function bytesToDraft(bytes: number, preferredUnit: ByteUnit): LimitDraft {
    const exactUnits: ByteUnit[] = ['TB', 'GB', 'MB'];
    const exactUnit = exactUnits.find((unit) => bytes % BYTE_FACTORS[unit] === 0);
    const unit = exactUnit ?? preferredUnit;
    return {
      value: String(Math.max(1, Math.round((bytes / BYTE_FACTORS[unit]) * 100) / 100)),
      unit,
    };
  }

  function parseLimitDraft(draft: LimitDraft): number {
    const parsed = Number(draft.value.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Podaj dodatnią wartość limitu.');
    return Math.round(parsed * BYTE_FACTORS[draft.unit]);
  }

  function getProgressTone(percent: number): ProgressTone {
    if (percent >= 85) return 'danger';
    if (percent >= 65) return 'warning';
    if (percent >= 35) return 'accent';
    return 'success';
  }

  function syncServiceDrafts(svc: ServiceDetailResponse['service']) {
    serviceStorageDraft = bytesToDraft(svc.max_storage_bytes, 'GB');
    serviceFileDraft = bytesToDraft(svc.max_file_size_bytes, 'MB');
  }

  async function loadService() {
    const [svcRes, usageRes] = await Promise.all([
      apiClient.admin.serviceDetail(),
      apiClient.admin.usage(),
    ]);
    service = svcRes.service;
    usage = usageRes;
    syncServiceDrafts(svcRes.service);
  }

  async function refreshAll() {
    isRefreshing = true;
    error = null;
    try {
      await loadService();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Nie udało się odświeżyć danych serwisu.';
    } finally {
      isRefreshing = false;
      isLoading = false;
    }
  }

  async function handleServiceSave() {
    if (!service) return;
    error = null;
    success = null;
    isSavingService = true;
    let storageLimitBytes: number;
    let fileLimitBytes: number;
    try {
      storageLimitBytes = parseLimitDraft(serviceStorageDraft);
      fileLimitBytes = parseLimitDraft(serviceFileDraft);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Nieprawidłowa wartość limitu.';
      isSavingService = false;
      return;
    }
    try {
      const response = await apiClient.admin.updateService({
        max_storage_bytes: storageLimitBytes,
        max_file_size_bytes: fileLimitBytes,
      });
      service = response.service;
      syncServiceDrafts(response.service);
      success = 'Zapisano nowe limity serwisu.';
      try {
        usage = await apiClient.admin.usage();
      } catch {
        // usage tile shows stale data until next manual refresh — acceptable
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Nie udało się zapisać limitów serwisu.';
    } finally {
      isSavingService = false;
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
      await refreshAll();
    })();
    return () => { cancelled = true; };
  });

  const usagePercent = $derived(usage?.used_percent ?? 0);
  const usageTone = $derived(getProgressTone(usagePercent));
  const freeBytes = $derived(
    usage ? Math.max(0, usage.max_storage_bytes - usage.current_used_bytes) : 0
  );
</script>

<div class="service-page">
  <header class="page-header">
    <div class="page-header__copy">
      <span class="page-header__eyebrow">Admin</span>
      <h1 class="page-title">Panel administracyjny</h1>
    </div>
    <AdminButton variant="secondary" size="sm" onclick={refreshAll} isLoading={isRefreshing} disabled={isLoading}>
      <RefreshCw size={16} />
      Odśwież
    </AdminButton>
  </header>

  <AdminTabs />

  {#if error}
    <div class="banner banner--error" role="alert">{error}</div>
  {/if}
  {#if success}
    <div class="banner banner--success" role="status">{success}</div>
  {/if}

  {#if !sessionReady || isLoading}
    <div class="page-state">
      <LoaderCircle size={32} class="page-state__spinner" />
    </div>
  {:else if service && usage}
    <div class="service-grid">
      <AdminCard label="Serwis" title={service.name} className="service-grid__config">
        {#snippet action()}
          <div class="service-id">{service?.id ?? ''}</div>
        {/snippet}

        <div class="form-grid">
          <label class="field-group">
            <span class="meta-text">Limit storage</span>
            <div class="field-combo">
              <AdminInput bind:value={serviceStorageDraft.value} type="number" min="1" step="0.01" />
              <select bind:value={serviceStorageDraft.unit} class="form-select">
                <option value="MB">MB</option>
                <option value="GB">GB</option>
                <option value="TB">TB</option>
              </select>
            </div>
          </label>

          <label class="field-group">
            <span class="meta-text">Maksymalny rozmiar pliku</span>
            <div class="field-combo">
              <AdminInput bind:value={serviceFileDraft.value} type="number" min="1" step="0.01" />
              <select bind:value={serviceFileDraft.unit} class="form-select">
                <option value="MB">MB</option>
                <option value="GB">GB</option>
                <option value="TB">TB</option>
              </select>
            </div>
          </label>
        </div>

        {#snippet footer()}
          <AdminButton variant="primary" onclick={handleServiceSave} isLoading={isSavingService}>
            <Save size={16} />
            Zapisz limity
          </AdminButton>
        {/snippet}
      </AdminCard>

      <AdminCard label="Wykorzystanie" title="Storage usage" className="service-grid__usage">
        <div class="usage-layout">
          <div class="usage-header">
            <div class="usage-headline">
              <HardDrive size={18} />
              <span class="meta-text">Zajęte miejsce</span>
            </div>
            <strong class="numeric-stat">{usagePercent.toFixed(1)}%</strong>
          </div>

          <div class="usage-meta">
            <span class="body-text">{formatBytes(usage.current_used_bytes)}</span>
            <span class="meta-text">z {formatBytes(usage.max_storage_bytes)}</span>
          </div>

          <AdminProgress value={usagePercent} tone={usageTone} />

          <div class="metric-row">
            <div class="metric-tile">
              <span class="meta-text">Maks. plik</span>
              <strong class="card-title">{formatBytes(service.max_file_size_bytes)}</strong>
            </div>
            <div class="metric-tile">
              <span class="meta-text">Wolne miejsce</span>
              <strong class="card-title">{formatBytes(freeBytes)}</strong>
            </div>
          </div>
        </div>
      </AdminCard>
    </div>
  {/if}
</div>

<style>
  .service-page {
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

  .card-title {
    color: var(--color-text-primary);
    font-size: var(--admin-text-card-size);
    line-height: var(--admin-text-card-line-height);
    font-weight: 700;
  }

  .numeric-stat {
    color: var(--color-text-primary);
    font-size: var(--admin-text-stat-size);
    line-height: var(--admin-text-stat-line-height);
    font-weight: 700;
    letter-spacing: -0.03em;
  }

  .banner {
    border-radius: var(--admin-radius-md);
    padding: 12px 16px;
    border: 1px solid transparent;
    font-size: var(--admin-text-body-size);
    line-height: var(--admin-text-body-line-height);
  }

  .banner--error {
    border-color: color-mix(in oklab, var(--color-danger) 28%, transparent);
    background: color-mix(in oklab, var(--color-danger) 12%, transparent);
    color: color-mix(in oklab, var(--color-danger) 90%, white);
  }

  .banner--success {
    border-color: color-mix(in oklab, var(--color-success) 28%, transparent);
    background: color-mix(in oklab, var(--color-success) 12%, transparent);
    color: color-mix(in oklab, var(--color-success) 90%, white);
  }

  .page-state {
    min-height: 320px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .service-page :global(.page-state__spinner) {
    animation: service-spin 900ms linear infinite;
  }

  @keyframes service-spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .service-page :global(.page-state__spinner) { animation: none; }
  }

  .service-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 24px;
  }

  .service-grid :global(.service-grid__config) {
    grid-column: span 12;
  }

  .service-grid :global(.service-grid__usage) {
    grid-column: span 12;
  }

  @media (min-width: 1024px) {
    .service-grid :global(.service-grid__config) {
      grid-column: span 7;
    }

    .service-grid :global(.service-grid__usage) {
      grid-column: span 5;
    }
  }

  .service-id {
    display: inline-flex;
    align-items: center;
    min-height: 40px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid color-mix(in oklab, var(--color-glass-border) 80%, transparent);
    background: color-mix(in oklab, var(--color-bg-overlay) 72%, transparent);
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
    font-size: var(--admin-text-meta-size);
  }

  .form-grid {
    display: grid;
    gap: 20px;
  }

  .field-group {
    display: grid;
    gap: 10px;
  }

  .field-combo {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 120px;
    gap: 12px;
  }

  .form-select {
    width: 100%;
    min-height: 48px;
    padding: 0 16px;
    border-radius: var(--admin-radius-md);
    border: 1px solid color-mix(in oklab, var(--color-glass-border) 88%, transparent);
    background: color-mix(in oklab, var(--color-bg-overlay) 74%, transparent);
    color: var(--color-text-primary);
    font-size: var(--admin-text-body-size);
    outline: none;
  }

  .form-select:hover,
  .form-select:focus-visible {
    border-color: color-mix(in oklab, var(--color-accent) 36%, var(--color-glass-border));
  }

  .usage-layout {
    display: grid;
    gap: 16px;
  }

  .usage-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .usage-headline {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text-secondary);
  }

  .usage-meta {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .metric-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    padding-top: 8px;
    border-top: 1px solid color-mix(in oklab, var(--color-glass-border) 60%, transparent);
  }

  .metric-tile {
    display: grid;
    gap: 6px;
  }

  @media (max-width: 959px) {
    .page-header {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
