<script lang="ts">
  import Button from '../ui/Button.svelte';

  type FolderTarget = {
    id: string;
    name: string;
  };

  let {
    itemName,
    folders = [],
    onclose,
    onconfirm,
  } = $props<{
    itemName: string;
    folders: FolderTarget[];
    onclose: () => void;
    onconfirm: (folderId: string | null) => Promise<void> | void;
  }>();

  const ROOT_VALUE = '__root__';
  let selectedFolderId = $state<string>(ROOT_VALUE);
  let isSaving = $state(false);
  let error = $state<string | null>(null);

  async function handleMove(event: Event) {
    event.preventDefault();
    isSaving = true;
    error = null;

    try {
      await onconfirm(selectedFolderId === ROOT_VALUE ? null : selectedFolderId);
      onclose();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Nie udało się przenieść pliku.';
    } finally {
      isSaving = false;
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onclose();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="dialog-backdrop" role="presentation" onclick={onclose}></div>

<div class="dialog glass" role="dialog" aria-modal="true" aria-label="Przenieś plik">
  <header>
    <h2>Przenieś plik</h2>
    <p>Wybierz docelowy folder dla: {itemName}</p>
  </header>

  <form onsubmit={handleMove}>
    <div class="target-list" role="radiogroup" aria-label="Folder docelowy">
      <label class="target-row">
        <input type="radio" bind:group={selectedFolderId} value={ROOT_VALUE} />
        <span>Główny katalog (root)</span>
      </label>

      {#each folders as folder (folder.id)}
        <label class="target-row">
          <input type="radio" bind:group={selectedFolderId} value={folder.id} />
          <span>{folder.name}</span>
        </label>
      {/each}
    </div>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    <div class="actions">
      <Button type="button" variant="ghost" onclick={onclose} disabled={isSaving}>Anuluj</Button>
      <Button type="submit" variant="primary" isLoading={isSaving}>Przenieś</Button>
    </div>
  </form>
</div>

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    background: color-mix(in oklab, #000 52%, transparent);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  .dialog {
    position: fixed;
    z-index: 71;
    width: min(540px, calc(100% - 32px));
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    border-radius: var(--radius-lg);
    border-color: var(--color-glass-border);
    padding: var(--space-5);
    display: grid;
    gap: var(--space-4);
    max-height: min(82dvh, 700px);
    overflow: auto;
    animation: enter var(--duration-enter) var(--ease-spring);
  }

  header {
    display: grid;
    gap: 6px;
  }

  h2 {
    font-size: var(--text-lg);
    line-height: var(--leading-lg);
    color: var(--color-text-primary);
    letter-spacing: -0.02em;
  }

  p {
    font-size: var(--text-sm);
    line-height: var(--leading-sm);
    color: var(--color-text-secondary);
  }

  form {
    display: grid;
    gap: var(--space-3);
  }

  .target-list {
    display: grid;
    gap: var(--space-2);
  }

  .target-row {
    min-height: 42px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-subtle);
    background: color-mix(in oklab, var(--color-bg-elevated) 82%, transparent);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 0 var(--space-3);
    color: var(--color-text-primary);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .target-row input {
    accent-color: var(--color-accent);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .error {
    color: var(--color-danger);
    font-size: var(--text-sm);
  }

  @keyframes enter {
    from {
      opacity: 0;
      transform: translate(-50%, calc(-50% + 8px)) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dialog {
      animation: none;
    }
  }
</style>
