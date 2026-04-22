# Admin Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the admin panel into three separate SvelteKit routes (`/admin/users`, `/admin/service`, `/admin/log`) connected by a shared tab navigation, with clear visual hierarchy and reduced complexity.

**Architecture:** A new `admin/+layout.svelte` provides the CSS custom properties and max-width shell. Each tab is an independent `+page.svelte` that loads only its own data. A new `AdminTabs` component handles active-tab detection via `$page.url.pathname`. Shared utilities (`formatBytes`, `formatDate`) are extracted to `src/lib/admin-utils.ts` to avoid three-way duplication.

**Tech Stack:** SvelteKit 2, Svelte 5 (runes), TypeScript, Lucide Svelte, `@unisource/sdk` types, `$app/stores` (`page`), existing admin components (AdminBadge, AdminButton, AdminCard, AdminInput, AdminListRow, AdminModal, AdminProgress).

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/lib/admin-utils.ts` | `formatBytes`, `formatDate` shared utilities |
| Create | `src/components/admin/AdminTabs.svelte` | Tab nav with active-state detection |
| Create | `src/routes/(app)/admin/+layout.svelte` | CSS vars shell, wraps all `/admin/*` routes |
| Rewrite | `src/routes/(app)/admin/+page.svelte` | Client-side redirect to `/admin/users` |
| Create | `src/routes/(app)/admin/users/+page.svelte` | User table (4 cols), modals, search |
| Create | `src/routes/(app)/admin/service/+page.svelte` | Service config form + usage stats |
| Rewrite | `src/routes/(app)/admin/log/+page.svelte` | Merged chronological audit+upload feed |

All paths are relative to `apps/frontend/src/`.

---

## Task 1: Shared utilities

**Files:**
- Create: `apps/frontend/src/lib/admin-utils.ts`

- [ ] **Step 1: Create the file**

```typescript
// apps/frontend/src/lib/admin-utils.ts

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** power).toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
}

export function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
```

- [ ] **Step 2: Verify TypeScript — no errors expected**

```bash
cd apps/frontend && pnpm exec tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/lib/admin-utils.ts
git commit -m "feat(frontend): extract admin formatBytes/formatDate utilities"
```

---

## Task 2: AdminTabs component

**Files:**
- Create: `apps/frontend/src/components/admin/AdminTabs.svelte`

- [ ] **Step 1: Create the component**

```svelte
<!-- apps/frontend/src/components/admin/AdminTabs.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { FileText, Settings, Users } from 'lucide-svelte';
</script>

<nav class="admin-tabs">
  <a
    href="/admin/users"
    class="admin-tab"
    class:admin-tab--active={$page.url.pathname.startsWith('/admin/users')}
  >
    <Users size={15} />
    Użytkownicy
  </a>
  <a
    href="/admin/service"
    class="admin-tab"
    class:admin-tab--active={$page.url.pathname.startsWith('/admin/service')}
  >
    <Settings size={15} />
    Serwis
  </a>
  <a
    href="/admin/log"
    class="admin-tab"
    class:admin-tab--active={$page.url.pathname.startsWith('/admin/log')}
  >
    <FileText size={15} />
    Log
  </a>
</nav>

<style>
  .admin-tabs {
    display: flex;
    gap: 2px;
    border-bottom: 1px solid color-mix(in oklab, var(--color-glass-border) 80%, transparent);
  }

  .admin-tab {
    position: relative;
    bottom: -1px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 10px 16px;
    font-size: var(--admin-text-body-size, 14px);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-decoration: none;
    border-radius: 10px 10px 0 0;
    border: 1px solid transparent;
    border-bottom: none;
    transition: color 150ms, background 150ms;
  }

  .admin-tab:hover {
    color: var(--color-text-primary);
    background: color-mix(in oklab, var(--color-bg-overlay) 30%, transparent);
  }

  .admin-tab--active {
    color: var(--color-text-primary);
    background: color-mix(in oklab, var(--color-bg-overlay) 55%, transparent);
    border-color: color-mix(in oklab, var(--color-glass-border) 80%, transparent);
  }

  .admin-tab--active::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--color-accent);
    border-radius: 2px 2px 0 0;
  }
</style>
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/frontend && pnpm exec tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/admin/AdminTabs.svelte
git commit -m "feat(frontend): add AdminTabs component with active-route detection"
```

---

## Task 3: Admin shell layout

**Files:**
- Create: `apps/frontend/src/routes/(app)/admin/+layout.svelte`

- [ ] **Step 1: Create the layout**

```svelte
<!-- apps/frontend/src/routes/(app)/admin/+layout.svelte -->
<script lang="ts">
  let { children } = $props();
</script>

<div class="admin-shell">
  {@render children()}
</div>

<style>
  .admin-shell {
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
  }

  @media (max-width: 959px) {
    .admin-shell {
      --admin-text-page-size: 24px;
      --admin-text-stat-size: 24px;
    }
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add "apps/frontend/src/routes/(app)/admin/+layout.svelte"
git commit -m "feat(frontend): add admin shell layout with CSS custom properties"
```

---

## Task 4: /admin redirect

**Files:**
- Rewrite: `apps/frontend/src/routes/(app)/admin/+page.svelte`

- [ ] **Step 1: Replace entire file with redirect**

```svelte
<!-- apps/frontend/src/routes/(app)/admin/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  onMount(() => {
    goto('/admin/users', { replaceState: true });
  });
</script>
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/frontend && pnpm exec tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add "apps/frontend/src/routes/(app)/admin/+page.svelte"
git commit -m "feat(frontend): redirect /admin to /admin/users"
```

---

## Task 5: /admin/users page

**Files:**
- Create: `apps/frontend/src/routes/(app)/admin/users/+page.svelte`

This extracts user management from the old monolithic admin page. Columns: User / Role / Storage / Actions. Blocked users: row dimmed (opacity 0.6) + small "Zablokowany" badge next to name. Status column removed.

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p "apps/frontend/src/routes/(app)/admin/users"
```

- [ ] **Step 2: Write the page**

```svelte
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
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd apps/frontend && pnpm exec tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add "apps/frontend/src/routes/(app)/admin/users/+page.svelte"
git commit -m "feat(frontend): add /admin/users page with 4-column user table"
```

---

## Task 6: /admin/service page

**Files:**
- Create: `apps/frontend/src/routes/(app)/admin/service/+page.svelte`

Two-column layout: config form (left, 7/12) + usage stats (right, 5/12). No nested bordered boxes — flat grid inside the card.

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p "apps/frontend/src/routes/(app)/admin/service"
```

- [ ] **Step 2: Write the page**

```svelte
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
              <span class="meta-text">Service ID</span>
              <strong class="card-title service-id-small">{service.id}</strong>
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

  :global(.page-state__spinner) {
    animation: service-spin 900ms linear infinite;
  }

  @keyframes service-spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.page-state__spinner) { animation: none; }
  }

  .service-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 24px;
  }

  :global(.service-grid__config) {
    grid-column: span 12;
  }

  :global(.service-grid__usage) {
    grid-column: span 12;
  }

  @media (min-width: 1024px) {
    :global(.service-grid__config) {
      grid-column: span 7;
    }

    :global(.service-grid__usage) {
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

  .service-id-small {
    font-family: var(--font-mono);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 959px) {
    .page-header {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd apps/frontend && pnpm exec tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add "apps/frontend/src/routes/(app)/admin/service/+page.svelte"
git commit -m "feat(frontend): add /admin/service page with config form and usage stats"
```

---

## Task 7: /admin/log page (merged feed)

**Files:**
- Rewrite: `apps/frontend/src/routes/(app)/admin/log/+page.svelte`

Merges audit log and uploads into a single chronological feed sorted by `created_at` descending. Each row shows an icon, content (action label or filename + metadata), and timestamp. Upload rows include a status badge.

- [ ] **Step 1: Rewrite the file**

```svelte
<!-- apps/frontend/src/routes/(app)/admin/log/+page.svelte -->
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
          {#each feed as entry (entry.kind + (entry.kind === 'audit' ? entry.data.id : entry.data.id))}
            {#if entry.kind === 'audit'}
              <AdminListRow as="article" className="feed-row">
                <span class="feed-row__icon">
                  <Activity size={16} />
                </span>
                <div class="feed-row__content">
                  <strong class="body-text">{actionLabels[entry.data.action] ?? entry.data.action}</strong>
                  <span class="meta-text truncate">{entry.data.resource_type}</span>
                  <span class="body-text truncate user-id">{entry.data.user_id}</span>
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
    animation: log-spin 900ms linear infinite;
  }

  @keyframes log-spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.page-state__spinner) { animation: none; }
  }

  .feed-list {
    display: grid;
    gap: 8px;
  }

  :global(.feed-row) {
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

  .user-id {
    color: var(--color-text-secondary);
    font-size: 11px;
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/frontend && pnpm exec tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add "apps/frontend/src/routes/(app)/admin/log/+page.svelte"
git commit -m "feat(frontend): redesign /admin/log as merged chronological activity feed"
```

---

## Task 8: Smoke test and final commit

- [ ] **Step 1: Run the dev server and verify all three routes load**

```bash
pnpm --filter frontend dev
```

Open in browser:
- `http://localhost:5173/admin` → should redirect to `/admin/users`
- `http://localhost:5173/admin/users` → user table with 4 columns, tabs visible
- `http://localhost:5173/admin/service` → config form + usage stats side by side
- `http://localhost:5173/admin/log` → merged feed (both audit and upload entries)

Check:
- Active tab indicator shows correctly on each route
- Blocked user row is dimmed with red "Zablokowany" label inline with name
- No description text under card titles
- Refresh button works on each tab
- Modals (identity, quota, password) still open and save from users tab

- [ ] **Step 2: Final TypeScript check**

```bash
cd apps/frontend && pnpm exec tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit docs**

```bash
git add docs/superpowers/specs/2026-04-23-admin-panel-redesign.md
git commit -m "docs: add admin panel redesign spec"
```
