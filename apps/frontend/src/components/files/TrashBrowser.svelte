<script lang="ts">
  import { onMount } from 'svelte';
  import type { FileRecord, Folder } from '@unisource/sdk';
  import { LoaderCircle, Trash2, Undo2, Folder as FolderIcon, FileText } from 'lucide-svelte';

  import { apiClient } from '../../lib/api';
  import { authState } from '../../state/auth.svelte';
  import Button from '../ui/Button.svelte';

  type TrashItem =
    | { kind: 'file'; data: FileRecord }
    | { kind: 'folder'; data: Folder };

  let isLoading = $state(true);
  let sessionReady = $state(false);
  let error = $state<string | null>(null);
  let message = $state<string | null>(null);
  let items = $state<TrashItem[]>([]);
  let busyId = $state<string | null>(null);
  let bannerTimer: number | ReturnType<typeof setTimeout> | null = null;

  function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  function getItemId(item: TrashItem) {
    return item.data.id;
  }

  function getItemName(item: TrashItem) {
    return item.kind === 'file' ? item.data.filename : item.data.name;
  }

  function getDeletedAt(item: TrashItem): number {
    const ts = item.data.trashed_at ?? item.data.updated_at;
    return ts;
  }

  function getItemSummary(item: TrashItem) {
    return item.kind === 'folder' ? 'Folder' : formatBytes(item.data.size);
  }

  async function loadTrash() {
    isLoading = true;
    error = null;

    try {
      const [filesPayload, foldersPayload] = await Promise.all([
        apiClient.myFiles.trash({ limit: 100 }),
        apiClient.folders.list({ trashed: true, limit: 100 }),
      ]);

      const fileItems: TrashItem[] = filesPayload.items.map((f) => ({ kind: 'file', data: f }));
      const folderItems: TrashItem[] = foldersPayload.items
        .filter((f) => f.is_trashed)
        .map((f) => ({ kind: 'folder', data: f }));

      items = [...folderItems, ...fileItems].sort(
        (a, b) => getDeletedAt(b) - getDeletedAt(a)
      );
    } catch (err) {
      error = err instanceof Error ? err.message : 'Nie udało się pobrać zawartości kosza.';
    } finally {
      isLoading = false;
    }
  }

  function scheduleBannerClear() {
    if (bannerTimer) window.clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => {
      message = null;
      error = null;
      bannerTimer = null;
    }, 4200);
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
      await loadTrash();
    })();

    return () => {
      cancelled = true;
      if (bannerTimer) window.clearTimeout(bannerTimer);
    };
  });

  async function restore(item: TrashItem) {
    busyId = item.data.id;
    try {
      if (item.kind === 'file') {
        await apiClient.myFiles.restore(item.data.id);
      } else {
        await apiClient.folders.restore(item.data.id);
      }
      message = `Przywrócono: ${getItemName(item)}`;
      scheduleBannerClear();
      await loadTrash();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Nie udało się przywrócić elementu.';
      scheduleBannerClear();
    } finally {
      busyId = null;
    }
  }

  async function removeForever(item: TrashItem) {
    busyId = item.data.id;
    try {
      if (item.kind === 'file') {
        await apiClient.myFiles.delete(item.data.id, { permanent: true });
      } else {
        await apiClient.folders.delete(item.data.id, { permanent: true });
      }
      message = `Usunięto na stałe: ${getItemName(item)}`;
      scheduleBannerClear();
      await loadTrash();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Nie udało się usunąć elementu na stałe.';
      scheduleBannerClear();
    } finally {
      busyId = null;
    }
  }
</script>

