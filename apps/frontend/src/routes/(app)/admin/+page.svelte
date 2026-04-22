<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Activity,
    HardDrive,
    KeyRound,
    LoaderCircle,
    RefreshCw,
    Save,
    Search,
    ShieldCheck,
    Upload,
    Users,
  } from 'lucide-svelte';
  import type {
    AdminUser,
    AuditLogListResponse,
    ServiceDetailResponse,
    ServiceUsageResponse,
    UploadsListResponse,
  } from '@unisource/sdk';
  import { apiClient } from '$lib/api';
  import { authState } from '../../../state/auth.svelte';

  type ByteUnit = 'MB' | 'GB' | 'TB';

  const BYTE_FACTORS: Record<ByteUnit, number> = {
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  };

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

  type LimitDraft = {
    value: string;
    unit: ByteUnit;
  };

  type UserDraft = {
    role: string;
    labelsText: string;
    quotaEnabled: boolean;
    quotaValue: string;
    quotaUnit: ByteUnit;
    password: string;
    isSaving: boolean;
    isResetting: boolean;
  };

  let sessionReady = $state(false);
  let isLoading = $state(true);
  let isRefreshing = $state(false);
  let isSavingService = $state(false);
  let isLoadingUsers = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  let search = $state('');

  let service = $state<ServiceDetailResponse['service'] | null>(null);
  let usage = $state<ServiceUsageResponse | null>(null);
  let auditLog = $state<AuditLogListResponse['items']>([]);
  let uploads = $state<UploadsListResponse['items']>([]);
  let users = $state<AdminUser[]>([]);
  let usersTotal = $state(0);
  let userDrafts = $state<Record<string, UserDraft>>({});
  let serviceStorageDraft = $state<LimitDraft>({ value: '', unit: 'GB' });
  let serviceFileDraft = $state<LimitDraft>({ value: '', unit: 'MB' });

  function formatBytes(bytes: number | null | undefined) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** power).toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
  }

  function formatDate(ts: number) {
    return new Date(ts * 1000).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function normalizeLabelInput(value: string) {
    return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
  }

  function bytesToDraft(bytes: number, preferredUnit: ByteUnit): LimitDraft {
    const exactUnits: ByteUnit[] = ['TB', 'GB', 'MB'];
    const exactUnit = exactUnits.find((unit) => bytes % BYTE_FACTORS[unit] === 0);
    const unit = exactUnit ?? preferredUnit;
    return {
      value: String(Math.max(1, Math.round((bytes / BYTE_FACTORS[unit]) * 100) / 100)),
      unit,
    };
  }

  function parseLimitDraft(draft: LimitDraft) {
    const parsed = Number(draft.value.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error('Podaj dodatnią wartość limitu.');
    }
    return Math.round(parsed * BYTE_FACTORS[draft.unit]);
  }

  function createUserDraft(user: AdminUser): UserDraft {
    const quotaDraft = user.max_storage_bytes ? bytesToDraft(user.max_storage_bytes, 'GB') : { value: '', unit: 'GB' as ByteUnit };
    return {
      role: user.role,
      labelsText: user.labels.join(', '),
      quotaEnabled: user.max_storage_bytes !== null,
      quotaValue: quotaDraft.value,
      quotaUnit: quotaDraft.unit,
      password: '',
      isSaving: false,
      isResetting: false,
    };
  }

  function hydrateDrafts(items: AdminUser[]) {
    const nextDrafts: Record<string, UserDraft> = {};
    for (const user of items) {
      nextDrafts[user.id] = userDrafts[user.id] ?? createUserDraft(user);
      nextDrafts[user.id].role = user.role;
      nextDrafts[user.id].labelsText = user.labels.join(', ');
      nextDrafts[user.id].quotaEnabled = user.max_storage_bytes !== null;
      if (user.max_storage_bytes !== null) {
        const quotaDraft = bytesToDraft(user.max_storage_bytes, nextDrafts[user.id].quotaUnit);
        nextDrafts[user.id].quotaValue = quotaDraft.value;
        nextDrafts[user.id].quotaUnit = quotaDraft.unit;
      } else {
        nextDrafts[user.id].quotaValue = '';
      }
    }
    userDrafts = nextDrafts;
  }

  function syncServiceDrafts(currentService: ServiceDetailResponse['service']) {
    serviceStorageDraft = bytesToDraft(currentService.max_storage_bytes, 'GB');
    serviceFileDraft = bytesToDraft(currentService.max_file_size_bytes, 'MB');
  }

  async function loadUsers() {
    isLoadingUsers = true;
    try {
      const response = await apiClient.admin.listUsers({
        search: search.trim() || undefined,
        limit: 24,
        offset: 0,
      });
      users = response.items;
      usersTotal = response.total;
      hydrateDrafts(response.items);
    } finally {
      isLoadingUsers = false;
    }
  }

  async function loadDashboard() {
    const [svcRes, usageRes, auditRes, uploadsRes] = await Promise.all([
      apiClient.admin.serviceDetail(),
      apiClient.admin.usage(),
      apiClient.admin.auditLog({ limit: 10 }),
      apiClient.admin.listUploads({ limit: 8 }),
    ]);

    service = svcRes.service;
    usage = usageRes;
    auditLog = auditRes.items;
    uploads = uploadsRes.items;
    syncServiceDrafts(svcRes.service);
  }

  async function refreshAll() {
    isRefreshing = true;
    error = null;
    try {
      await Promise.all([loadDashboard(), loadUsers()]);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Nie udało się odświeżyć panelu admina.';
    } finally {
      isRefreshing = false;
      isLoading = false;
    }
  }

  function clearMessages() {
    error = null;
    success = null;
  }

  async function handleServiceSave() {
    if (!service) return;
    clearMessages();
    isSavingService = true;

    try {
      const response = await apiClient.admin.updateService({
        max_storage_bytes: parseLimitDraft(serviceStorageDraft),
        max_file_size_bytes: parseLimitDraft(serviceFileDraft),
      });
      service = response.service;
      syncServiceDrafts(response.service);
      usage = await apiClient.admin.usage();
      success = 'Zapisano nowe limity serwisu.';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Nie udało się zapisać limitów serwisu.';
    } finally {
      isSavingService = false;
    }
  }

  async function updateUser(userId: string, changes: Parameters<typeof apiClient.admin.updateUser>[1], message: string) {
    clearMessages();
    userDrafts[userId].isSaving = true;

    try {
      const response = await apiClient.admin.updateUser(userId, changes);
      users = users.map((user) => (user.id === userId ? response.user : user));
      hydrateDrafts(users);
      usage = await apiClient.admin.usage();
      success = message;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Nie udało się zaktualizować użytkownika.';
    } finally {
      userDrafts[userId].isSaving = false;
    }
  }

  async function handleUserSave(user: AdminUser) {
    const draft = userDrafts[user.id];
    if (!draft) return;

    await updateUser(
      user.id,
      {
        role: draft.role.trim() || 'user',
        labels: normalizeLabelInput(draft.labelsText),
        max_storage_bytes: draft.quotaEnabled
          ? parseLimitDraft({ value: draft.quotaValue, unit: draft.quotaUnit })
          : null,
      },
      `Zapisano ustawienia użytkownika ${user.email}.`
    );
  }

  async function handleStatusToggle(user: AdminUser) {
    await updateUser(
      user.id,
      { status: !user.status },
      !user.status ? `Odblokowano ${user.email}.` : `Zablokowano ${user.email}.`
    );
  }

  async function handlePasswordReset(user: AdminUser) {
    const draft = userDrafts[user.id];
    if (!draft?.password.trim()) {
      error = 'Podaj nowe hasło przed zapisaniem.';
      return;
    }

    clearMessages();
    draft.isResetting = true;

    try {
      await apiClient.admin.resetUserPassword(user.id, { password: draft.password.trim() });
      draft.password = '';
      success = `Nadpisano hasło użytkownika ${user.email} i wylogowano jego sesje.`;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Nie udało się nadpisać hasła.';
    } finally {
      draft.isResetting = false;
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
      await refreshAll();
    })();

    return () => {
      cancelled = true;
    };
  });

  const usageColor = $derived.by(() => {
    if (!usage) return 'var(--color-success)';
    if (usage.used_percent >= 85) return 'var(--color-danger)';
    if (usage.used_percent >= 65) return 'var(--color-warning)';
    return 'var(--color-success)';
  });
