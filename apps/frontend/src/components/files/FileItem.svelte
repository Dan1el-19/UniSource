<script lang="ts">
  import {
    Archive,
    Code,
    FileText,
    Folder,
    Image,
    MoreVertical,
    Music,
    Video,
  } from 'lucide-svelte';

  import type { DriveItem } from './types';
  import { isFolderItem } from './types';

  let { 
    item, 
    viewMode = 'grid', 
    isSelected = false,
    onselect,
    oncontextmenu
  } = $props<{
    item: DriveItem;
    viewMode?: 'grid' | 'list';
    isSelected?: boolean;
    onselect?: (e: MouseEvent | KeyboardEvent) => void;
    oncontextmenu?: (e: MouseEvent) => void;
  }>();

  function getIconDetails(currentItem: DriveItem) {
    if (isFolderItem(currentItem)) {
      return {
        icon: Folder,
        color: 'var(--color-text-secondary)',
        bg: 'transparent',
      };
    }

    const mime = currentItem.file.mime_type.toLowerCase();
    const name = currentItem.name.toLowerCase();

    if (mime.startsWith('image/')) {
      return { icon: Image, color: 'var(--color-type-image)', bg: 'color-mix(in oklab, var(--color-type-image) 15%, transparent)' };
    }

    if (mime.startsWith('video/')) {
      return { icon: Video, color: 'var(--color-type-video)', bg: 'color-mix(in oklab, var(--color-type-video) 14%, transparent)' };
    }

    if (mime.startsWith('audio/')) {
      return { icon: Music, color: 'var(--color-type-audio)', bg: 'color-mix(in oklab, var(--color-type-audio) 15%, transparent)' };
    }

    if (mime === 'application/pdf' || name.endsWith('.pdf')) {
      return { icon: FileText, color: 'var(--color-type-pdf)', bg: 'color-mix(in oklab, var(--color-type-pdf) 14%, transparent)' };
    }

    if (mime.includes('zip') || mime.includes('tar') || mime.includes('rar') || name.endsWith('.7z')) {
      return { icon: Archive, color: 'var(--color-type-archive)', bg: 'color-mix(in oklab, var(--color-type-archive) 14%, transparent)' };
    }

    if (
      mime.includes('json') ||
      mime.includes('javascript') ||
      mime.includes('typescript') ||
      mime.includes('xml') ||
      name.endsWith('.ts') ||
      name.endsWith('.js')
    ) {
      return { icon: Code, color: 'var(--color-type-code)', bg: 'color-mix(in oklab, var(--color-type-code) 14%, transparent)' };
    }

    return {
      icon: FileText,
      color: 'var(--color-text-secondary)',
      bg: 'color-mix(in oklab, var(--color-bg-overlay) 80%, transparent)',
    };
  }

  const isFolder = $derived(isFolderItem(item));
  let details = $derived(getIconDetails(item));
  let IconComponent = $derived(details.icon);

  function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024, dm = decimals < 0 ? 0 : decimals, sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  function handleInteraction(e: MouseEvent | KeyboardEvent) {
    if (onselect) onselect(e);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleInteraction(e);
    }
  }

  function getMetaText(currentItem: DriveItem) {
    if (isFolderItem(currentItem)) {
      return 'Folder';
    }

    const date = new Date(currentItem.file.updated_at * 1000);
    return `${formatBytes(currentItem.file.size)} • ${date.toLocaleDateString('pl-PL')}`;
  }

  const metaText = $derived(getMetaText(item));
</script>

<div 
  class="item {viewMode === 'grid' ? 'is-grid' : 'is-list'} {isSelected ? 'is-selected' : ''}"
  onclick={handleInteraction}
  onkeydown={handleKeydown}
  oncontextmenu={(e) => { e.preventDefault(); if (oncontextmenu) oncontextmenu(e); }}
  role="button"
  tabindex="0"
