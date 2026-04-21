<script lang="ts">
  import { page } from '$app/state';
  import { HardDrive, Settings, Share2, Trash2 } from 'lucide-svelte';

  const activeTab = $derived.by(() => {
    const path = page.url.pathname;
    if (path.startsWith('/shared')) return 'shared';
    if (path.startsWith('/trash')) return 'trash';
    if (path.startsWith('/settings')) return 'settings';
    return 'drive';
  });

  const items = [
    { id: 'drive', label: 'Dysk', href: '/drive', icon: HardDrive },
    { id: 'shared', label: 'Udostępnione', href: '/shared', icon: Share2 },
    { id: 'trash', label: 'Kosz', href: '/trash', icon: Trash2 },
    { id: 'settings', label: 'Ustawienia', href: '/settings', icon: Settings },
  ] as const;
</script>

<nav class="dock-wrap md:hidden pb-safe" aria-label="Nawigacja dolna">
  <div class="dock-bar glass">
    {#each items as item (item.id)}
      {@const Icon = item.icon}
      <a
        href={item.href}
        class="dock-item {activeTab === item.id ? 'is-active' : ''}"
        aria-current={activeTab === item.id ? 'page' : undefined}
      >
        <Icon size={22} strokeWidth={activeTab === item.id ? 2.4 : 2} />
        <span>{item.label}</span>
      </a>
    {/each}
  </div>
</nav>

<style>
  .dock-wrap {
    position: fixed;
    left: var(--space-4);
    right: var(--space-4);
    bottom: var(--space-4);
    z-index: 50;
  }

  .dock-bar {
    min-height: 74px;
    border-radius: var(--radius-xl);
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 2px;
    padding: 8px;
  }

  .dock-item {
    min-height: 56px;
    border-radius: 16px;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    color: var(--color-text-tertiary);
    font-size: 10px;
    line-height: 1;
    font-weight: 500;
    transition:
      color var(--duration-fast) var(--ease-in-out),
      background-color var(--duration-fast) var(--ease-in-out),
      transform var(--duration-fast) var(--ease-spring);
  }

  .dock-item:hover {
    color: var(--color-text-primary);
    background: var(--color-accent-muted);
  }

  .dock-item:active {
    transform: scale(0.95);
  }

  .dock-item.is-active {
    color: var(--color-accent);
    background: color-mix(in oklab, var(--color-accent-muted) 72%, transparent);
  }

  .dock-item.is-active span {
    text-shadow: 0 0 16px color-mix(in oklab, var(--color-accent) 55%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .dock-item {
      transition-duration: 0.01ms;
    }

    .dock-item:active {
      transform: none;
    }
  }
</style>
