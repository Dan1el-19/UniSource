<script lang="ts">
  import { onMount } from 'svelte';
  import { Activity, ArrowRight, HardDrive, KeyRound, LoaderCircle, MoreHorizontal, RefreshCw, Save, Search, Upload, X } from 'lucide-svelte';
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
  type AdminModalMode = 'identity' | 'quota' | 'password' | null;

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

  let activeMenuUserId = $state<string | null>(null);
  let modalMode = $state<AdminModalMode>(null);
  let modalUserId = $state<string | null>(null);

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
    const quotaDraft = user.max_storage_bytes
      ? bytesToDraft(user.max_storage_bytes, 'GB')
      : { value: '', unit: 'GB' as ByteUnit };

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
      apiClient.admin.auditLog({ limit: 6 }),
      apiClient.admin.listUploads({ limit: 6 }),
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

  function closeUserModal() {
    modalMode = null;
    modalUserId = null;
  }

  function toggleUserMenu(userId: string) {
    activeMenuUserId = activeMenuUserId === userId ? null : userId;
  }

  function openUserModal(user: AdminUser, mode: Exclude<AdminModalMode, null>) {
    activeMenuUserId = null;
    modalUserId = user.id;
    modalMode = mode;
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;

    if (modalMode) {
      closeUserModal();
      return;
    }

    activeMenuUserId = null;
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

  async function updateUser(
    userId: string,
    changes: Parameters<typeof apiClient.admin.updateUser>[1],
    message: string,
    options?: { closeModal?: boolean }
  ) {
    clearMessages();
    userDrafts[userId].isSaving = true;

    try {
      const response = await apiClient.admin.updateUser(userId, changes);
      users = users.map((user) => (user.id === userId ? response.user : user));
      hydrateDrafts(users);
      usage = await apiClient.admin.usage();
      success = message;

      if (options?.closeModal) {
        closeUserModal();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Nie udało się zaktualizować użytkownika.';
    } finally {
      userDrafts[userId].isSaving = false;
    }
  }

  async function handleIdentitySave(user: AdminUser) {
    const draft = userDrafts[user.id];
    if (!draft) return;

    await updateUser(
      user.id,
      {
        role: draft.role.trim() || 'user',
        labels: normalizeLabelInput(draft.labelsText),
      },
      `Zapisano rolę i labelsy użytkownika ${user.email}.`,
      { closeModal: true }
    );
  }

  async function handleQuotaSave(user: AdminUser) {
    const draft = userDrafts[user.id];
    if (!draft) return;

    await updateUser(
      user.id,
      {
        max_storage_bytes: draft.quotaEnabled
          ? parseLimitDraft({ value: draft.quotaValue, unit: draft.quotaUnit })
          : null,
      },
      `Zapisano limit miejsca dla ${user.email}.`,
      { closeModal: true }
    );
  }

  async function handleStatusToggle(user: AdminUser) {
    activeMenuUserId = null;

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
      closeUserModal();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Nie udało się nadpisać hasła.';
    } finally {
      draft.isResetting = false;
    }
  }

  async function handleSearchSubmit(event: SubmitEvent) {
    event.preventDefault();
    error = null;

    try {
      await loadUsers();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Nie udało się pobrać listy użytkowników.';
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

  $effect(() => {
    if (modalUserId && !users.some((user) => user.id === modalUserId)) {
      closeUserModal();
    }

    if (activeMenuUserId && !users.some((user) => user.id === activeMenuUserId)) {
      activeMenuUserId = null;
    }
  });

  const usageColor = $derived.by(() => {
    if (!usage) return 'var(--color-success)';
    if (usage.used_percent >= 85) return 'var(--color-danger)';
    if (usage.used_percent >= 65) return 'var(--color-warning)';
    return 'var(--color-success)';
  });

  const auditPreview = $derived(auditLog.slice(0, 3));
  const uploadPreview = $derived(uploads.slice(0, 3));
  const modalUser = $derived(modalUserId ? users.find((user) => user.id === modalUserId) ?? null : null);
  const modalDraft = $derived(modalUserId ? userDrafts[modalUserId] ?? null : null);
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<section class="admin-wrap">
  <div class="page-header">
    <div class="page-copy">
      <span class="eyebrow">Admin</span>
      <h1>Panel administracyjny</h1>
      <p>Lżejszy, bardziej czytelny układ do limitów, użytkowników i szybkiego podglądu zdarzeń.</p>
    </div>

    <button class="ghost-btn compact" type="button" onclick={refreshAll} disabled={isRefreshing || isLoading}>
      <RefreshCw size={16} class={isRefreshing ? 'is-spinning' : ''} />
      {isRefreshing ? 'Odświeżanie…' : 'Odśwież'}
    </button>
  </div>

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
    <div class="top-grid">
      <section class="card liquid-card overview-card">
        <div class="section-head">
          <div>
            <span class="section-kicker">Serwis</span>
            <h2>{service.name}</h2>
          </div>
          <span class="surface-id mono">{service.id}</span>
        </div>

        <div class="usage-panel">
          <div class="usage-caption">
            <div>
              <strong>{usage.used_percent.toFixed(1)}%</strong>
              <p>Zajętego miejsca</p>
            </div>
            <span>{formatBytes(usage.current_used_bytes)} / {formatBytes(usage.max_storage_bytes)}</span>
          </div>

          <div class="usage-bar-track">
            <div class="usage-bar-fill" style="width: {Math.min(usage.used_percent, 100)}%; background: {usageColor};"></div>
          </div>
        </div>

        <div class="micro-grid">
          <article class="micro-card">
            <span>Maks. plik</span>
            <strong>{formatBytes(service.max_file_size_bytes)}</strong>
          </article>
          <article class="micro-card">
            <span>Użytkownicy</span>
            <strong>{usersTotal}</strong>
          </article>
          <article class="micro-card">
            <span>Podgląd zdarzeń</span>
            <strong>{auditLog.length}</strong>
          </article>
        </div>

        <div class="settings-shell">
          <div class="section-head section-head-tight">
            <div>
              <h3>Limity serwisu</h3>
              <p>Własne wartości i jednostki, bez sztywnych progów.</p>
            </div>
          </div>

          <div class="field-grid compact-grid">
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

          <button class="primary-btn compact" type="button" onclick={handleServiceSave} disabled={isSavingService}>
            <Save size={16} />
            {isSavingService ? 'Zapisywanie…' : 'Zapisz limity'}
          </button>
        </div>
      </section>

      <section class="card liquid-card activity-card">
        <div class="section-head">
          <div>
            <span class="section-kicker">Feed</span>
            <h2>Ostatnie zdarzenia</h2>
            <p>Krótki podgląd. Pełny widok przeniesiony na osobną podstronę.</p>
          </div>

          <a class="text-link" href="/admin/log">
            Pełny log
            <ArrowRight size={15} />
          </a>
        </div>

        <div class="preview-grid">
          <div class="preview-column">
            <div class="preview-head">
              <Activity size={15} />
              <span>Audit log</span>
            </div>

            {#if auditPreview.length === 0}
              <p class="empty-text">Brak zdarzeń.</p>
            {:else}
              <div class="preview-list">
                {#each auditPreview as event (event.id)}
                  <article class="preview-item">
                    <div class="preview-copy">
                      <strong>{actionLabels[event.action] ?? event.action}</strong>
                      <span class="muted truncate">{event.resource_type}</span>
                    </div>
                    <span class="muted preview-time">{formatDate(event.created_at)}</span>
                  </article>
                {/each}
              </div>
            {/if}
          </div>

          <div class="preview-column">
            <div class="preview-head">
              <Upload size={15} />
              <span>Uploady</span>
            </div>

            {#if uploadPreview.length === 0}
              <p class="empty-text">Brak uploadów.</p>
            {:else}
              <div class="preview-list">
                {#each uploadPreview as upload (upload.id)}
                  <article class="preview-item">
                    <div class="preview-copy">
                      <strong class="truncate">{upload.filename}</strong>
                      <span class="muted">{formatBytes(upload.size)}</span>
                    </div>
                    <span class="pill status-{upload.status}">{uploadStatusLabels[upload.status] ?? upload.status}</span>
                  </article>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </section>
    </div>

    <section class="card liquid-card user-section">
      <div class="section-head section-head-stack">
        <div>
          <span class="section-kicker">Użytkownicy</span>
          <h2>Prosta lista z akcjami</h2>
          <p>Role, labelsy, limity i hasło są dostępne z menu, bez przeładowania ekranu formularzami.</p>
        </div>

        <form class="search-bar" onsubmit={handleSearchSubmit}>
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
        <div class="user-list">
          {#each users as user (user.id)}
            {@const draft = userDrafts[user.id]}
            <article class="user-row">
              <div class="user-main">
                <div>
                  <h3>{user.name || user.email}</h3>
                  <p class="muted">{user.email}</p>
                </div>

                <div class="pill-group">
                  <span class="pill {user.status ? 'is-success' : 'is-danger'}">{user.status ? 'Aktywny' : 'Zablokowany'}</span>
                  <span class="pill">{user.role}</span>
                  {#if user.labels.includes('admin')}
                    <span class="pill is-accent">admin</span>
                  {/if}
                </div>
              </div>

              <div class="user-storage">
                <div class="usage-caption">
                  <span>Zajęte miejsce</span>
                  <strong>{formatBytes(user.current_used_bytes)}</strong>
                </div>

                <div class="usage-bar-track compact-track">
                  <div
                    class="usage-bar-fill"
                    style="width: {Math.min((user.current_used_bytes / Math.max(user.effective_max_storage_bytes, 1)) * 100, 100)}%;"
                  ></div>
                </div>

                <p class="muted">
                  Limit efektywny: {formatBytes(user.effective_max_storage_bytes)}
                  {#if user.max_storage_bytes === null}
                    · dziedziczy z serwisu
                  {/if}
                </p>
              </div>

              <div class="user-actions">
                <button
                  class="ghost-btn icon-btn"
                  type="button"
                  aria-label="Opcje dla {user.email}"
                  aria-expanded={activeMenuUserId === user.id}
                  onclick={() => toggleUserMenu(user.id)}
                >
                  <MoreHorizontal size={16} />
                </button>

                {#if activeMenuUserId === user.id}
                  <div class="menu-panel glass" role="menu">
                    <button type="button" role="menuitem" onclick={() => openUserModal(user, 'identity')}>
                      Rola i labelsy
                    </button>
                    <button type="button" role="menuitem" onclick={() => openUserModal(user, 'quota')}>
                      Limit miejsca
                    </button>
                    <button type="button" role="menuitem" onclick={() => openUserModal(user, 'password')}>
                      Nadpisz hasło
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      class={user.status ? 'menu-danger' : ''}
                      onclick={() => handleStatusToggle(user)}
                      disabled={draft.isSaving}
                    >
                      {user.status ? 'Zablokuj konto' : 'Aktywuj konto'}
                    </button>
                  </div>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</section>

{#if modalUser && modalDraft && modalMode}
  <div class="dialog-backdrop" role="presentation" onclick={closeUserModal}></div>

  <div class="dialog glass" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title">
    <div class="dialog-head">
      <div>
        <span class="section-kicker">Użytkownik</span>
        <h2 id="admin-modal-title">
          {#if modalMode === 'identity'}
            Rola i labelsy
          {:else if modalMode === 'quota'}
            Limit miejsca
          {:else}
            Nadpisanie hasła
          {/if}
        </h2>
        <p>{modalUser.name || modalUser.email} · {modalUser.email}</p>
      </div>

      <button class="ghost-btn icon-btn" type="button" aria-label="Zamknij modal" onclick={closeUserModal}>
        <X size={16} />
      </button>
    </div>

    {#if modalMode === 'identity'}
      <div class="dialog-body">
        <div class="field-grid compact-grid">
          <label class="field">
            <span>Rola aplikacyjna</span>
            <input bind:value={modalDraft.role} type="text" placeholder="np. user, admin, manager" />
          </label>

          <label class="field">
            <span>Labelsy Appwrite</span>
            <input bind:value={modalDraft.labelsText} type="text" placeholder="admin, beta, vip" />
          </label>
        </div>
      </div>

      <div class="dialog-actions">
        <button class="ghost-btn compact" type="button" onclick={closeUserModal}>
          Anuluj
        </button>
        <button class="primary-btn compact" type="button" onclick={() => handleIdentitySave(modalUser)} disabled={modalDraft.isSaving}>
          <Save size={16} />
          {modalDraft.isSaving ? 'Zapisywanie…' : 'Zapisz'}
        </button>
      </div>
    {:else if modalMode === 'quota'}
      <div class="dialog-body">
        <div class="quota-summary">
          <span>Aktualnie zajęte</span>
          <strong>{formatBytes(modalUser.current_used_bytes)}</strong>
        </div>

        <label class="toggle-row">
          <input bind:checked={modalDraft.quotaEnabled} type="checkbox" />
          <span>Ustaw własny limit dla tego użytkownika</span>
        </label>

        {#if modalDraft.quotaEnabled}
          <div class="field-inline">
            <input bind:value={modalDraft.quotaValue} type="number" min="1" step="0.01" placeholder="np. 25" />
            <select bind:value={modalDraft.quotaUnit}>
              <option value="MB">MB</option>
              <option value="GB">GB</option>
              <option value="TB">TB</option>
            </select>
          </div>
        {:else}
          <p class="muted">Po wyłączeniu użytkownik dziedziczy limit serwisu.</p>
        {/if}
      </div>

      <div class="dialog-actions">
        <button class="ghost-btn compact" type="button" onclick={closeUserModal}>
          Anuluj
        </button>
        <button class="primary-btn compact" type="button" onclick={() => handleQuotaSave(modalUser)} disabled={modalDraft.isSaving}>
          <Save size={16} />
          {modalDraft.isSaving ? 'Zapisywanie…' : 'Zapisz limit'}
        </button>
      </div>
    {:else}
      <div class="dialog-body">
        <label class="field">
          <span>Nowe hasło</span>
          <input bind:value={modalDraft.password} type="text" placeholder="Min. 8 znaków" />
        </label>
        <p class="muted">Po zmianie wszystkie aktywne sesje tego użytkownika zostaną wylogowane.</p>
      </div>

      <div class="dialog-actions">
        <button class="ghost-btn compact" type="button" onclick={closeUserModal}>
          Anuluj
        </button>
        <button class="primary-btn compact" type="button" onclick={() => handlePasswordReset(modalUser)} disabled={modalDraft.isResetting}>
          <KeyRound size={16} />
          {modalDraft.isResetting ? 'Zapisywanie…' : 'Nadpisz hasło'}
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .admin-wrap {
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: var(--space-4) var(--shell-px) calc(88px + env(safe-area-inset-bottom));
    display: grid;
    gap: var(--space-4);
  }

  .page-header,
  .section-head,
  .usage-caption,
  .preview-head,
  .toggle-row,
  .dialog-head,
  .dialog-actions,
  .user-main,
  .user-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .page-header,
  .section-head,
  .dialog-head {
    align-items: flex-start;
  }

  .page-header {
    padding-bottom: var(--space-1);
  }

  .page-copy {
    display: grid;
    gap: 6px;
  }

  .eyebrow,
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
  h2,
  h3 {
    color: var(--color-text-primary);
    letter-spacing: -0.03em;
  }

  h1 {
    font-size: clamp(1.6rem, 4vw, 2.2rem);
    line-height: 1.02;
  }

  h2 {
    font-size: clamp(1.05rem, 3vw, 1.35rem);
    line-height: 1.1;
  }

  h3 {
    font-size: 1rem;
  }

  .page-copy p,
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
    border-color: color-mix(in oklab, var(--color-danger) 28%, transparent);
    background: color-mix(in oklab, var(--color-danger) 12%, transparent);
    color: color-mix(in oklab, var(--color-danger) 88%, #fff);
  }

  .banner-success {
    border-color: color-mix(in oklab, var(--color-success) 28%, transparent);
    background: color-mix(in oklab, var(--color-success) 12%, transparent);
    color: color-mix(in oklab, var(--color-success) 90%, #fff);
  }

  .state-wrap {
    min-height: 42dvh;
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

  .top-grid,
  .field-grid,
  .preview-grid,
  .preview-list,
  .micro-grid,
  .user-list {
    display: grid;
    gap: var(--space-3);
  }

  .top-grid {
    align-items: start;
  }

  .card,
  .dialog {
    border-radius: calc(var(--radius-lg) + 2px);
    border-color: color-mix(in oklab, var(--color-glass-border) 92%, rgba(255, 255, 255, 0.04));
    background:
      linear-gradient(180deg, color-mix(in oklab, var(--color-bg-elevated) 72%, transparent), color-mix(in oklab, var(--color-bg-surface) 84%, transparent));
    backdrop-filter: blur(calc(var(--color-glass-blur) * 0.8)) saturate(135%);
    -webkit-backdrop-filter: blur(calc(var(--color-glass-blur) * 0.8)) saturate(135%);
    box-shadow:
      0 12px 32px rgba(0, 0, 0, 0.14),
      inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .card {
    padding: var(--space-4);
    display: grid;
    gap: var(--space-4);
  }

  .surface-id {
    padding: 7px 10px;
    border-radius: var(--radius-full);
    background: color-mix(in oklab, var(--color-bg-overlay) 78%, transparent);
    border: 1px solid var(--color-border-subtle);
    color: var(--color-text-secondary);
    font-size: 12px;
  }

  .usage-panel,
  .settings-shell,
  .micro-card,
  .preview-item,
  .user-row,
  .menu-panel,
  .quota-summary {
    border-radius: var(--radius-lg);
    border: 1px solid color-mix(in oklab, var(--color-border-subtle) 90%, transparent);
    background: color-mix(in oklab, var(--color-bg-overlay) 62%, transparent);
  }

  .usage-panel,
  .settings-shell,
  .preview-item,
  .user-row,
  .quota-summary {
    padding: var(--space-3);
  }

  .settings-shell {
    display: grid;
    gap: var(--space-3);
  }

  .section-head-tight {
    gap: var(--space-2);
  }

  .usage-caption strong {
    font-size: 1.2rem;
  }

  .usage-caption p {
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .usage-caption span {
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .usage-bar-track {
    height: 10px;
    border-radius: var(--radius-full);
    background: color-mix(in oklab, var(--color-bg-surface) 92%, transparent);
    overflow: hidden;
  }

  .compact-track {
    height: 8px;
  }

  .usage-bar-fill {
    height: 100%;
    border-radius: var(--radius-full);
    background: linear-gradient(90deg, var(--color-accent), color-mix(in oklab, var(--color-accent) 70%, #fff));
  }

  .micro-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .micro-card {
    padding: var(--space-3);
    display: grid;
    gap: 6px;
  }

  .micro-card span,
  .field span,
  .preview-head span {
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  .micro-card strong {
    font-size: 1rem;
  }

  .field-grid {
    grid-template-columns: 1fr;
  }

  .compact-grid {
    gap: var(--space-3);
  }

  .field {
    display: grid;
    gap: 6px;
  }

  .field input,
  .field select,
  .field-inline input,
  .field-inline select,
  .search-bar input {
    height: 42px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-default);
    background: color-mix(in oklab, var(--color-bg-elevated) 88%, transparent);
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

  .primary-btn,
  .ghost-btn,
  .text-link {
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
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .primary-btn {
    background: color-mix(in oklab, var(--color-accent) 88%, white 12%);
    color: var(--color-text-on-accent);
  }

  .ghost-btn,
  .text-link {
    background: color-mix(in oklab, var(--color-bg-overlay) 78%, transparent);
    color: var(--color-text-primary);
  }

  .compact {
    min-height: 38px;
    padding: 0 12px;
  }

  .icon-btn {
    width: 38px;
    padding: 0;
    flex-shrink: 0;
  }

  .text-link {
    text-decoration: none;
  }

  .preview-grid {
    grid-template-columns: 1fr;
  }

  .preview-column {
    display: grid;
    gap: var(--space-3);
  }

  .preview-head {
    color: var(--color-text-secondary);
  }

  .preview-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .preview-copy {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .preview-time {
    flex-shrink: 0;
    text-align: right;
  }

  .search-bar {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    gap: var(--space-2);
    align-items: center;
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    padding: 0 10px;
    background: color-mix(in oklab, var(--color-bg-overlay) 74%, transparent);
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

  .user-list {
    gap: var(--space-2);
  }

  .user-row {
    display: grid;
    gap: var(--space-3);
    position: relative;
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
    background: color-mix(in oklab, var(--color-bg-surface) 88%, transparent);
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

  .user-storage {
    display: grid;
    gap: 8px;
  }

  .menu-panel {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    z-index: 8;
    min-width: 220px;
    padding: 8px;
    display: grid;
    gap: 4px;
    box-shadow: 0 16px 30px rgba(0, 0, 0, 0.28);
  }

  .menu-panel button {
    min-height: 38px;
    border: none;
    background: transparent;
    color: var(--color-text-primary);
    border-radius: var(--radius-md);
    padding: 0 10px;
    text-align: left;
    font-size: var(--text-sm);
  }

  .menu-panel button:hover {
    background: color-mix(in oklab, var(--color-bg-overlay) 72%, transparent);
  }

  .menu-danger {
    color: var(--color-danger) !important;
  }

  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: color-mix(in oklab, #000 44%, transparent);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  .dialog {
    position: fixed;
    z-index: 81;
    inset: auto 16px 16px;
    width: auto;
    max-width: 560px;
    margin: 0 auto;
    padding: var(--space-4);
    display: grid;
    gap: var(--space-4);
  }

  .dialog-body {
    display: grid;
    gap: var(--space-3);
  }

  .dialog-head p {
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .dialog-actions {
    justify-content: flex-end;
  }

  .quota-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .toggle-row {
    justify-content: flex-start;
  }

  .toggle-row input {
    width: 16px;
    height: 16px;
  }

  .mono {
    font-family: var(--font-mono);
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (min-width: 860px) {
    .top-grid {
      grid-template-columns: minmax(0, 1.05fr) minmax(340px, 0.95fr);
    }

    .preview-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .field-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .user-row {
      grid-template-columns: minmax(0, 1.3fr) minmax(240px, 0.9fr) auto;
      align-items: center;
    }

    .dialog {
      inset: 50% auto auto 50%;
      width: min(560px, calc(100% - 32px));
      transform: translate(-50%, -50%);
    }
  }

  @media (max-width: 859px) {
    .micro-grid {
      grid-template-columns: 1fr;
    }

    .section-head-stack,
    .user-main {
      flex-direction: column;
      align-items: stretch;
    }

    .preview-item {
      flex-direction: column;
      align-items: flex-start;
    }

    .preview-time {
      text-align: left;
    }

    .search-bar {
      grid-template-columns: 18px minmax(0, 1fr);
    }

    .search-bar .ghost-btn {
      grid-column: 1 / -1;
      width: 100%;
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
