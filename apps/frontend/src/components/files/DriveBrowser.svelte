<script lang="ts">
  import { onMount } from 'svelte';
  import type { FileRecord, Folder } from '@unisource/sdk';
  import { UnisourceError, UnisourceNetworkError } from '@unisource/sdk';
  import { FolderOpen, LoaderCircle } from 'lucide-svelte';

  import { apiClient, downloadFileById, getFolderById } from '../../lib/api';
  import { authState } from '../../state/auth.svelte';
  import { uploadUiState } from '../../state/upload.svelte';

  import ContextMenu from './ContextMenu.svelte';
  import ShareLinksModal from './ShareLinksModal.svelte';
  import CreateFolderDialog from './CreateFolderDialog.svelte';
  import DriveHeader from './DriveHeader.svelte';
  import FileGrid from './FileGrid.svelte';
  import FileList from './FileList.svelte';
  import MoveDialog from './MoveDialog.svelte';
  import RenameDialog from './RenameDialog.svelte';
  import UploadProgress from './UploadProgress.svelte';
  import type { DriveItem } from './types';
  import { isFileItem, isFolderItem } from './types';

  let { currentPath = '' } = $props<{ currentPath?: string }>();

  const pathSegments = $derived(
    currentPath
      .split('/')
      .filter(Boolean)
      .map((segment: string) => {
        try {
          return decodeURIComponent(segment);
        } catch {
          return segment;
        }
      })
  );

  const currentFolderId = $derived(pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : null);
  
  let viewMode = $state<'grid' | 'list'>('grid');
  let searchQuery = $state('');

  let isLoading = $state(true);
  let sessionReady = $state(false);
  let error = $state<string | null>(null);
  let folders = $state<Folder[]>([]);
  let files = $state<FileRecord[]>([]);
  let breadcrumbParts = $state<Array<{ name: string; href: string }>>([]);
  let moveCandidates = $state<Array<{ id: string; name: string }>>([]);

  let isDragging = $state(false);
  let contextMenuConfig = $state<{ x: number; y: number; item: DriveItem } | null>(null);

  let showCreateFolderDialog = $state(false);
  let renameTarget = $state<DriveItem | null>(null);
  let moveTarget = $state<DriveItem | null>(null);
  let shareTarget = $state<DriveItem | null>(null);

  let operationMessage = $state<string | null>(null);
  let operationError = $state<string | null>(null);

  let loadCycle = 0;
  let uploadToastTimer: number | ReturnType<typeof setTimeout> | null = null;
  let operationBannerTimer: number | ReturnType<typeof setTimeout> | null = null;

  function mapDriveItems(folderRecords: Folder[], fileRecords: FileRecord[]): DriveItem[] {
    const folderItems: DriveItem[] = [...folderRecords]
      .filter((folder) => !folder.is_trashed)
      .sort((a, b) => a.name.localeCompare(b.name, 'pl'))
      .map((folder) => ({
        id: folder.id,
        kind: 'folder',
        name: folder.name,
        folder,
      }));

    const fileItems: DriveItem[] = [...fileRecords]
      .filter((file) => !file.is_trashed)
      .sort((a, b) => a.filename.localeCompare(b.filename, 'pl'))
      .map((file) => ({
        id: file.id,
        kind: 'file',
        name: file.filename,
        file,
      }));

    return [...folderItems, ...fileItems];
  }

  let items = $derived(mapDriveItems(folders, files));

  const filteredItems = $derived(
    searchQuery.trim().length === 0
      ? items
      : items.filter((item) => item.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
  );

  const uploadQueueText = $derived(
    uploadUiState.queueTotal > 0
      ? `Plik ${Math.min(uploadUiState.queueCompleted + 1, uploadUiState.queueTotal)} z ${uploadUiState.queueTotal}`
      : ''
  );

  function getErrorMessage(err: unknown) {
    if (err instanceof UnisourceError) {
      return `Błąd ${err.status}: ${err.body.message}`;
    }

    if (err instanceof UnisourceNetworkError) {
      return 'Błąd połączenia z API. Sprawdź internet lub konfigurację środowiska.';
    }

    if (err instanceof Error) {
      return err.message;
    }

    return 'Wystąpił nieoczekiwany błąd.';
  }

  async function buildBreadcrumb(segments: string[]) {
    if (segments.length === 0) {
      return [];
    }

    const parts: Array<{ name: string; href: string }> = [];
    const hrefSegments: string[] = [];

    for (const segment of segments) {
      hrefSegments.push(encodeURIComponent(segment));

      let label = segment;
      try {
        const folder = await getFolderById(segment);
        label = folder.name;
      } catch {
        label = segment;
      }

      parts.push({
        name: label,
        href: `/drive/${hrefSegments.join('/')}`,
      });
    }

    return parts;
  }

  async function loadMoveCandidates() {
    try {
      const rootFolders = await apiClient.folders.list({ parent_id: null, limit: 100 });
      moveCandidates = rootFolders.items
        .filter((folder) => !folder.is_trashed && folder.id !== currentFolderId)
        .map((folder) => ({ id: folder.id, name: folder.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
    } catch {
      moveCandidates = [];
    }
  }

  async function loadData() {
    const cycle = ++loadCycle;
    isLoading = true;
    error = null;

    try {
      const [foldersPayload, filesPayload, breadcrumbs] = await Promise.all([
        apiClient.folders.list({ parent_id: currentFolderId, limit: 100 }),
        apiClient.myFiles.list({ folder_id: currentFolderId, limit: 100 }),
        buildBreadcrumb(pathSegments),
      ]);

      if (cycle !== loadCycle) {
        return;
      }

      folders = foldersPayload.items;
      files = filesPayload.items;
      breadcrumbParts = breadcrumbs;

      await loadMoveCandidates();
    } catch (err) {
      if (cycle !== loadCycle) {
        return;
      }

      error = getErrorMessage(err);
    } finally {
      if (cycle === loadCycle) {
        isLoading = false;
      }
    }
  }

  function scheduleUploadToastReset() {
    if (uploadToastTimer) {
      window.clearTimeout(uploadToastTimer);
    }

    uploadToastTimer = window.setTimeout(() => {
      uploadUiState.reset();
      uploadToastTimer = null;
    }, 2600);
  }

  function scheduleOperationBannerClear() {
    if (operationBannerTimer) {
      window.clearTimeout(operationBannerTimer);
    }

    operationBannerTimer = window.setTimeout(() => {
      operationMessage = null;
      operationError = null;
      operationBannerTimer = null;
    }, 4200);
  }

  function setOperationMessage(message: string) {
    operationError = null;
    operationMessage = message;
    scheduleOperationBannerClear();
  }

  function setOperationError(message: string) {
    operationMessage = null;
    operationError = message;
    scheduleOperationBannerClear();
  }

  function setViewMode(nextMode: 'grid' | 'list') {
    viewMode = nextMode;
    const key = `drive:view:${currentFolderId || 'root'}`;
    localStorage.setItem(key, nextMode);
  }

  function getRedirectTarget() {
    return `${window.location.pathname}${window.location.search}`;
  }

  onMount(() => {
    let cancelled = false;

    (async () => {
      const currentUser = await authState.checkSession();
      if (cancelled) {
        return;
      }

      if (!currentUser) {
        const redirectTarget = getRedirectTarget();
        window.location.replace(`/login?redirect=${encodeURIComponent(redirectTarget)}`);
        return;
      }

      sessionReady = true;

      const key = `drive:view:${currentFolderId || 'root'}`;
      const saved = localStorage.getItem(key);
      if (saved === 'grid' || saved === 'list') {
        viewMode = saved;
      }

      await loadData();
    })();

    return () => {
      cancelled = true;

      if (uploadToastTimer) {
        window.clearTimeout(uploadToastTimer);
      }

      if (operationBannerTimer) {
        window.clearTimeout(operationBannerTimer);
      }
    };
  });

  function navigateToFolder(folderId: string) {
    const next = [...pathSegments, folderId].map((segment) => encodeURIComponent(segment)).join('/');
    window.location.href = `/drive/${next}`;
  }

  function handleSelect(item: DriveItem) {
    if (isFolderItem(item)) {
      navigateToFolder(item.folder.id);
    }
  }

  function handleContextMenu(item: DriveItem, e: MouseEvent) {
    contextMenuConfig = { x: e.clientX, y: e.clientY, item };
  }

  async function handleMenuAction(action: 'download' | 'rename' | 'move' | 'delete' | 'share', item: DriveItem) {
    operationError = null;
    operationMessage = null;

    try {
      if (action === 'download') {
        if (!isFileItem(item)) {
          return;
        }

        await downloadFileById(item.file.id, item.name);
        setOperationMessage(`Rozpoczęto pobieranie: ${item.name}`);
        return;
      }

      if (action === 'rename') {
        renameTarget = item;
        return;
      }

      if (action === 'move') {
        if (!isFileItem(item)) {
          return;
        }
        moveTarget = item;
        return;
      }

      if (action === 'share') {
        shareTarget = item;
        contextMenuConfig = null;
        return;
      }

      if (isFolderItem(item)) {
        await apiClient.folders.delete(item.folder.id);
      } else {
        await apiClient.myFiles.delete(item.file.id);
      }

      await loadData();
      setOperationMessage(`Usunięto: ${item.name}`);
    } catch (err) {
      setOperationError(getErrorMessage(err));
    }
  }

  async function handleCreateFolder(name: string) {
    await apiClient.folders.create({
      name,
      parent_id: currentFolderId ?? undefined,
    });

    await loadData();
    setOperationMessage(`Utworzono folder: ${name}`);
  }

  async function handleRename(name: string) {
    if (!renameTarget) {
      return;
    }

    if (isFolderItem(renameTarget)) {
      const { folder } = await apiClient.folders.update(renameTarget.folder.id, { name });
      folders = folders.map((f) => (f.id === folder.id ? folder : f));
      setOperationMessage(`Zmieniono nazwę folderu na: ${name}`);
    } else {
      const { file } = await apiClient.myFiles.update(renameTarget.file.id, { filename: name });
      files = files.map((f) => (f.id === file.id ? file : f));
      setOperationMessage(`Zmieniono nazwę pliku na: ${name}`);
    }
  }

  async function handleMove(folderId: string | null) {
    if (!moveTarget || !isFileItem(moveTarget)) {
      return;
    }

    await apiClient.myFiles.move(moveTarget.file.id, { folder_id: folderId });
    await loadData();
    setOperationMessage(`Przeniesiono: ${moveTarget.name}`);
  }

  async function handleUpload(filesToUpload: File[] | globalThis.FileList) {
    operationError = null;
    operationMessage = null;

    const uploaded = await uploadUiState.uploadFiles(filesToUpload, currentFolderId);
    if (uploaded > 0) {
      await loadData();
      setOperationMessage(uploaded > 1 ? `Wgrano ${uploaded} pliki.` : 'Wgrano 1 plik.');
    }

    if (uploadUiState.phase === 'success' || uploadUiState.phase === 'failed') {
      scheduleUploadToastReset();
    }
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    isDragging = true;
  }

  function onDragLeave() {
    isDragging = false;
  }

  async function onDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;

    const droppedFiles = e.dataTransfer?.files;
    if (!droppedFiles || droppedFiles.length === 0) {
      return;
    }

    await handleUpload(droppedFiles);
  }
</script>

<div 
  class="drive-root mx-auto w-full"
  role="region"
  aria-label="Obszar przeglądarki plików"
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
>
  {#if sessionReady}
    <DriveHeader
      {viewMode}
      bind:searchQuery
      pathParts={breadcrumbParts}
      onviewmodechange={setViewMode}
      oncreatefolder={() => (showCreateFolderDialog = true)}
      onpickfiles={(selectedFiles) => handleUpload(selectedFiles)}
    />

    {#if isDragging}
      <div class="drop-overlay" aria-hidden="true">
        <h2>
          Upuść pliki, aby rozpocząć upload
        </h2>
      </div>
    {/if}

    {#if contextMenuConfig}
      <ContextMenu 
        x={contextMenuConfig.x} 
        y={contextMenuConfig.y} 
        item={contextMenuConfig.item} 
        onclose={() => contextMenuConfig = null}
        onaction={handleMenuAction}
      />
    {/if}

    {#if showCreateFolderDialog}
      <CreateFolderDialog
        parentLabel={currentFolderId ? 'wybrany folder' : 'Mój dysk'}
        onclose={() => (showCreateFolderDialog = false)}
        onconfirm={handleCreateFolder}
      />
    {/if}

    {#if renameTarget}
      <RenameDialog
        itemName={renameTarget.name}
        itemLabel={isFolderItem(renameTarget) ? 'folder' : 'plik'}
        onclose={() => (renameTarget = null)}
        onconfirm={handleRename}
      />
    {/if}

    {#if moveTarget}
      <MoveDialog
        itemName={moveTarget.name}
        folders={moveCandidates}
        onclose={() => (moveTarget = null)}
        onconfirm={handleMove}
      />
    {/if}

    {#if shareTarget && shareTarget.kind === 'file'}
      <ShareLinksModal
        fileId={shareTarget.id}
        filename={shareTarget.name}
        onclose={() => { shareTarget = null; }}
      />
    {/if}

    <UploadProgress
      phase={uploadUiState.phase}
      progress={uploadUiState.progress}
      fileName={uploadUiState.fileName}
      queueText={uploadQueueText}
      message={uploadUiState.message}
      error={uploadUiState.error}
    />

    <div class="content-area">
      {#if operationError}
        <div class="banner banner-error" role="alert">{operationError}</div>
      {/if}

      {#if operationMessage}
        <div class="banner banner-success" role="status">{operationMessage}</div>
      {/if}

      {#if isLoading}
        <div class="state-wrap">
          <div class="spinner-wrap">
            <LoaderCircle size={40} style="color: var(--color-text-secondary);" />
          </div>
        </div>
      {:else if error}
        <div class="state-wrap">
          <div class="state-card error-card">
            <h2>Nie udało się pobrać danych</h2>
            <p>{error}</p>
          </div>
        </div>
      {:else if filteredItems.length === 0}
        <div class="state-wrap">
          <div class="state-card empty-card">
            <div class="state-icon">
              <FolderOpen size={34} strokeWidth={1.5} />
            </div>
            <h2>{searchQuery.trim() ? 'Brak wyników wyszukiwania' : 'Ten katalog jest pusty'}</h2>
            <p>
              {searchQuery.trim()
                ? 'Zmień frazę lub wyczyść filtr, aby zobaczyć wszystkie pliki.'
                : 'Przeciągnij pliki, aby rozpocząć pierwszy upload.'}
            </p>
          </div>
        </div>
      {:else}
        {#if viewMode === 'grid'}
          <FileGrid items={filteredItems} onselect={handleSelect} oncontextmenu={handleContextMenu} />
        {:else}
          <FileList items={filteredItems} onselect={handleSelect} oncontextmenu={handleContextMenu} />
        {/if}
      {/if}
    </div>
  {:else}
    <div class="state-wrap">
      <div class="spinner-wrap">
        <LoaderCircle size={40} style="color: var(--color-text-secondary);" />
      </div>
    </div>
  {/if}
</div>

<style>
  .drive-root {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    position: relative;
  }

  .drop-overlay {
    position: absolute;
    inset: var(--space-4);
    z-index: 45;
    border-radius: var(--radius-xl);
    border: 2px dashed color-mix(in oklab, var(--color-accent) 65%, transparent);
    background: color-mix(in oklab, var(--color-accent-muted) 90%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    pointer-events: none;
    animation: drop-enter var(--duration-fast) var(--ease-in-out);
  }

  .drop-overlay h2 {
    font-size: clamp(1.25rem, 2.2vw, 1.7rem);
    line-height: 1.2;
    letter-spacing: -0.02em;
    color: var(--color-text-primary);
  }

  .content-area {
    flex: 1;
    padding: var(--space-4) var(--shell-px) calc(84px + env(safe-area-inset-bottom));
    position: relative;
    min-height: 520px;
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
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .state-card {
    width: min(560px, calc(100% - 40px));
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border-subtle);
    padding: var(--space-6);
    background: color-mix(in oklab, var(--color-bg-surface) 82%, transparent);
    display: grid;
    gap: var(--space-2);
    justify-items: center;
  }

  .state-card h2 {
    font-size: var(--text-lg);
    line-height: var(--leading-lg);
    color: var(--color-text-primary);
    letter-spacing: -0.02em;
  }

  .state-card p {
    font-size: var(--text-sm);
    line-height: var(--leading-sm);
    color: var(--color-text-secondary);
  }

  .error-card {
    border-color: color-mix(in oklab, var(--color-danger) 28%, transparent);
    background: color-mix(in oklab, var(--color-danger) 9%, transparent);
  }

  .state-icon {
    width: 64px;
    height: 64px;
    border-radius: var(--radius-lg);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
    background: color-mix(in oklab, var(--color-bg-overlay) 85%, transparent);
  }

  .spinner-wrap {
    animation: spin 900ms linear infinite;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes drop-enter {
    from {
      opacity: 0;
      transform: scale(0.99);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @media (min-width: 768px) {
    .content-area {
      padding-top: var(--space-5);
      padding-bottom: var(--space-8);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .drop-overlay,
    .spinner-wrap {
      animation: none;
    }
  }
</style>