>
  {#if viewMode === 'grid'}
    <div class="preview" style="--icon-color: {details.color}; --preview-bg: {details.bg};">
      <IconComponent size={48} strokeWidth={1.5} />
      <button
        class="grid-more"
        type="button"
        aria-label="Opcje dla {item.name}"
        onclick={(e) => { e.stopPropagation(); if (oncontextmenu) oncontextmenu(e); }}
      >
        <MoreVertical size={14} />
      </button>
    </div>
    <div class="meta-grid">
      <span class="name" title={item.name}>{item.name}</span>
      <span class="meta">
        {#if isFolder}
          Folder
        {:else}
          {formatBytes(item.file.size)}
        {/if}
      </span>
    </div>
  {:else}
    <div class="row-wrap">
      <div class="row-icon" style="--icon-color: {details.color}; --preview-bg: {details.bg};">
        <IconComponent size={20} strokeWidth={2} />
      </div>
      <div class="row-main">
        <span class="name">{item.name}</span>
        <span class="meta mobile-meta">{metaText}</span>
      </div>
      <div class="row-actions">
        <span class="meta desktop-meta">{metaText}</span>
        <button 
          class="context-btn" 
          aria-label="Opcje" 
          type="button"
          onclick={(e) => { e.stopPropagation(); if (oncontextmenu) oncontextmenu(e); }}
        >
          <MoreVertical size={16} />
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .item {
    width: 100%;
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    background: transparent;
    cursor: pointer;
    user-select: none;
    outline: none;
    transition:
      transform var(--duration-fast) var(--ease-spring),
      background-color var(--duration-fast) linear,
      border-color var(--duration-fast) var(--ease-in-out),
      box-shadow var(--duration-fast) var(--ease-in-out);
  }

  .item:hover {
    background: var(--color-accent-muted);
  }

  .item:active {
    transform: scale(0.98);
  }

  .item:focus-visible {
    border-color: var(--color-border-strong);
    box-shadow: 0 0 0 3px var(--color-accent-muted);
  }

  .item.is-selected {
    border-color: var(--color-border-strong);
    background: color-mix(in oklab, var(--color-accent-muted) 90%, transparent);
  }

  .item.is-grid {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-2);
  }

  .preview {
    aspect-ratio: 1;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--icon-color);
    background: var(--preview-bg);
    border: 1px solid var(--color-border-subtle);
    position: relative;
  }

  .grid-more {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 26px;
    height: 26px;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    background: color-mix(in oklab, var(--color-bg-elevated) 92%, transparent);
    color: var(--color-text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition:
      opacity var(--duration-fast) linear,
      background-color var(--duration-fast) var(--ease-in-out),
      border-color var(--duration-fast) var(--ease-in-out),
      color var(--duration-fast) var(--ease-in-out);
  }

  .item.is-grid:hover .grid-more,
  .item.is-grid:focus-within .grid-more,
  .item.is-selected .grid-more {
    opacity: 1;
  }

  .grid-more:hover {
    background: var(--color-accent-muted);
    border-color: var(--color-border-default);
    color: var(--color-text-primary);
  }

  @media (max-width: 768px) {
    .grid-more {
      opacity: 1;
    }
  }

  .meta-grid {
    display: grid;
    gap: 2px;
    padding: 0 2px;
  }

  .name {
    display: block;
    font-size: var(--text-base);
    line-height: var(--leading-base);
    font-weight: 500;
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    font-size: var(--text-xs);
    line-height: var(--leading-xs);
    color: var(--color-text-secondary);
    transition: opacity var(--duration-fast) linear;
  }

  .item.is-grid .meta {
    opacity: 0.4;
  }

  .item.is-grid:hover .meta,
  .item.is-selected .meta {
    opacity: 1;
  }

  .item.is-list {
    min-height: 50px;
    padding: 7px 10px;
  }

  .row-wrap {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    gap: var(--space-3);
    align-items: center;
  }

  .row-icon {
    width: 34px;
    height: 34px;
    border-radius: var(--radius-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--icon-color);
    background: var(--preview-bg);
  }

  .row-main {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .row-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
  }

  .mobile-meta {
    display: none;
  }

  .desktop-meta {
    min-width: 128px;
    text-align: right;
  }

  .context-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    color: var(--color-text-secondary);
    background: transparent;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition:
      opacity var(--duration-fast) linear,
      background-color var(--duration-fast) var(--ease-in-out),
      color var(--duration-fast) var(--ease-in-out);
  }

  .item.is-list:hover .context-btn,
  .context-btn:focus-visible,
  .item.is-selected .context-btn {
    opacity: 1;
  }

  .context-btn:hover {
    background: var(--color-accent-muted);
    color: var(--color-text-primary);
  }

  @media (max-width: 768px) {
    .desktop-meta {
      display: none;
    }

    .mobile-meta {
      display: block;
    }

    .context-btn {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .item,
    .meta,
    .context-btn {
      transition-duration: 0.01ms;
    }

    .item:active {
      transform: none;
    }
  }
</style>
