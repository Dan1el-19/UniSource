<script lang="ts">
  import Button from '../ui/Button.svelte';
  import Input from '../ui/Input.svelte';

  let {
    parentLabel = 'ten katalog',
    onclose,
    onconfirm,
  } = $props<{
    parentLabel?: string;
    onclose: () => void;
    onconfirm: (name: string) => Promise<void> | void;
  }>();

  let folderName = $state('');
  let isSaving = $state(false);
  let error = $state<string | null>(null);

  async function handleCreate(event: Event) {
    event.preventDefault();
    const trimmed = folderName.trim();

    if (!trimmed) {
      error = 'Podaj nazwę folderu.';
      return;
    }

    isSaving = true;
    error = null;

    try {
      await onconfirm(trimmed);
      onclose();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Nie udało się utworzyć folderu.';
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

<div class="dialog glass" role="dialog" aria-modal="true" aria-label="Tworzenie folderu">
  <header>
    <h2>Nowy folder</h2>
    <p>Folder zostanie utworzony w lokalizacji: {parentLabel}</p>
  </header>

  <form onsubmit={handleCreate}>
    <Input
      bind:value={folderName}
      placeholder="Nazwa folderu"
      maxlength={120}
      required
      autofocus
      disabled={isSaving}
    />

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    <div class="actions">
      <Button type="button" variant="ghost" onclick={onclose} disabled={isSaving}>Anuluj</Button>
      <Button type="submit" variant="primary" isLoading={isSaving}>Utwórz</Button>
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
    width: min(480px, calc(100% - 32px));
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    border-radius: var(--radius-lg);
    border-color: var(--color-glass-border);
    padding: var(--space-5);
    display: grid;
    gap: var(--space-4);
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
