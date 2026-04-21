<script lang="ts">
  import { onMount } from 'svelte';
  import { spring } from 'svelte/motion';
  import { innerHeight, innerWidth } from 'svelte/reactivity/window';
  import { Download, Edit2, FolderInput, Share2, Trash2 } from 'lucide-svelte';
  import type { DriveItem } from './types';
  import { isFileItem } from './types';

  type ContextAction = 'download' | 'rename' | 'move' | 'share' | 'delete';

  let { 
    x = 0, 
    y = 0, 
    item,
    onclose,
    onaction,
  } = $props<{
    x: number;
    y: number;
    item: DriveItem;
    onclose: () => void;
    onaction: (action: ContextAction, item: DriveItem) => void;
  }>();

  const menuWidth = 220;
  const menuHeight = 260;
  const viewportWidth = $derived(innerWidth.current ?? menuWidth + 20);
  const viewportHeight = $derived(innerHeight.current ?? menuHeight + 20);

  let finalX = $derived(Math.max(10, Math.min(x, viewportWidth - menuWidth - 10)));
  let finalY = $derived(Math.max(10, Math.min(y, viewportHeight - menuHeight - 10)));

  const scale = spring(0.94, { stiffness: 0.12, damping: 0.7 });
  const opacity = spring(0, { stiffness: 0.2, damping: 1 });

  const canDownload = $derived(isFileItem(item));
  const canMove = $derived(isFileItem(item));
  const canShare = $derived(isFileItem(item));

  onMount(() => {
    scale.set(1);
    opacity.set(1);
  });

  function closeMenu() {
    scale.set(0.97);
    opacity.set(0);
    setTimeout(() => {
      onclose();
    }, 150);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeMenu();
  }

  function handleAction(actionId: ContextAction) {
    onaction(actionId, item);
    closeMenu();
  }
</script>

<svelte:window onkeydown={handleKeydown} onclick={closeMenu} oncontextmenu={closeMenu} />

<button 
  class="fixed inset-0 z-50 h-full w-full cursor-default bg-transparent block"
  type="button"
  aria-label="Zamknij menu"
  onkeydown={handleKeydown}
  onclick={closeMenu}
></button>

<div 
  class="context-menu glass"
  style="top: {finalY}px; left: {finalX}px; transform: scale({$scale}); opacity: {$opacity}; transform-origin: top left;"
  role="menu"
  tabindex="-1"
  onclick={(e) => e.stopPropagation()}
  oncontextmenu={(e) => e.stopPropagation()}
  onkeydown={(e) => e.key === 'Escape' && closeMenu()}
>
  <div class="menu-title">
    {item?.name || 'Opcje pliku'}
  </div>

  {#if canDownload}
    <button class="menu-item" onclick={() => handleAction('download')} role="menuitem" type="button">
      <Download size={18} />
      <span>Pobierz</span>
    </button>
  {/if}
  
  <button class="menu-item" onclick={() => handleAction('rename')} role="menuitem" type="button">
    <Edit2 size={18} />
    <span>Zmień nazwę</span>
  </button>
  
  {#if canMove}
    <button class="menu-item" onclick={() => handleAction('move')} role="menuitem" type="button">
      <FolderInput size={18} />
      <span>Przenieś do</span>
    </button>
  {/if}

  {#if canShare}
    <button class="menu-item" onclick={() => handleAction('share')} role="menuitem" type="button">
      <Share2 size={18} />
      <span>Udostępnij</span>
    </button>
  {/if}

  <div class="divider"></div>

  <button class="menu-item is-danger" onclick={() => handleAction('delete')} role="menuitem" type="button">
    <Trash2 size={18} />
    <span>Usuń</span>
  </button>
</div>

<style>
  .context-menu {
    position: fixed;
    z-index: 60;
    width: 220px;
    border-radius: var(--radius-lg);
    border-color: var(--color-glass-border);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    box-shadow: 0 28px 45px color-mix(in oklab, #000 34%, transparent);
    will-change: transform;
  }

  .menu-title {
    padding: 8px 10px;
    font-size: var(--text-xs);
    line-height: var(--leading-xs);
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-border-subtle);
    margin-bottom: 2px;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }

  .menu-item {
    width: 100%;
    min-height: 38px;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    background: transparent;
    color: var(--color-text-primary);
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 0 10px;
    text-align: left;
    font-size: var(--text-sm);
    line-height: var(--leading-sm);
    transition:
      background-color var(--duration-fast) var(--ease-in-out),
      color var(--duration-fast) var(--ease-in-out),
      border-color var(--duration-fast) var(--ease-in-out);
  }

  .menu-item:hover,
  .menu-item:focus-visible {
    background: var(--color-accent-muted);
    border-color: var(--color-border-default);
  }

  .menu-item.is-danger {
    color: var(--color-danger);
  }

  .menu-item.is-danger:hover,
  .menu-item.is-danger:focus-visible {
    background: color-mix(in oklab, var(--color-danger) 14%, transparent);
    border-color: color-mix(in oklab, var(--color-danger) 24%, transparent);
  }

  .divider {
    height: 1px;
    margin: 3px 0;
    background: var(--color-border-subtle);
  }

  @media (prefers-reduced-motion: reduce) {
    .context-menu,
    .menu-item {
      transition-duration: 0.01ms;
    }
  }
</style>
