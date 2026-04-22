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
