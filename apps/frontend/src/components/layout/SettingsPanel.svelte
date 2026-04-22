<script lang="ts">
  import { env as publicEnv } from '$env/dynamic/public';
  import { onMount } from 'svelte';
  import Button from '../ui/Button.svelte';
  import { authState } from '../../state/auth.svelte';
  import { getStorageProvider, setStorageProvider, type StorageProvider } from '../../state/upload.svelte';

  const apiUrl = publicEnv.PUBLIC_API_URL || 'http://localhost:8787';
  const serviceId = publicEnv.PUBLIC_SERVICE_ID || 'default';

  let theme = $state<'dark' | 'light'>('dark');
  let storageProvider = $state<StorageProvider>('r2');
  let isBusy = $state(false);

  onMount(() => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    theme = currentTheme === 'light' ? 'light' : 'dark';
    storageProvider = getStorageProvider();
  });

  function setTheme(nextTheme: 'dark' | 'light') {
    theme = nextTheme;
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('theme', nextTheme);
  }

  function handleSetProvider(provider: StorageProvider) {
    storageProvider = provider;
    setStorageProvider(provider);
  }

  async function handleLogout() {
    isBusy = true;
    try {
      await authState.logout();
    } finally {
      isBusy = false;
    }
  }
</script>

<section class="settings-wrap mx-auto w-full max-w-2xl xl:max-w-3xl">
  <header class="settings-head">
    <h1>Ustawienia</h1>
    <p>Preferencje interfejsu i sesji użytkownika.</p>
  </header>

  <article class="card glass">
    <h2>Motyw</h2>
    <p>Domyślnie aplikacja działa w trybie dark-first.</p>

    <div class="theme-actions">
      <Button variant={theme === 'dark' ? 'primary' : 'secondary'} onclick={() => setTheme('dark')}>Dark</Button>
      <Button variant={theme === 'light' ? 'primary' : 'secondary'} onclick={() => setTheme('light')}>Light</Button>
    </div>
  </article>

  <article class="card glass">
    <h2>Dostawca przechowywania</h2>
    <p>Wybierz, gdzie będą przesyłane nowe pliki. Ustawienie jest zapamiętywane w przeglądarce.</p>

    <div class="theme-actions">
      <Button variant={storageProvider === 'r2' ? 'primary' : 'secondary'} onclick={() => handleSetProvider('r2')}>Cloudflare R2</Button>
      <Button variant={storageProvider === 'appwrite' ? 'primary' : 'secondary'} onclick={() => handleSetProvider('appwrite')}>Appwrite Storage</Button>
    </div>
  </article>

  <article class="card glass">
    <h2>Konfiguracja połączenia</h2>
    <dl>
      <div>
        <dt>API URL</dt>
        <dd>{apiUrl}</dd>
      </div>
      <div>
        <dt>Service ID</dt>
        <dd>{serviceId}</dd>
      </div>
    </dl>
  </article>

  <article class="card glass">
    <h2>Sesja</h2>
    <p>Wylogowanie usuwa bieżącą sesję Appwrite i wraca na ekran logowania.</p>
    <Button variant="danger" onclick={handleLogout} isLoading={isBusy}>Wyloguj</Button>
  </article>
</section>

<style>
  .settings-wrap {
    width: 100%;
    margin: 0 auto;
    padding: var(--space-4) var(--shell-px) calc(84px + env(safe-area-inset-bottom));
    display: grid;
    gap: var(--space-4);
  }

  .settings-head {
    display: grid;
    gap: 6px;
  }

  .settings-head h1 {
    font-size: clamp(1.8rem, 2.4vw, 2.2rem);
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: var(--color-text-primary);
  }

  .settings-head p {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .card {
    border-radius: var(--radius-lg);
    border-color: var(--color-glass-border);
    padding: var(--space-5);
    display: grid;
    gap: var(--space-3);
  }

  .card h2 {
    font-size: var(--text-md);
    line-height: var(--leading-md);
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .card p {
    font-size: var(--text-sm);
    line-height: var(--leading-sm);
    color: var(--color-text-secondary);
  }

  .theme-actions {
    display: inline-flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  dl {
    display: grid;
    gap: var(--space-3);
  }

  dl > div {
    display: grid;
    gap: 4px;
  }

  dt {
    font-size: var(--text-xs);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-text-tertiary);
  }

  dd {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--color-text-primary);
    word-break: break-all;
    background: color-mix(in oklab, var(--color-bg-overlay) 80%, transparent);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    padding: 6px 10px;
  }

  @media (min-width: 768px) {
    .settings-wrap {
      padding-top: var(--space-6);
      padding-bottom: var(--space-8);
    }

    .card {
      padding: var(--space-6);
    }
  }
</style>
