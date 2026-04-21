<script lang="ts">
  import { Lock, Download, FileText, AlertTriangle, Eye, EyeOff } from 'lucide-svelte';
  import { unlockPublicFile } from '$lib/api';

  let { data } = $props<{ data: {
    slug: string;
    status: number;
    error: string | null;
    data: Record<string, unknown> | null;
  }}>();

  let fileInfo = $state(data.data);
  let passwordInput = $state('');
  let showPassword = $state(false);
  let isUnlocking = $state(false);
  let unlockError = $state<string | null>(null);
  let isDownloading = $state(false);

  const isGone = $derived(data.status === 410);
  const isError = $derived(!fileInfo && !!data.error);
  const requiresPassword = $derived(fileInfo?.requires_password === true);
  const hasAccess = $derived(fileInfo?.requires_password === false);

  function formatBytes(bytes: number) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  async function handleUnlock() {
    if (!passwordInput.trim()) return;
    isUnlocking = true;
    unlockError = null;
    try {
      const result = await unlockPublicFile(data.slug, passwordInput) as any;
      if (result.requires_password === false) {
        fileInfo = result;
        passwordInput = '';
      } else {
        unlockError = result.message ?? 'Nieprawidłowe hasło';
      }
    } catch {
      unlockError = 'Błąd sieci. Spróbuj ponownie.';
    } finally {
      isUnlocking = false;
    }
  }

  async function handleDownload() {
    if (!fileInfo?.download_url) return;
    isDownloading = true;
    try {
      const anchor = document.createElement('a');
      anchor.href = fileInfo.download_url as string;
      anchor.download = fileInfo.filename as string;
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      setTimeout(() => { isDownloading = false; }, 1500);
    }
  }
</script>

<svelte:head>
  <title>{fileInfo?.filename ? `${fileInfo.filename} — UniSource` : 'UniSource Share'}</title>
</svelte:head>

<div class="public-wrap">
  <div class="public-card glass">
    {#if isError || isGone}
      <div class="state-icon warn"><AlertTriangle size={36} /></div>
      <h1 class="card-title">{isGone ? 'Link wygasł' : 'Nie znaleziono'}</h1>
      <p class="card-sub">{data.error ?? 'Ten link nie istnieje lub został dezaktywowany.'}</p>

    {:else if requiresPassword}
      <div class="state-icon lock"><Lock size={36} /></div>
      <h1 class="card-title">{fileInfo?.filename as string}</h1>
      {#if fileInfo?.link_name}
        <p class="link-name">„{fileInfo.link_name}"</p>
      {/if}
      <p class="card-sub">{formatBytes(fileInfo?.size as number)} · chronione hasłem</p>

      <form class="password-form" onsubmit={(e) => { e.preventDefault(); handleUnlock(); }}>
        <div class="input-wrap">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Wpisz hasło"
            bind:value={passwordInput}
            class="password-input {unlockError ? 'is-error' : ''}"
            autocomplete="current-password"
          />
          <button
            type="button"
            class="show-toggle"
            onclick={() => { showPassword = !showPassword; }}
            aria-label={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
          >
            {#if showPassword}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
          </button>
        </div>
        {#if unlockError}
          <p class="error-msg" role="alert">{unlockError}</p>
        {/if}
        <button type="submit" class="btn-primary" disabled={isUnlocking || !passwordInput.trim()}>
          {isUnlocking ? 'Sprawdzam…' : 'Odblokuj'}
        </button>
      </form>

    {:else if hasAccess}
      <div class="state-icon file"><FileText size={36} /></div>
      <h1 class="card-title">{fileInfo?.filename as string}</h1>
      {#if fileInfo?.link_name}
        <p class="link-name">„{fileInfo.link_name}"</p>
      {/if}
      <p class="card-sub">{formatBytes(fileInfo?.size as number)}</p>

      <button class="btn-primary" onclick={handleDownload} disabled={isDownloading}>
        <Download size={18} />
        {isDownloading ? 'Pobieranie…' : 'Pobierz plik'}
      </button>
    {/if}

    <p class="powered">Udostępniono przez <strong>UniSource</strong></p>
  </div>
</div>

<style>
  :global(body) { margin: 0; }

  .public-wrap {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
    background: var(--color-bg-base);
  }

  .public-card {
    width: min(460px, 100%);
    border-radius: var(--radius-xl);
    border-color: var(--color-glass-border);
    padding: var(--space-8) var(--space-6);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    text-align: center;
    box-shadow: 0 40px 80px color-mix(in oklab, #000 40%, transparent);
  }

  .state-icon {
    width: 72px;
    height: 72px;
    border-radius: var(--radius-xl);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--space-2);
  }

  .state-icon.file { background: color-mix(in oklab, var(--color-info) 14%, transparent); color: var(--color-info); }
  .state-icon.lock { background: color-mix(in oklab, var(--color-warning) 14%, transparent); color: var(--color-warning); }
  .state-icon.warn { background: color-mix(in oklab, var(--color-danger) 14%, transparent); color: var(--color-danger); }

  .card-title {
    font-size: var(--text-lg);
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--color-text-primary);
    word-break: break-word;
  }

  .link-name {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    font-style: italic;
    margin-top: calc(-1 * var(--space-2));
  }

  .card-sub { font-size: var(--text-sm); color: var(--color-text-secondary); }

  .password-form {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .input-wrap { position: relative; }

  .password-input {
    width: 100%;
    height: 44px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-default);
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
    font-size: var(--text-sm);
    padding: 0 44px 0 var(--space-3);
    outline: none;
    box-sizing: border-box;
    transition: border-color var(--duration-fast) var(--ease-in-out),
                box-shadow var(--duration-fast) var(--ease-in-out);
  }

  .password-input:focus {
    border-color: var(--color-border-strong);
    box-shadow: 0 0 0 3px var(--color-accent-muted);
  }

  .password-input.is-error {
    border-color: color-mix(in oklab, var(--color-danger) 60%, transparent);
  }

  .show-toggle {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-secondary);
    background: transparent;
    border: none;
    display: flex;
    align-items: center;
    padding: 4px;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .show-toggle:hover { color: var(--color-text-primary); }

  .error-msg { font-size: var(--text-xs); color: var(--color-danger); text-align: left; }

  .btn-primary {
    margin-top: var(--space-2);
    width: 100%;
    height: 48px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-default);
    background: var(--color-accent);
    color: var(--color-text-on-accent);
    font-size: var(--text-sm);
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    cursor: pointer;
    transition: opacity var(--duration-fast) var(--ease-in-out),
                transform var(--duration-instant) var(--ease-spring);
  }

  .btn-primary:hover:not(:disabled) { opacity: 0.88; }
  .btn-primary:active:not(:disabled) { transform: scale(0.98); }
  .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

  .powered {
    margin-top: var(--space-4);
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }

  .powered strong { color: var(--color-text-secondary); font-weight: 500; }

  @media (prefers-reduced-motion: reduce) {
    .btn-primary { transition-duration: 0.01ms; }
  }
</style>
