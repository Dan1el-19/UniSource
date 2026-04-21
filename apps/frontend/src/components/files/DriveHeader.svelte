<script lang="ts">
  import { onMount } from 'svelte';
  import { ChevronRight, FolderPlus, Grid, List, Upload } from 'lucide-svelte';
  import Input from '../ui/Input.svelte';
  
  let { 
    viewMode = 'grid',
    searchQuery = $bindable(''),
    pathParts = [],
    onviewmodechange,
    oncreatefolder,
    onpickfiles,
  } = $props<{
    viewMode?: 'grid' | 'list';
    searchQuery?: string;
    pathParts?: Array<{ name: string; href: string }>;
    onviewmodechange?: (nextMode: 'grid' | 'list') => void;
    oncreatefolder?: () => void;
    onpickfiles?: (files: File[]) => void;
  }>();

  let isScrolled = $state(false);
  const fileInputId = 'drive-upload-input';

  onMount(() => {
    const scrollRoot = document.querySelector('.drive-scroll-region');

    const handleScroll = () => {
      const top = scrollRoot instanceof HTMLElement ? scrollRoot.scrollTop : window.scrollY;
      isScrolled = top > 10;
    };

    handleScroll();

    if (scrollRoot instanceof HTMLElement) {
      scrollRoot.addEventListener('scroll', handleScroll, { passive: true });
      return () => scrollRoot.removeEventListener('scroll', handleScroll);
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  });

  function openFilePicker() {
    const input = document.getElementById(fileInputId);
    if (input instanceof HTMLInputElement) {
      input.click();
    }
  }

  function handleFileInputChange(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    const files = target.files ? Array.from(target.files) : [];

    if (files.length > 0) {
      onpickfiles?.(files);
    }

    target.value = '';
  }
</script>

<header class="header {isScrolled ? 'is-scrolled' : ''}">
  <div class="top-row">
    <div class="breadcrumbs" aria-label="Ścieżka folderów">
      <a href="/drive">Mój dysk</a>
    {#each pathParts as part (part.href)}
      <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
      <a href={part.href}>{part.name}</a>
    {/each}
    </div>

    <div class="controls">
      <button type="button" class="action-btn" onclick={oncreatefolder}>
        <FolderPlus size={18} strokeWidth={2} />
        <span>Nowy folder</span>
      </button>

      <button type="button" class="action-btn" onclick={openFilePicker}>
        <Upload size={18} strokeWidth={2} />
        <span>Wgraj</span>
      </button>

      <button 
        type="button"
        class="action-btn icon-only"
        aria-label="Przełącz widok"
        onclick={() => onviewmodechange?.(viewMode === 'grid' ? 'list' : 'grid')}
      >
        {#if viewMode === 'grid'}
          <List size={18} strokeWidth={2} />
        {:else}
          <Grid size={18} strokeWidth={2} />
        {/if}
      </button>
    </div>
  </div>

  <div class="search-row">
    <Input
      type="search"
      icon="search"
      placeholder="Szukaj po nazwie pliku lub folderu"
      bind:value={searchQuery}
      class="w-full"
      aria-label="Szukaj"
    />
  </div>

  <input
    id={fileInputId}
    type="file"
    multiple
    class="sr-only"
    onchange={handleFileInputChange}
  />
</header>

<style>
  .header {
    position: sticky;
    top: 0;
    z-index: 35;
    width: 100%;
    padding: var(--space-3) var(--shell-px);
    border-bottom: 1px solid transparent;
    background: transparent;
    transition:
      border-color var(--duration-fast) var(--ease-in-out),
      background-color var(--duration-fast) var(--ease-in-out),
      box-shadow var(--duration-fast) var(--ease-in-out);
  }

  .header.is-scrolled {
    border-color: var(--color-glass-border);
    background: var(--color-glass-bg);
    backdrop-filter: blur(var(--color-glass-blur)) saturate(180%);
    -webkit-backdrop-filter: blur(var(--color-glass-blur)) saturate(180%);
    box-shadow: 0 14px 32px color-mix(in oklab, #000 22%, transparent);
  }

  .top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .breadcrumbs {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--text-base);
    line-height: var(--leading-base);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
  }

  .breadcrumbs a {
    color: var(--color-text-primary);
    opacity: 0.95;
    text-overflow: ellipsis;
    overflow: hidden;
  }

  .breadcrumbs a:hover {
    opacity: 0.72;
  }

  .breadcrumbs :global(svg) {
    color: var(--color-text-tertiary);
    flex-shrink: 0;
  }

  .controls {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .action-btn {
    min-height: 36px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border-default);
    background: color-mix(in oklab, var(--color-bg-elevated) 82%, transparent);
    color: var(--color-text-primary);
    padding: 0 12px;
    font-size: var(--text-sm);
    line-height: var(--leading-sm);
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition:
      transform var(--duration-fast) var(--ease-spring),
      background-color var(--duration-fast) var(--ease-in-out),
      border-color var(--duration-fast) var(--ease-in-out);
  }

  .action-btn:hover {
    background: var(--color-accent-muted);
    border-color: var(--color-border-strong);
  }

  .action-btn:active {
    transform: scale(0.97);
  }

  .action-btn.icon-only {
    width: 36px;
    padding: 0;
    justify-content: center;
  }

  .search-row {
    margin-top: var(--space-3);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  @media (max-width: 768px) {
    .controls {
      width: 100%;
      justify-content: flex-end;
    }

    .action-btn span {
      display: none;
    }

    .action-btn {
      width: 36px;
      padding: 0;
      justify-content: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .header,
    .action-btn {
      transition-duration: 0.01ms;
    }

    .action-btn:active {
      transform: none;
    }
  }
</style>
