<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

  let sidebarOpen = $state(false);

  function closeSidebar() {
    sidebarOpen = false;
  }

  function isActive(path: string) {
    if (path === '/') return $page.url.pathname === '/';
    return $page.url.pathname.startsWith(path);
  }
</script>

<div class="shell">
  <!-- Mobile overlay -->
  {#if sidebarOpen}
    <button class="overlay" onclick={closeSidebar} aria-label="Close sidebar"></button>
  {/if}

  <!-- Sidebar -->
  <aside class="sidebar" class:open={sidebarOpen}>
    <div class="sidebar-brand">
      <div class="brand-icon">US</div>
      <div>
        <span class="brand-name">UniSource</span>
        <p class="brand-email">{data.user.email}</p>
      </div>
    </div>

    <nav class="sidebar-nav">
      <a href="/" class="nav-link" class:active={isActive('/')} onclick={closeSidebar}>
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        Dashboard
      </a>
      <a href="/services" class="nav-link" class:active={isActive('/services')} onclick={closeSidebar}>
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
        Services
      </a>
      <a href="/account-keys" class="nav-link" class:active={isActive('/account-keys')} onclick={closeSidebar}>
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
        Account Keys
      </a>
    </nav>

    <div class="sidebar-footer">
      <span class="version">v1.0</span>
    </div>
  </aside>

  <!-- Main area -->
  <div class="main-wrap">
    <!-- Top bar -->
    <header class="topbar">
      <button class="hamburger" onclick={() => (sidebarOpen = !sidebarOpen)} aria-label="Toggle menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <span class="topbar-title">UniSource Admin</span>
    </header>

    <main class="main-content">
      {@render children()}
    </main>
  </div>
</div>

<style>
  .shell {
    display: flex;
    min-height: 100vh;
  }

  /* Sidebar */
  .sidebar {
    position: fixed;
    inset: 0;
    z-index: 40;
    width: 260px;
    background: var(--color-surface);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    transform: translateX(-100%);
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .sidebar.open {
    transform: translateX(0);
    box-shadow: var(--shadow-lg);
  }

  @media (min-width: 768px) {
    .sidebar {
      position: static;
      transform: none;
      box-shadow: none;
      width: 250px;
      flex-shrink: 0;
    }
  }

  /* Overlay */
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 39;
    background: rgba(0, 0, 0, 0.5);
    border: none;
    cursor: pointer;
    animation: fadeIn 0.2s ease;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @media (min-width: 768px) {
    .overlay { display: none; }
  }

  /* Brand */
  .sidebar-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 20px 18px;
    border-bottom: 1px solid var(--color-border);
  }
  .brand-icon {
    width: 38px;
    height: 38px;
    background: var(--color-accent);
    color: #fff;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 14px;
    letter-spacing: -0.02em;
    flex-shrink: 0;
  }
  .brand-name {
    font-size: 15px;
    font-weight: 700;
    color: var(--color-text);
    display: block;
    line-height: 1.2;
  }
  .brand-email {
    font-size: 11px;
    color: var(--color-muted);
    margin: 0;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
  }

  /* Nav */
  .sidebar-nav {
    flex: 1;
    padding: 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .nav-link {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    font-size: 13.5px;
    font-weight: 500;
    color: var(--color-muted);
    transition: background 0.15s, color 0.15s;
  }
  .nav-link:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }
  .nav-link:global(.active) {
    background: var(--color-accent-soft);
    color: var(--color-accent);
  }
  .nav-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    opacity: 0.7;
  }

  .sidebar-footer {
    padding: 12px 18px;
    border-top: 1px solid var(--color-border);
  }
  .version {
    font-size: 11px;
    color: var(--color-muted);
  }

  /* Main area */
  .main-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* Top bar */
  .topbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
    position: sticky;
    top: 0;
    z-index: 20;
  }
  @media (min-width: 768px) {
    .topbar {
      display: none;
    }
  }
  .topbar-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
  }

  .hamburger {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-muted);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
  }
  .hamburger:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .main-content {
    flex: 1;
    overflow: auto;
  }
</style>
