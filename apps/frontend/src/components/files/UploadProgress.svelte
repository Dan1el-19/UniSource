<script lang="ts">
  import { CheckCircle2, LoaderCircle, TriangleAlert } from 'lucide-svelte';

  let {
    phase = 'idle',
    progress = 0,
    fileName = '',
    queueText = '',
    message = null,
    error = null,
  } = $props<{
    phase: 'idle' | 'preparing' | 'uploading' | 'finalizing' | 'success' | 'failed';
    progress: number;
    fileName: string;
    queueText?: string;
    message?: string | null;
    error?: string | null;
  }>();

  const isVisible = $derived(phase !== 'idle' || !!message || !!error);
</script>

{#if isVisible}
  <aside class="upload-toast glass {phase === 'failed' ? 'is-failed' : ''}" aria-live="polite">
    <div class="icon-wrap">
      {#if phase === 'failed'}
        <TriangleAlert size={18} />
      {:else if phase === 'success'}
        <CheckCircle2 size={18} />
      {:else}
        <div class="spin">
          <LoaderCircle size={18} />
        </div>
      {/if}
    </div>

    <div class="content">
      <p class="title">
        {#if phase === 'preparing'}
          Rezerwuję upload
        {:else if phase === 'uploading'}
          Wgrywam plik
        {:else if phase === 'finalizing'}
          Finalizuję zapis
        {:else if phase === 'success'}
          Upload zakończony
        {:else if phase === 'failed'}
          Upload nieudany
        {:else}
          Status uploadu
        {/if}
      </p>

      <p class="subtitle">
        {#if error}
          {error}
        {:else if message}
          {message}
        {:else}
          {fileName}
        {/if}
      </p>

      {#if queueText}
        <p class="queue">{queueText}</p>
      {/if}

      <div class="bar" role="progressbar" aria-label="Postęp uploadu" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <div class="bar-fill" style="width: {Math.max(0, Math.min(progress, 100))}%"></div>
      </div>
    </div>
  </aside>
{/if}

<style>
  .upload-toast {
    position: fixed;
    right: var(--space-4);
    bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
    z-index: 65;
    width: min(420px, calc(100% - 32px));
    border-radius: var(--radius-lg);
    border-color: var(--color-glass-border);
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    gap: var(--space-3);
    padding: var(--space-3);
    box-shadow: 0 20px 46px color-mix(in oklab, #000 38%, transparent);
    animation: lift var(--duration-enter) var(--ease-spring);
  }

  .upload-toast.is-failed {
    border-color: color-mix(in oklab, var(--color-danger) 35%, transparent);
  }

  .icon-wrap {
    width: 34px;
    height: 34px;
    border-radius: var(--radius-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--color-accent);
    background: var(--color-accent-muted);
  }

  .is-failed .icon-wrap {
    color: var(--color-danger);
    background: color-mix(in oklab, var(--color-danger) 15%, transparent);
  }

  .content {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .title {
    font-size: var(--text-sm);
    line-height: var(--leading-sm);
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .subtitle {
    font-size: var(--text-sm);
    line-height: var(--leading-sm);
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .queue {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
    margin-top: 2px;
  }

  .bar {
    margin-top: 6px;
    width: 100%;
    height: 5px;
    border-radius: var(--radius-full);
    background: color-mix(in oklab, var(--color-bg-overlay) 85%, transparent);
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: inherit;
    background: var(--color-accent);
    transition: width var(--duration-fast) var(--ease-spring);
  }

  .is-failed .bar-fill {
    background: var(--color-danger);
  }

  .spin {
    animation: spin 900ms linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes lift {
    from {
      opacity: 0;
      transform: translateY(16px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .upload-toast,
    .bar-fill,
    .spin {
      animation: none;
      transition-duration: 0.01ms;
    }
  }
</style>