</script>

<section class="admin-wrap">
  <header class="hero glass">
    <div class="hero-copy">
      <span class="hero-kicker">Admin access</span>
      <div class="hero-title-row">
        <div class="hero-icon"><ShieldCheck size={22} /></div>
        <div>
          <h1>Panel Administratora</h1>
          <p>Limity serwisu, użytkownicy Appwrite Auth i monitoring w jednym miejscu.</p>
        </div>
      </div>
    </div>

    <button class="ghost-btn" type="button" onclick={refreshAll} disabled={isRefreshing || isLoading}>
      <RefreshCw size={16} class={isRefreshing ? 'is-spinning' : ''} />
      {isRefreshing ? 'Odświeżanie…' : 'Odśwież'}
    </button>
  </header>

  {#if error}
    <div class="banner banner-error" role="alert">{error}</div>
  {/if}

  {#if success}
    <div class="banner banner-success" role="status">{success}</div>
  {/if}

  {#if !sessionReady || isLoading}
    <div class="state-wrap">
      <div class="spin"><LoaderCircle size={36} /></div>
    </div>
  {:else if service && usage}
    <div class="metrics-grid">
      <article class="card glass accent-card">
        <div class="card-head">
          <HardDrive size={18} />
          <span>Serwis</span>
        </div>
        <strong>{service.name}</strong>
        <span class="muted mono">{service.id}</span>
        <div class="usage-bar-track">
          <div class="usage-bar-fill" style="width: {Math.min(usage.used_percent, 100)}%; background: {usageColor};"></div>
        </div>
        <div class="metric-row">
          <span>{usage.used_percent.toFixed(1)}%</span>
          <span>{formatBytes(usage.current_used_bytes)} / {formatBytes(usage.max_storage_bytes)}</span>
        </div>
      </article>

      <article class="card glass">
        <div class="card-head">
          <Users size={18} />
          <span>Użytkownicy</span>
        </div>
        <strong>{usersTotal}</strong>
        <span class="muted">Łącznie w bieżącym widoku serwisu</span>
      </article>

      <article class="card glass">
        <div class="card-head">
          <Upload size={18} />
          <span>Uploady</span>
        </div>
        <strong>{uploads.length}</strong>
        <span class="muted">Ostatnie operacje uploadu</span>
      </article>
    </div>

    <div class="content-grid">
      <section class="card glass">
        <div class="section-head">
          <div>
            <h2>Ustawienia serwisu</h2>
            <p>Bez sztywnych progów. Wpisujesz własne wartości i jednostki.</p>
          </div>
        </div>

        <div class="field-grid">
          <label class="field">
            <span>Limit storage</span>
            <div class="field-inline">
              <input bind:value={serviceStorageDraft.value} type="number" min="1" step="0.01" />
              <select bind:value={serviceStorageDraft.unit}>
                <option value="MB">MB</option>
                <option value="GB">GB</option>
                <option value="TB">TB</option>
              </select>
            </div>
          </label>

          <label class="field">
            <span>Maksymalny rozmiar pliku</span>
            <div class="field-inline">
              <input bind:value={serviceFileDraft.value} type="number" min="1" step="0.01" />
              <select bind:value={serviceFileDraft.unit}>
                <option value="MB">MB</option>
                <option value="GB">GB</option>
                <option value="TB">TB</option>
              </select>
            </div>
          </label>
        </div>

        <button class="primary-btn" type="button" onclick={handleServiceSave} disabled={isSavingService}>
          <Save size={16} />
          {isSavingService ? 'Zapisywanie…' : 'Zapisz limity serwisu'}
        </button>
      </section>

      <section class="card glass">
        <div class="section-head">
          <div>
            <h2>Feed operacyjny</h2>
            <p>Najnowsze zdarzenia i uploady w układzie mobilnym, bez ciasnych tabel.</p>
          </div>
        </div>

        <div class="feed-block">
          <div class="feed-head">
            <Activity size={16} />
            <span>Audit log</span>
          </div>
          {#if auditLog.length === 0}
            <p class="empty-text">Brak zdarzeń.</p>
          {:else}
            <div class="feed-list">
              {#each auditLog as event (event.id)}
                <article class="feed-item">
                  <span class="pill">{actionLabels[event.action] ?? event.action}</span>
                  <strong>{event.resource_type}</strong>
                  <span class="muted mono">{event.user_id}</span>
                  <span class="muted">{formatDate(event.created_at)}</span>
                </article>
              {/each}
            </div>
          {/if}
        </div>

        <div class="feed-block">
          <div class="feed-head">
            <Upload size={16} />
            <span>Ostatnie uploady</span>
          </div>
          {#if uploads.length === 0}
            <p class="empty-text">Brak uploadów.</p>
          {:else}
            <div class="feed-list">
              {#each uploads as upload (upload.id)}
                <article class="feed-item">
                  <strong class="truncate">{upload.filename}</strong>
                  <span class="muted">{formatBytes(upload.size)}</span>
                  <span class="pill status-{upload.status}">{uploadStatusLabels[upload.status] ?? upload.status}</span>
                  <span class="muted">{formatDate(upload.created_at)}</span>
                </article>
              {/each}
            </div>
          {/if}
        </div>
      </section>
    </div>

    <section class="card glass user-section">
      <div class="section-head section-head-stack">
        <div>
          <h2>Zarządzanie użytkownikami</h2>
          <p>Role, labelsy Appwrite, limity per-user, blokada kont i nadpisanie hasła.</p>
        </div>

        <form
          class="search-bar"
          onsubmit={(event) => {
            event.preventDefault();
            loadUsers();
          }}
        >
          <Search size={16} />
          <input bind:value={search} type="search" placeholder="Szukaj po emailu lub nazwie" />
          <button class="ghost-btn compact" type="submit" disabled={isLoadingUsers}>
            Szukaj
          </button>
        </form>
      </div>

      {#if isLoadingUsers}
        <div class="sub-state"><LoaderCircle size={20} class="spin-inline" /> Ładowanie użytkowników…</div>
      {:else if users.length === 0}
        <p class="empty-text">Brak użytkowników dla bieżącego filtra.</p>
      {:else}
        <div class="user-grid">
          {#each users as user (user.id)}
            {@const draft = userDrafts[user.id]}
            <article class="user-card">
              <div class="user-top">
                <div>
                  <h3>{user.name || user.email}</h3>
                  <p class="muted">{user.email}</p>
                </div>
                <div class="pill-group">
                  <span class="pill {user.status ? 'is-success' : 'is-danger'}">{user.status ? 'Aktywny' : 'Zablokowany'}</span>
                  {#if user.labels.includes('admin')}
                    <span class="pill is-accent">admin</span>
                  {/if}
                </div>
              </div>

              <div class="usage-panel">
                <div class="usage-caption">
                  <span>Zajęte miejsce</span>
                  <strong>{formatBytes(user.current_used_bytes)}</strong>
                </div>
                <div class="usage-bar-track">
                  <div
                    class="usage-bar-fill"
                    style="width: {Math.min((user.current_used_bytes / Math.max(user.effective_max_storage_bytes, 1)) * 100, 100)}%;"
                  ></div>
                </div>
                <span class="muted">
                  Efektywny limit: {formatBytes(user.effective_max_storage_bytes)}
                  {#if user.max_storage_bytes === null}
                    <span> · dziedziczy limit serwisu</span>
                  {/if}
                </span>
              </div>

              <div class="field-grid dense">
                <label class="field">
                  <span>Rola aplikacyjna</span>
                  <input bind:value={draft.role} type="text" placeholder="np. user, admin, manager" />
                </label>

                <label class="field">
                  <span>Labelsy Appwrite</span>
                  <input bind:value={draft.labelsText} type="text" placeholder="admin, beta, vip" />
                </label>
              </div>

              <div class="quota-box">
                <label class="toggle-row">
                  <input bind:checked={draft.quotaEnabled} type="checkbox" />
                  <span>Ustaw własny limit dla tego użytkownika</span>
                </label>

                {#if draft.quotaEnabled}
                  <div class="field-inline">
                    <input bind:value={draft.quotaValue} type="number" min="1" step="0.01" placeholder="np. 25" />
                    <select bind:value={draft.quotaUnit}>
                      <option value="MB">MB</option>
                      <option value="GB">GB</option>
                      <option value="TB">TB</option>
                    </select>
                  </div>
                {/if}
              </div>

              <div class="password-box">
                <label class="field">
                  <span>Nowe hasło</span>
                  <input bind:value={draft.password} type="text" placeholder="Min. 8 znaków" />
                </label>
                <button class="ghost-btn compact" type="button" onclick={() => handlePasswordReset(user)} disabled={draft.isResetting}>
                  <KeyRound size={15} />
                  {draft.isResetting ? 'Zapisywanie…' : 'Nadpisz hasło'}
                </button>
              </div>

              <div class="card-actions">
                <button class="ghost-btn" type="button" onclick={() => handleStatusToggle(user)} disabled={draft.isSaving}>
                  {user.status ? 'Zablokuj konto' : 'Aktywuj konto'}
                </button>
                <button class="primary-btn compact" type="button" onclick={() => handleUserSave(user)} disabled={draft.isSaving}>
                  <Save size={15} />
                  {draft.isSaving ? 'Zapisywanie…' : 'Zapisz użytkownika'}
                </button>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</section>

<style>
  .admin-wrap {
    width: 100%;
    max-width: 1320px;
    margin: 0 auto;
    padding: var(--space-4) var(--shell-px) calc(88px + env(safe-area-inset-bottom));
    display: grid;
    gap: var(--space-4);
  }

  .hero,
  .card {
    border-color: var(--color-glass-border);
  }

  .hero {
    border-radius: calc(var(--radius-xl) + 4px);
    padding: var(--space-5);
    display: grid;
    gap: var(--space-4);
    background:
      radial-gradient(circle at top right, color-mix(in oklab, var(--color-accent) 15%, transparent), transparent 36%),
      linear-gradient(180deg, color-mix(in oklab, var(--color-bg-elevated) 90%, transparent), color-mix(in oklab, var(--color-bg-surface) 86%, transparent));
  }

  .hero-kicker {
    display: inline-flex;
    width: fit-content;
    padding: 4px 10px;
    border-radius: var(--radius-full);
    background: color-mix(in oklab, var(--color-accent-muted) 78%, transparent);
    color: var(--color-text-primary);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .hero-title-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .hero-icon {
    width: 48px;
    height: 48px;
    border-radius: 18px;
    border: 1px solid var(--color-border-default);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in oklab, var(--color-bg-overlay) 82%, transparent);
    flex-shrink: 0;
  }

  h1 {
    font-size: clamp(1.7rem, 5vw, 2.5rem);
    line-height: 1;
    letter-spacing: -0.04em;
    color: var(--color-text-primary);
  }

  .hero p,
  .muted,
  .empty-text {
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .banner {
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    padding: 10px 12px;
    font-size: var(--text-sm);
  }

  .banner-error {
    border-color: color-mix(in oklab, var(--color-danger) 30%, transparent);
    background: color-mix(in oklab, var(--color-danger) 14%, transparent);
    color: color-mix(in oklab, var(--color-danger) 90%, #fff);
  }

  .banner-success {
    border-color: color-mix(in oklab, var(--color-success) 30%, transparent);
    background: color-mix(in oklab, var(--color-success) 14%, transparent);
    color: color-mix(in oklab, var(--color-success) 95%, #fff);
  }

  .state-wrap {
    min-height: 44dvh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .spin,
  .spin-inline,
  .is-spinning {
    animation: spin 900ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .metrics-grid,
  .content-grid,
  .user-grid,
  .field-grid {
    display: grid;
    gap: var(--space-4);
  }

  .metrics-grid {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .content-grid {
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  }

  .card,
  .user-card {
    border-radius: calc(var(--radius-lg) + 2px);
    padding: var(--space-4);
    display: grid;
    gap: var(--space-3);
  }

  .accent-card {
    background:
      linear-gradient(145deg, color-mix(in oklab, var(--color-bg-elevated) 92%, transparent), color-mix(in oklab, var(--color-bg-surface) 84%, transparent)),
      radial-gradient(circle at top right, color-mix(in oklab, var(--color-accent) 20%, transparent), transparent 40%);
  }

  .card-head,
  .section-head,
  .feed-head,
  .metric-row,
  .toggle-row,
  .card-actions,
  .password-box,
  .user-top,
  .usage-caption {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .section-head {
    align-items: flex-start;
  }

  .section-head-stack {
    flex-direction: column;
    align-items: stretch;
  }

  .field-grid {
    grid-template-columns: 1fr;
  }

  .field-grid.dense {
    gap: var(--space-3);
  }

  .field {
    display: grid;
    gap: 6px;
  }

  .field span,
  .feed-head span,
  .card-head span {
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  .field input,
  .field select,
  .field-inline input,
  .field-inline select,
  .search-bar input {
    height: 42px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-default);
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
    padding: 0 14px;
    font-size: var(--text-sm);
    outline: none;
  }

  .field-inline {
    display: grid;
    grid-template-columns: 1fr 110px;
    gap: var(--space-2);
  }

  .usage-panel,
  .quota-box,
  .feed-item {
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-subtle);
    background: color-mix(in oklab, var(--color-bg-surface) 82%, transparent);
    padding: var(--space-3);
    display: grid;
    gap: var(--space-2);
  }

  .usage-bar-track {
    height: 10px;
    border-radius: var(--radius-full);
    background: color-mix(in oklab, var(--color-bg-overlay) 84%, transparent);
    overflow: hidden;
  }

  .usage-bar-fill {
    height: 100%;
    border-radius: var(--radius-full);
    background: linear-gradient(90deg, var(--color-accent), color-mix(in oklab, var(--color-accent) 65%, #fff));
  }

  .primary-btn,
  .ghost-btn {
    min-height: 42px;
    border-radius: var(--radius-md);
    padding: 0 16px;
    border: 1px solid var(--color-border-default);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .primary-btn {
    background: var(--color-accent);
    color: var(--color-text-on-accent);
  }

  .ghost-btn {
    background: transparent;
    color: var(--color-text-primary);
  }

  .primary-btn.compact,
  .ghost-btn.compact {
    min-height: 38px;
    padding: 0 12px;
  }

  .pill,
  .pill-group {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .pill {
    width: fit-content;
    padding: 5px 10px;
    border-radius: var(--radius-full);
    background: color-mix(in oklab, var(--color-bg-overlay) 85%, transparent);
    color: var(--color-text-primary);
    font-size: 11px;
    border: 1px solid var(--color-border-subtle);
  }

  .pill.is-success,
  .status-completed {
    background: color-mix(in oklab, var(--color-success) 16%, transparent);
    color: var(--color-success);
  }

  .pill.is-danger,
  .status-failed {
    background: color-mix(in oklab, var(--color-danger) 16%, transparent);
    color: var(--color-danger);
  }

  .pill.is-accent,
  .status-pending {
    background: color-mix(in oklab, var(--color-accent) 15%, transparent);
    color: var(--color-text-primary);
  }

  .user-grid {
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  }

  .search-bar {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    gap: var(--space-2);
    align-items: center;
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    padding: 0 10px;
    background: color-mix(in oklab, var(--color-bg-surface) 84%, transparent);
  }

  .search-bar input {
    border: none;
    background: transparent;
    padding: 0;
  }

  .sub-state {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .mono {
    font-family: var(--font-mono);
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (min-width: 900px) {
    .hero {
      grid-template-columns: 1fr auto;
      align-items: end;
    }

    .section-head-stack {
      flex-direction: row;
      align-items: flex-start;
      justify-content: space-between;
    }

    .field-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spin,
    .spin-inline,
    .is-spinning {
      animation: none;
    }
  }
</style>
