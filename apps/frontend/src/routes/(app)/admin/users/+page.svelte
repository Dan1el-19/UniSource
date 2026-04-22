<!-- apps/frontend/src/routes/(app)/admin/users/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { KeyRound, LoaderCircle, MoreHorizontal, RefreshCw, Save } from 'lucide-svelte';
  import type { AdminUser } from '@unisource/sdk';
  import { apiClient } from '$lib/api';
  import { authState } from '../../../../state/auth.svelte';
  import { formatBytes } from '$lib/admin-utils';
  import AdminBadge from '$components/admin/AdminBadge.svelte';
  import AdminButton from '$components/admin/AdminButton.svelte';
  import AdminCard from '$components/admin/AdminCard.svelte';
  import AdminInput from '$components/admin/AdminInput.svelte';
  import AdminListRow from '$components/admin/AdminListRow.svelte';
  import AdminModal from '$components/admin/AdminModal.svelte';
  import AdminProgress from '$components/admin/AdminProgress.svelte';
  import AdminTabs from '$components/admin/AdminTabs.svelte';

  type ByteUnit = 'MB' | 'GB' | 'TB';
  type AdminModalMode = 'identity' | 'quota' | 'password' | null;
  type ProgressTone = 'accent' | 'success' | 'warning' | 'danger';

  const BYTE_FACTORS: Record<ByteUnit, number> = {
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
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
  let isLoadingUsers = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  let search = $state('');
  let users = $state<AdminUser[]>([]);
  let usersTotal = $state(0);
  let userDrafts = $state<Record<string, UserDraft>>({});
  let activeMenuUserId = $state<string | null>(null);
  let modalMode = $state<AdminModalMode>(null);
  let modalUserId = $state<string | null>(null);

  function normalizeLabelInput(value: string) {
    return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
  }

  function bytesToDraft(bytes: number, preferredUnit: ByteUnit): { value: string; unit: ByteUnit } {
    const exactUnits: ByteUnit[] = ['TB', 'GB', 'MB'];
    const exactUnit = exactUnits.find((unit) => bytes % BYTE_FACTORS[unit] === 0);
    const unit = exactUnit ?? preferredUnit;
    return {
      value: String(Math.max(1, Math.round((bytes / BYTE_FACTORS[unit]) * 100) / 100)),
      unit,
    };
  }

  function parseLimitDraft(value: string, unit: ByteUnit): number {
    const parsed = Number(value.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Podaj dodatnią wartość limitu.');
    return Math.round(parsed * BYTE_FACTORS[unit]);
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
        const d = bytesToDraft(user.max_storage_bytes, nextDrafts[user.id].quotaUnit);
        nextDrafts[user.id].quotaValue = d.value;
        nextDrafts[user.id].quotaUnit = d.unit;
      } else {
        nextDrafts[user.id].quotaValue = '';
      }
    }
    userDrafts = nextDrafts;
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

  async function refreshAll() {
    isRefreshing = true;
    error = null;
    try {
      await loadUsers();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Nie udało się odświeżyć listy użytkowników.';
    } finally {
      isRefreshing = false;
      isLoading = false;
    }
  }

  function clearMessages() { error = null; success = null; }
  function closeUserModal() { modalMode = null; modalUserId = null; }

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
    if (modalMode) { closeUserModal(); return; }
    activeMenuUserId = null;
  }

  function handleWindowClick(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-user-action-anchor]')) return;
    activeMenuUserId = null;
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
      users = users.map((u) => (u.id === userId ? response.user : u));
      hydrateDrafts(users);
      success = message;
      if (options?.closeModal) closeUserModal();
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
      { role: draft.role.trim() || 'user', labels: normalizeLabelInput(draft.labelsText) },
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
          ? parseLimitDraft(draft.quotaValue, draft.quotaUnit)
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
    if (!draft?.password.trim()) { error = 'Podaj nowe hasło przed zapisaniem.'; return; }
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
    try { await loadUsers(); }
    catch (err) { error = err instanceof Error ? err.message : 'Nie udało się pobrać listy użytkowników.'; }
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

  $effect(() => {
    if (modalUserId && !users.some((u) => u.id === modalUserId)) closeUserModal();
    if (activeMenuUserId && !users.some((u) => u.id === activeMenuUserId)) activeMenuUserId = null;
  });

  const modalUser = $derived(modalUserId ? users.find((u) => u.id === modalUserId) ?? null : null);
  const modalDraft = $derived(modalUserId ? userDrafts[modalUserId] ?? null : null);
</script>

<svelte:window onkeydown={handleWindowKeydown} onclick={handleWindowClick} />