<section class="trash-wrap mx-auto w-full max-w-4xl xl:max-w-5xl">
  <header>
    <h1>Kosz</h1>
    <p>Elementy w koszu możesz przywrócić lub usunąć bezpowrotnie.</p>
  </header>

  {#if error}
    <div class="banner banner-error" role="alert">{error}</div>
  {/if}

  {#if message}
    <div class="banner banner-success" role="status">{message}</div>
  {/if}

  {#if !sessionReady || isLoading}
    <div class="state-wrap">
      <div class="spin"><LoaderCircle size={36} /></div>
    </div>
  {:else if items.length === 0}
    <div class="state-wrap">
      <div class="empty-card glass">
        <Trash2 size={30} />
        <h2>Kosz jest pusty</h2>
        <p>Usunięte elementy pojawią się tutaj.</p>
      </div>
    </div>
  {:else}
    <div class="table glass">
      {#each items as item (item.data.id)}
        <article class="row">
          <div class="row-icon" class:is-folder={item.kind === 'folder'}>
            {#if item.kind === 'folder'}
              <FolderIcon size={18} />
            {:else}
              <FileText size={18} />
            {/if}
          </div>

          <div class="meta">
            <h3>{getItemName(item)}</h3>
            <p>
              {getItemSummary(item)}
              · usunięto {new Date(getDeletedAt(item) * 1000).toLocaleDateString('pl-PL')}
            </p>
          </div>

          <div class="actions">
            <Button
              size="sm"
              variant="secondary"
              disabled={busyId === item.data.id}
              onclick={() => restore(item)}
            >
              <span class="inline-flex items-center gap-1"><Undo2 size={14} /> Przywróć</span>
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={busyId === item.data.id}
              onclick={() => removeForever(item)}
            >
              Usuń na zawsze
            </Button>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</section>

<style>
  .trash-wrap {
    width: 100%;
    margin: 0 auto;
    min-height: 100%;
    padding: var(--space-4) var(--shell-px) calc(84px + env(safe-area-inset-bottom));
  }

  header {
    display: grid;
    gap: 6px;
    margin-bottom: var(--space-5);
  }

  h1 {
    font-size: clamp(1.8rem, 2.4vw, 2.2rem);
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: var(--color-text-primary);
  }

  header p {
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .banner {
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    font-size: var(--text-sm);
    line-height: var(--leading-sm);
    padding: 9px 12px;
    margin-bottom: var(--space-3);
  }

  .banner-error {
    border-color: color-mix(in oklab, var(--color-danger) 30%, transparent);
    background: color-mix(in oklab, var(--color-danger) 14%, transparent);
    color: color-mix(in oklab, var(--color-danger) 90%, #fff);
  }

  .banner-success {
    border-color: color-mix(in oklab, var(--color-success) 30%, transparent);
    background: color-mix(in oklab, var(--color-success) 14%, transparent);
    color: color-mix(in oklab, var(--color-success) 95%, #fff);
  }

  .state-wrap {
    min-height: 56dvh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-card {
    width: min(560px, 100%);
    border-radius: var(--radius-lg);
    border-color: var(--color-glass-border);
    padding: var(--space-6);
    display: grid;
    justify-items: center;
    gap: var(--space-2);
    color: var(--color-text-secondary);
    text-align: center;
  }

  .empty-card h2 {
    color: var(--color-text-primary);
    font-size: var(--text-lg);
  }

  .table {
    border-radius: var(--radius-lg);
    border-color: var(--color-glass-border);
    padding: var(--space-2);
    display: grid;
    gap: 4px;
  }

  .row {
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    min-height: 56px;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    background: color-mix(in oklab, var(--color-bg-elevated) 72%, transparent);
  }

  .row-icon {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    background: color-mix(in oklab, var(--color-info) 12%, transparent);
    color: var(--color-info);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .row-icon.is-folder {
    background: color-mix(in oklab, var(--color-warning) 12%, transparent);
    color: var(--color-warning);
  }

  .meta {
    min-width: 0;
    flex: 1;
  }

  .meta h3 {
    color: var(--color-text-primary);
    font-size: var(--text-base);
    font-weight: 500;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }

  .meta p {
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    margin-top: 2px;
  }

  .actions {
    display: inline-flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .spin {
    animation: spin 900ms linear infinite;
    color: var(--color-text-secondary);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 760px) {
    .row {
      flex-wrap: wrap;
    }

    .actions {
      width: 100%;
      justify-content: flex-start;
    }
  }

  @media (min-width: 768px) {
    .trash-wrap {
      padding-top: var(--space-6);
      padding-bottom: var(--space-8);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spin { animation: none; }
  }
</style>
