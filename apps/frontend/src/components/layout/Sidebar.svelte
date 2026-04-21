<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import {
    ChevronLeft,
    ChevronRight,
    HardDrive,
    LogOut,
    Settings,
    Share2,
    ShieldCheck,
    Trash2,
  } from 'lucide-svelte';
  import { authState } from '../../state/auth.svelte';

  let isCollapsed = $state(false);
  let sessionReady = $state(false);

  const activeTab = $derived.by(() => {
    const path = page.url.pathname;
    if (path.startsWith('/shared'))   return 'shared';
    if (path.startsWith('/trash'))    return 'trash';
    if (path.startsWith('/settings')) return 'settings';
    if (path.startsWith('/admin'))    return 'admin';
    return 'drive';
  });

  const navItems = [
    { id: 'drive',    label: 'Mój dysk',     href: '/drive',    icon: HardDrive },
    { id: 'shared',   label: 'Udostępnione', href: '/shared',   icon: Share2 },
    { id: 'trash',    label: 'Kosz',         href: '/trash',    icon: Trash2 },
    { id: 'admin',    label: 'Admin',        href: '/admin',    icon: ShieldCheck },
    { id: 'settings', label: 'Ustawienia',   href: '/settings', icon: Settings },
  ] as const;

  function toggleSidebar() {
    isCollapsed = !isCollapsed;
  }

  onMount(() => {
    let cancelled = false;

    (async () => {
      const currentUser = await authState.checkSession();
      if (cancelled) return;

      if (!currentUser) {
        const redirectTarget = `${window.location.pathname}${window.location.search}`;
        window.location.replace(`/login?redirect=${encodeURIComponent(redirectTarget)}`);
        return;
      }

      sessionReady = true;
    })();

    return () => {
      cancelled = true;
    };
  });

  async function handleLogout() {
    await authState.logout();
  }
</script>

{#if sessionReady}
  <aside class="sidebar glass hidden md:flex flex-col shrink-0 {isCollapsed ? 'is-collapsed' : ''}" aria-label="Nawigacja boczna">
    <div class="sidebar-head {isCollapsed ? 'is-centered' : ''}">
      {#if !isCollapsed}
        <h2 class="brand">UniSource</h2>
      {/if}

      <button
        class="icon-toggle"
        aria-label="Przełącz sidebar"
        type="button"
        onclick={toggleSidebar}
      >
        {#if isCollapsed}
          <ChevronRight size={20} />
        {:else}
          <ChevronLeft size={20} />
        {/if}
      </button>
    </div>

    <nav class="nav-wrap" aria-label="Główna nawigacja">
      <ul class="nav-list">
        {#each navItems as item (item.id)}
          {@const Icon = item.icon}
          <li>
            <a
              href={item.href}
              class="nav-item {activeTab === item.id ? 'is-active' : ''} {isCollapsed ? 'is-collapsed' : ''}"
              aria-current={activeTab === item.id ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={2} />
              {#if !isCollapsed}
                <span class="nav-label">{item.label}</span>
              {/if}
            </a>
          </li>
        {/each}
      </ul>

      <button
        class="nav-item nav-logout {isCollapsed ? 'is-collapsed' : ''}"
        type="button"
        onclick={handleLogout}
        aria-label="Wyloguj"
      >
        <LogOut size={20} strokeWidth={2} />
        {#if !isCollapsed}
          <span class="nav-label">Wyloguj</span>
        {/if}
      </button>
    </nav>
  </aside>
{:else}
  <aside class="sidebar-placeholder hidden md:block" aria-hidden="true"></aside>
{/if}

<style>
  .sidebar {
    position: sticky;
    top: 0;
    left: 0;
    z-index: 40;
    height: 100dvh;
    width: 240px;
    border-right: 1px solid var(--color-glass-border);
    transition: width var(--duration-normal) var(--ease-spring);
    overflow: hidden;
  }

  .sidebar.is-collapsed {
    width: 76px;
  }

  .sidebar-placeholder {
    width: 240px;
    height: 100dvh;
    flex: 0 0 auto;
  }

  .sidebar-head {
    min-height: 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--space-4);
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .sidebar-head.is-centered {
    justify-content: center;
  }

  .brand {
    font-size: var(--text-md);
    line-height: var(--leading-md);
    letter-spacing: -0.02em;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .icon-toggle {
    width: 34px;
    height: 34px;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    color: var(--color-text-secondary);
    background: transparent;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-fast) var(--ease-in-out);
  }

  .icon-toggle:hover {
    background: var(--color-accent-muted);
    color: var(--color-text-primary);
    border-color: var(--color-border-default);
  }

  .nav-wrap {
    height: calc(100% - 64px);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
  }

  .nav-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    flex: 1;
  }

  .nav-item {
    position: relative;
    width: 100%;
    min-height: 44px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    color: var(--color-text-secondary);
    background: transparent;
    transition:
      transform var(--duration-instant) var(--ease-in-out),
      background-color var(--duration-fast) var(--ease-in-out),
      color var(--duration-fast) var(--ease-in-out),
      border-color var(--duration-fast) var(--ease-in-out);
  }

  .nav-item::before {
    content: '';
    position: absolute;
    left: 6px;
    top: 50%;
    width: 2px;
    height: 18px;
    border-radius: var(--radius-full);
    background: transparent;
    transform: translateY(-50%);
  }

  .nav-item:hover {
    background: var(--color-accent-muted);
    color: var(--color-text-primary);
  }

  .nav-item:active {
    transform: scale(0.98);
    transition-timing-function: var(--ease-spring);
  }

  .nav-item.is-active {
    background: color-mix(in oklab, var(--color-bg-elevated) 88%, transparent);
    border-color: var(--color-border-default);
    color: var(--color-text-primary);
  }

  .nav-item.is-active::before {
    background: var(--color-accent);
  }

  .nav-item.is-collapsed {
    justify-content: center;
    padding: 0;
  }

  .nav-label {
    font-size: var(--text-sm);
    line-height: var(--leading-sm);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nav-logout {
    margin-top: auto;
    color: color-mix(in oklab, var(--color-danger) 78%, var(--color-text-primary));
  }

  .nav-logout:hover {
    background: color-mix(in oklab, var(--color-danger) 16%, transparent);
    color: var(--color-danger);
    border-color: color-mix(in oklab, var(--color-danger) 20%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .sidebar,
    .nav-item,
    .icon-toggle {
      transition-duration: 0.01ms;
    }

    .nav-item:active {
      transform: none;
    }
  }
</style>