<div class="users-page">
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
  {:else}
    <AdminCard label="Użytkownicy" title="Zarządzanie użytkownikami">
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
            <span>Użytkownik</span>
            <span>Rola</span>
            <span>Storage</span>
            <span></span>
          </div>

          <div class="user-table__body">
            {#each users as user (user.id)}
              {@const draft = userDrafts[user.id]}
              {@const storagePercent = getUserStoragePercent(user)}
              <AdminListRow as="article" className="user-row{!user.status ? ' user-row--blocked' : ''}">
                <div class="user-cell user-cell--identity">
                  <div class="user-identity">
                    <div class="user-identity__name">
                      <strong class="body-text">{user.name || user.email}</strong>
                      {#if !user.status}
                        <span class="blocked-label">Zablokowany</span>
                      {/if}
                    </div>
                    <span class="meta-text">{user.email}</span>
                  </div>
                </div>

                <div class="user-cell">
                  <div class="role-stack">
                    <AdminBadge>{user.role}</AdminBadge>
                    {#if user.labels.includes('admin')}
                      <AdminBadge tone="accent">admin</AdminBadge>
                    {/if}
                  </div>
                </div>

                <div class="user-cell user-cell--storage">
                  <div class="storage-stack">
                    <div class="storage-stack__meta">
                      <strong class="body-text">{formatBytes(user.current_used_bytes)}</strong>
                      <span class="meta-text">z {formatBytes(user.effective_max_storage_bytes)}</span>
                    </div>
                    <AdminProgress value={storagePercent} tone={getProgressTone(storagePercent)} />
                  </div>
                </div>

                <div class="user-cell user-cell--actions">
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
                        <hr class="action-menu__divider" />
                        <button
                          type="button"
                          role="menuitem"
                          class:user-action-danger={user.status}
                          onclick={() => handleStatusToggle(user)}
                          disabled={draft.isSaving}
                        >
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
          <span class="meta-text">Łącznie: {usersTotal} użytkowników</span>
        </div>
      {/snippet}
    </AdminCard>
  {/if}
</div>

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
      <AdminButton variant="ghost" onclick={closeUserModal}>Anuluj</AdminButton>
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
  .users-page {
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
    animation: users-spin 900ms linear infinite;
  }

  @keyframes users-spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.page-state__spinner) { animation: none; }
  }

  .sub-state {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .search-form {
    display: grid;
    grid-template-columns: minmax(240px, 1fr) auto;
    gap: 12px;
    width: min(100%, 480px);
  }

  .user-table {
    display: grid;
    gap: 4px;
  }

  .user-table__head,
  :global(.user-row) {
    display: grid;
    grid-template-columns: minmax(0, 2.5fr) minmax(130px, 1fr) minmax(200px, 2fr) 40px;
    gap: 16px;
    align-items: center;
  }

  .user-table__head {
    padding: 0 16px 8px;
    color: var(--color-text-secondary);
    font-size: var(--admin-text-meta-size);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border-bottom: 1px solid color-mix(in oklab, var(--color-glass-border) 60%, transparent);
  }

  .user-table__body {
    display: grid;
    gap: 4px;
    margin-top: 4px;
  }

  :global(.user-row--blocked) {
    opacity: 0.6;
  }

  .user-cell {
    min-width: 0;
    display: grid;
    gap: 8px;
  }

  .user-cell--actions {
    justify-items: end;
  }

  .user-identity {
    display: grid;
    gap: 4px;
  }

  .user-identity__name {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .blocked-label {
    display: inline-flex;
    align-items: center;
    padding: 2px 7px;
    border-radius: 999px;
    border: 1px solid color-mix(in oklab, var(--color-danger) 30%, transparent);
    background: color-mix(in oklab, var(--color-danger) 12%, transparent);
    color: var(--color-danger);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .role-stack {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .storage-stack {
    display: grid;
    gap: 8px;
  }

  .storage-stack__meta {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .action-anchor {
    position: relative;
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
    gap: 2px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.24);
  }

  .action-menu button {
    min-height: 40px;
    padding: 0 12px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: var(--color-text-primary);
    font-size: var(--admin-text-body-size);
    text-align: left;
    cursor: pointer;
  }

  .action-menu button:hover {
    background: color-mix(in oklab, var(--color-bg-overlay) 60%, transparent);
  }

  .action-menu__divider {
    border: none;
    border-top: 1px solid color-mix(in oklab, var(--color-glass-border) 60%, transparent);
    margin: 4px 0;
  }

  .user-action-danger {
    color: var(--color-danger) !important;
  }

  .user-footer {
    display: flex;
    align-items: center;
  }

  .empty-state {
    color: var(--color-text-secondary);
    font-size: var(--admin-text-body-size);
    line-height: var(--admin-text-body-line-height);
  }

  .modal-grid {
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

  .quota-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px;
    border-radius: var(--admin-radius-md);
    border: 1px solid color-mix(in oklab, var(--color-glass-border) 82%, transparent);
    background: color-mix(in oklab, var(--color-bg-overlay) 64%, transparent);
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-radius: var(--admin-radius-md);
    border: 1px solid color-mix(in oklab, var(--color-glass-border) 82%, transparent);
    background: color-mix(in oklab, var(--color-bg-overlay) 64%, transparent);
    cursor: pointer;
  }

  .checkbox-row input {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  @media (max-width: 959px) {
    .page-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .search-form {
      width: 100%;
      grid-template-columns: 1fr;
    }

    .user-table__head {
      display: none;
    }

    :global(.user-row) {
      grid-template-columns: 1fr;
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
  }
</style>
