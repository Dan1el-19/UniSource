<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Activity,
    ArrowRight,
    HardDrive,
    KeyRound,
    LoaderCircle,
    MoreHorizontal,
    RefreshCw,
    Save,
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
  import AdminBadge from '$components/admin/AdminBadge.svelte';
  import AdminButton from '$components/admin/AdminButton.svelte';
  import AdminCard from '$components/admin/AdminCard.svelte';
  import AdminInput from '$components/admin/AdminInput.svelte';
  import AdminListRow from '$components/admin/AdminListRow.svelte';
  import AdminModal from '$components/admin/AdminModal.svelte';
  import AdminProgress from '$components/admin/AdminProgress.svelte';

  type ByteUnit = 'MB' | 'GB' | 'TB';
  type AdminModalMode = 'identity' | 'quota' | 'password' | null;
  type ProgressTone = 'accent' | 'success' | 'warning' | 'danger';

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
    return new Date(ts * 1000).toLocaleString('pl-PL', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
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

  function getProgressTone(percent: number): ProgressTone {
    if (percent >= 85) return 'danger';
    if (percent >= 65) return 'warning';
    if (percent >= 35) return 'accent';
    return 'success';
  }

  function getUserStoragePercent(user: AdminUser) {
    return Math.min((user.current_used_bytes / Math.max(user.effective_max_storage_bytes, 1)) * 100, 100);
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

  function handleWindowClick(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-user-action-anchor]')) return;

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

  const usagePercent = $derived(usage?.used_percent ?? 0);
  const usageTone = $derived(getProgressTone(usagePercent));
  const auditPreview = $derived(auditLog.slice(0, 3));
  const uploadPreview = $derived(uploads.slice(0, 3));
  const modalUser = $derived(modalUserId ? users.find((user) => user.id === modalUserId) ?? null : null);
  const modalDraft = $derived(modalUserId ? userDrafts[modalUserId] ?? null : null);
</script>

<svelte:window onkeydown={handleWindowKeydown} onclick={handleWindowClick} />

<section class="admin-page">
  <header class="page-header">
    <div class="page-header__copy">
      <span class="page-header__eyebrow">Admin</span>
      <h1 class="page-title">Panel administracyjny</h1>
      <p class="page-body">Spójny podgląd limitów, zdarzeń i użytkowników Appwrite Auth.</p>
    </div>

    <AdminButton variant="secondary" size="sm" onclick={refreshAll} isLoading={isRefreshing} disabled={isLoading}>
      <RefreshCw size={16} />
      Odśwież
    </AdminButton>
  </header>

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
    <div class="dashboard-grid">
      <AdminCard
        className="dashboard-card dashboard-card--primary"
        label="Serwis"
        title={service.name}
        description="Konfiguracja limitów i główny stan wykorzystania przestrzeni."
      >
        {#snippet action()}
          <div class="service-id">{service?.id ?? ''}</div>
        {/snippet}

        <div class="service-layout">
          <div class="service-usage">
            <div class="service-usage__header">
              <div class="service-usage__headline">
                <HardDrive size={18} />
                <span class="meta-text">Storage usage</span>
              </div>
              <strong class="numeric-stat">{usagePercent.toFixed(1)}%</strong>
            </div>

            <div class="service-usage__meta">
              <span class="body-text">{formatBytes(usage.current_used_bytes)}</span>
              <span class="meta-text">z {formatBytes(usage.max_storage_bytes)}</span>
            </div>

            <AdminProgress value={usagePercent} tone={usageTone} />
          </div>

          <div class="metric-grid">
            <div class="metric-card">
              <span class="meta-text">Maks. plik</span>
              <strong class="card-title">{formatBytes(service.max_file_size_bytes)}</strong>
            </div>
            <div class="metric-card">
              <span class="meta-text">Użytkownicy</span>
              <strong class="card-title">{usersTotal}</strong>
            </div>
            <div class="metric-card">
              <span class="meta-text">Zdarzenia</span>
              <strong class="card-title">{auditLog.length}</strong>
            </div>
          </div>

          <div class="settings-block">
            <div class="block-header">
              <div class="block-header__copy">
                <h3 class="card-title">Limity serwisu</h3>
                <p class="body-text">Własne wartości i jednostki bez sztywnych progów.</p>
              </div>
            </div>

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
          </div>
        </div>

        {#snippet footer()}
          <AdminButton variant="primary" onclick={handleServiceSave} isLoading={isSavingService}>
            <Save size={16} />
            Zapisz limity
          </AdminButton>
        {/snippet}
      </AdminCard>

      <AdminCard
        className="dashboard-card dashboard-card--secondary"
        label="Aktywność"
        title="Ostatnie zdarzenia"
        description="Krótki podgląd feedu z równym rytmem, stałą wysokością wierszy i wyraźną hierarchią."
      >
        {#snippet action()}
          <a class="link-button" href="/admin/log">
            Pełny log
            <ArrowRight size={16} />
          </a>
        {/snippet}

        <div class="activity-stack">
          <section class="activity-section">
            <div class="activity-section__header">
              <div class="activity-section__title">
                <Activity size={16} />
                <span class="card-title">Audit log</span>
              </div>
              <span class="meta-text">{auditLog.length} pozycji</span>
            </div>

            {#if auditPreview.length === 0}
              <p class="empty-state">Brak zdarzeń.</p>
            {:else}
              <div class="activity-list">
                {#each auditPreview as event (event.id)}
                  <AdminListRow as="article" className="activity-row">
                    <span class="activity-row__icon">
                      <Activity size={16} />
                    </span>
                    <div class="activity-row__content">
                      <strong class="body-text">{actionLabels[event.action] ?? event.action}</strong>
                      <span class="meta-text truncate">{event.resource_type}</span>
                    </div>
                    <span class="meta-text activity-row__meta">{formatDate(event.created_at)}</span>
                  </AdminListRow>
                {/each}
              </div>
            {/if}
          </section>

          <section class="activity-section">
            <div class="activity-section__header">
              <div class="activity-section__title">
                <Upload size={16} />
                <span class="card-title">Uploady</span>
              </div>
              <span class="meta-text">{uploads.length} pozycji</span>
            </div>

            {#if uploadPreview.length === 0}
              <p class="empty-state">Brak uploadów.</p>
            {:else}
              <div class="activity-list">
                {#each uploadPreview as upload (upload.id)}
                  <AdminListRow as="article" className="activity-row activity-row--upload">
                    <span class="activity-row__icon">
                      <Upload size={16} />
                    </span>
                    <div class="activity-row__content">
                      <strong class="body-text truncate">{upload.filename}</strong>
                      <span class="meta-text">{formatBytes(upload.size)}</span>
                    </div>
                    <div class="activity-row__meta activity-row__meta--stack">
                      <AdminBadge tone={upload.status === 'completed' ? 'success' : upload.status === 'failed' ? 'danger' : 'accent'}>
                        {uploadStatusLabels[upload.status] ?? upload.status}
                      </AdminBadge>
                      <span class="meta-text">{formatDate(upload.created_at)}</span>
                    </div>
                  </AdminListRow>
                {/each}
              </div>
            {/if}
          </section>
        </div>
      </AdminCard>

      <AdminCard
        className="dashboard-card dashboard-card--full"
        label="Użytkownicy"
        title="Zarządzanie użytkownikami"
        description="Jedna siatka z konsekwentnymi kolumnami: użytkownik, status, role, storage i akcje."
      >
        {#snippet action()}
          <form class="search-form" onsubmit={handleSearchSubmit}>
            <AdminInput bind:value={search} type="search" placeholder="Szukaj po emailu lub nazwie" icon="search" />
            <AdminButton variant="secondary" size="sm" type="submit" isLoading={isLoadingUsers}>
              Szukaj
            </AdminButton>
          </form>
        {/snippet}

        {#if isLoadingUsers}
          <div class="sub-state">
            <LoaderCircle size={20} class="page-state__spinner" />
            <span class="body-text">Ładowanie użytkowników…</span>
          </div>
        {:else if users.length === 0}
          <p class="empty-state">Brak użytkowników dla bieżącego filtra.</p>
        {:else}
          <div class="user-table">
            <div class="user-table__head">
              <span>User</span>
              <span>Status</span>
              <span>Role</span>
              <span>Storage usage</span>
              <span class="user-table__actions-label">Actions</span>
            </div>

            <div class="user-table__body">
              {#each users as user (user.id)}
                {@const draft = userDrafts[user.id]}
                {@const storagePercent = getUserStoragePercent(user)}
                <AdminListRow as="article" className="user-row">
                  <div class="user-cell user-cell--identity">
                    <span class="mobile-label">User</span>
                    <div class="user-identity">
                      <strong class="body-text">{user.name || user.email}</strong>
                      <span class="meta-text">{user.email}</span>
                    </div>
                  </div>

                  <div class="user-cell">
                    <span class="mobile-label">Status</span>
                    <AdminBadge tone={user.status ? 'success' : 'danger'}>
                      {user.status ? 'Aktywny' : 'Zablokowany'}
                    </AdminBadge>
                  </div>

                  <div class="user-cell">
                    <span class="mobile-label">Role</span>
                    <div class="role-stack">
                      <AdminBadge>{user.role}</AdminBadge>
                      {#if user.labels.includes('admin')}
                        <AdminBadge tone="accent">admin</AdminBadge>
                      {/if}
                    </div>
                  </div>

                  <div class="user-cell user-cell--storage">
                    <span class="mobile-label">Storage usage</span>
                    <div class="storage-stack">
                      <div class="storage-stack__meta">
                        <strong class="body-text">{formatBytes(user.current_used_bytes)}</strong>
                        <span class="meta-text">z {formatBytes(user.effective_max_storage_bytes)}</span>
                      </div>
                      <AdminProgress value={storagePercent} tone={getProgressTone(storagePercent)} />
                    </div>
                  </div>

                  <div class="user-cell user-cell--actions">
                    <span class="mobile-label">Actions</span>
                    <div class="action-anchor" data-user-action-anchor>
                      <AdminButton
                        variant="ghost"
                        size="sm"
                        iconOnly={true}
                        onclick={() => toggleUserMenu(user.id)}
                        aria-expanded={activeMenuUserId === user.id}
                        aria-label={`Opcje dla ${user.email}`}
                      >
                        <MoreHorizontal size={16} />
                      </AdminButton>

                      {#if activeMenuUserId === user.id}
                        <div class="action-menu glass" role="menu">
                          <button type="button" role="menuitem" onclick={() => openUserModal(user, 'identity')}>
                            Rola i labelsy
                          </button>
                          <button type="button" role="menuitem" onclick={() => openUserModal(user, 'quota')}>
                            Limit miejsca
                          </button>
                          <button type="button" role="menuitem" onclick={() => openUserModal(user, 'password')}>
                            Nadpisz hasło
                          </button>
                          <button type="button" role="menuitem" class:user-action-danger={user.status} onclick={() => handleStatusToggle(user)} disabled={draft.isSaving}>
                            {user.status ? 'Zablokuj konto' : 'Aktywuj konto'}
                          </button>
                        </div>
                      {/if}
                    </div>
                  </div>
                </AdminListRow>
              {/each}
            </div>
          </div>
        {/if}

        {#snippet footer()}
          <div class="user-footer">
            <span class="meta-text">Łącznie w bieżącym widoku: {usersTotal}</span>
          </div>
        {/snippet}
      </AdminCard>
    </div>
  {/if}
</section>

{#if modalUser && modalDraft && modalMode}
  <AdminModal
    label="Użytkownik"
    title={modalMode === 'identity' ? 'Rola i labelsy' : modalMode === 'quota' ? 'Limit miejsca' : 'Nadpisanie hasła'}
    description={`${modalUser.name || modalUser.email} · ${modalUser.email}`}
    onclose={closeUserModal}
  >
    {#if modalMode === 'identity'}
      <div class="modal-grid">
        <label class="field-group">
          <span class="meta-text">Rola aplikacyjna</span>
          <AdminInput bind:value={modalDraft.role} type="text" placeholder="np. user, admin, manager" />
        </label>

        <label class="field-group">
          <span class="meta-text">Labelsy Appwrite</span>
          <AdminInput bind:value={modalDraft.labelsText} type="text" placeholder="admin, beta, vip" />
        </label>
      </div>
    {:else if modalMode === 'quota'}
      <div class="modal-grid">
        <div class="quota-summary">
          <span class="meta-text">Aktualnie zajęte</span>
          <strong class="card-title">{formatBytes(modalUser.current_used_bytes)}</strong>
        </div>

        <label class="checkbox-row">
          <input bind:checked={modalDraft.quotaEnabled} type="checkbox" />
          <span class="body-text">Ustaw własny limit dla tego użytkownika</span>
        </label>

        {#if modalDraft.quotaEnabled}
          <div class="field-combo">
            <AdminInput bind:value={modalDraft.quotaValue} type="number" min="1" step="0.01" placeholder="np. 25" />
            <select bind:value={modalDraft.quotaUnit} class="form-select">
              <option value="MB">MB</option>
              <option value="GB">GB</option>
              <option value="TB">TB</option>
            </select>
          </div>
        {:else}
          <p class="body-text">Po wyłączeniu użytkownik dziedziczy limit serwisu.</p>
        {/if}
      </div>
    {:else}
      <div class="modal-grid">
        <label class="field-group">
          <span class="meta-text">Nowe hasło</span>
          <AdminInput bind:value={modalDraft.password} type="text" placeholder="Min. 8 znaków" />
        </label>
        <p class="body-text">Po zmianie wszystkie aktywne sesje tego użytkownika zostaną wylogowane.</p>
      </div>
    {/if}

    {#snippet footer()}
      <AdminButton variant="ghost" onclick={closeUserModal}>
        Anuluj
      </AdminButton>

      {#if modalMode === 'identity'}
        <AdminButton variant="primary" onclick={() => handleIdentitySave(modalUser)} isLoading={modalDraft.isSaving}>
          <Save size={16} />
          Zapisz
        </AdminButton>
      {:else if modalMode === 'quota'}
        <AdminButton variant="primary" onclick={() => handleQuotaSave(modalUser)} isLoading={modalDraft.isSaving}>
          <Save size={16} />
          Zapisz limit
        </AdminButton>
      {:else}
        <AdminButton variant="primary" onclick={() => handlePasswordReset(modalUser)} isLoading={modalDraft.isResetting}>
          <KeyRound size={16} />
          Nadpisz hasło
        </AdminButton>
      {/if}
    {/snippet}
  </AdminModal>
{/if}

<style>
  .admin-page {
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
    --admin-text-stat-size: 32px;
    --admin-text-stat-line-height: 1;
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

  :global(.page-state__spinner) {
    animation: admin-page-spin 900ms linear infinite;
  }

  @keyframes admin-page-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 24px;
  }

  :global(.dashboard-card) {
    grid-column: span 12;
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
    line-height: var(--admin-text-meta-line-height);
  }

  .service-layout,
  .service-usage,
  .metric-grid,
  .settings-block,
  .form-grid,
  .field-group,
  .field-combo,
  .activity-stack,
  .activity-list,
  .user-table,
  .user-table__body,
  .user-identity,
  .storage-stack,
  .modal-grid {
    display: grid;
    gap: 24px;
  }

  .service-usage,
  .metric-card,
  .settings-block,
  .quota-summary {
    padding: 24px;
    border-radius: var(--admin-radius-lg);
    border: 1px solid color-mix(in oklab, var(--color-glass-border) 82%, transparent);
    background: color-mix(in oklab, var(--color-bg-overlay) 64%, transparent);
  }

  .service-usage__header,
  .service-usage__meta,
  .block-header,
  .activity-section__header,
  .activity-section__title,
  .sub-state,
  .storage-stack__meta,
  .user-footer,
  .checkbox-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .service-usage__headline,
  .block-header__copy,
  .action-anchor,
  .activity-row__meta--stack,
  .role-stack {
    display: grid;
    gap: 12px;
  }

  .service-usage__headline {
    grid-auto-flow: column;
    justify-content: flex-start;
    align-items: center;
  }

  .metric-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .metric-card {
    display: grid;
    gap: 12px;
  }

  .form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .field-group {
    gap: 12px;
  }

  .field-combo {
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
    line-height: var(--admin-text-body-line-height);
    outline: none;
  }

  .form-select:hover,
  .form-select:focus-visible {
    border-color: color-mix(in oklab, var(--color-accent) 36%, var(--color-glass-border));
  }

  .link-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
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

  .activity-section {
    display: grid;
    gap: 16px;
  }

  :global(.activity-row) {
    grid-template-columns: 16px minmax(0, 1fr) auto;
  }

  .activity-row__icon {
    color: var(--color-text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .activity-row__content {
    min-width: 0;
    display: grid;
    gap: 8px;
  }

  .activity-row__meta {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    text-align: right;
  }

  .activity-row__meta--stack {
    justify-items: end;
    align-content: center;
  }

  .search-form {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) auto;
    gap: 12px;
    width: min(100%, 480px);
  }

  .empty-state {
    color: var(--color-text-secondary);
    font-size: var(--admin-text-body-size);
    line-height: var(--admin-text-body-line-height);
  }

  .user-table__head,
  :global(.user-row) {
    display: grid;
    grid-template-columns: minmax(0, 2.8fr) minmax(120px, 1fr) minmax(180px, 1.4fr) minmax(240px, 2fr) 40px;
    gap: 16px;
    align-items: center;
  }

  .user-table__head {
    padding: 0 16px;
    color: var(--color-text-secondary);
    font-size: var(--admin-text-meta-size);
    line-height: var(--admin-text-meta-line-height);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .user-table__actions-label {
    text-align: center;
  }

  :global(.user-row) {
    position: relative;
  }

  .user-cell {
    min-width: 0;
    display: grid;
    gap: 8px;
  }

  .user-cell--actions {
    justify-items: end;
  }

  .mobile-label {
    display: none;
    color: var(--color-text-secondary);
    font-size: var(--admin-text-meta-size);
    line-height: var(--admin-text-meta-line-height);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .action-anchor {
    position: relative;
    justify-items: end;
  }

  .action-menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 12;
    width: 220px;
    padding: 8px;
    border-radius: var(--admin-radius-md);
    border: 1px solid color-mix(in oklab, var(--color-glass-border) 88%, transparent);
    background: color-mix(in oklab, var(--color-bg-surface) 88%, transparent);
    display: grid;
    gap: 8px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.24);
  }

  .action-menu button {
    min-height: 40px;
    padding: 0 12px;
    border: none;
    border-radius: 12px;
    background: transparent;
    color: var(--color-text-primary);
    font-size: var(--admin-text-body-size);
    line-height: var(--admin-text-body-line-height);
    text-align: left;
  }

  .action-menu button:hover {
    background: color-mix(in oklab, var(--color-bg-overlay) 60%, transparent);
  }

  .user-action-danger {
    color: var(--color-danger) !important;
  }

  .storage-stack {
    gap: 12px;
  }

  .quota-summary,
  .checkbox-row {
    padding: 16px;
    border-radius: var(--admin-radius-md);
    border: 1px solid color-mix(in oklab, var(--color-glass-border) 82%, transparent);
    background: color-mix(in oklab, var(--color-bg-overlay) 64%, transparent);
  }

  .checkbox-row {
    justify-content: flex-start;
  }

  .checkbox-row input {
    width: 16px;
    height: 16px;
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (min-width: 1120px) {
    :global(.dashboard-card--primary) {
      grid-column: span 7;
    }

    :global(.dashboard-card--secondary) {
      grid-column: span 5;
    }

    :global(.dashboard-card--full) {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 1119px) {
    .metric-grid,
    .form-grid {
      grid-template-columns: 1fr;
    }

    .search-form {
      width: 100%;
    }
  }

  @media (max-width: 959px) {
    .admin-page {
      --admin-text-page-size: 24px;
      --admin-text-stat-size: 24px;
    }

    .page-header,
    .service-usage__header,
    .service-usage__meta,
    .activity-section__header {
      flex-direction: column;
      align-items: flex-start;
    }

    .search-form {
      grid-template-columns: 1fr;
    }

    .user-table__head {
      display: none;
    }

    :global(.user-row) {
      grid-template-columns: 1fr;
    }

    .mobile-label {
      display: inline-flex;
    }

    .user-cell--actions {
      justify-items: stretch;
    }

    .action-anchor {
      justify-items: stretch;
    }

    .action-menu {
      left: 0;
      right: auto;
      width: 100%;
    }

    :global(.activity-row) {
      grid-template-columns: 16px minmax(0, 1fr);
    }

    .activity-row__meta {
      grid-column: 2;
      justify-content: flex-start;
      text-align: left;
    }

    .activity-row__meta--stack {
      justify-items: start;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.page-state__spinner) {
      animation: none;
    }
  }
</style>
