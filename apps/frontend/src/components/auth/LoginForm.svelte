<script lang="ts">
  import { onMount } from 'svelte';
  import { authState } from '../../state/auth.svelte';
  import { LoaderCircle, ShieldCheck } from 'lucide-svelte';
  import Input from '../ui/Input.svelte';
  import Button from '../ui/Button.svelte';

  let email = $state('');
  let password = $state('');
  let isLoading = $state(false);
  let isCheckingSession = $state(true);
  let error = $state<string | null>(null);

  function getRedirectTarget() {
    const redirect = new URLSearchParams(window.location.search).get('redirect');

    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
      return redirect;
    }

    return '/drive';
  }

  onMount(() => {
    let cancelled = false;

    (async () => {
      const currentUser = await authState.checkSession();
      if (cancelled) {
        return;
      }

      if (currentUser) {
        window.location.replace(getRedirectTarget());
        return;
      }

      isCheckingSession = false;
    })();

    return () => {
      cancelled = true;
    };
  });

  async function handleLogin(e: Event) {
    e.preventDefault();

    if (isCheckingSession) {
      return;
    }

    if (!email.trim()) {
      error = 'Podaj adres e-mail.';
      return;
    }

    if (password.trim().length < 8) {
      error = 'Hasło musi mieć minimum 8 znaków.';
      return;
    }

    isLoading = true;
    error = null;
    try {
      await authState.login(email, password);
      window.location.href = getRedirectTarget();
    } catch (err: any) {
      error = err.message || 'Wystąpił nieznany błąd podczas logowania.';
    } finally {
      isLoading = false;
    }
  }
</script>

<form class="login-card glass" onsubmit={handleLogin}>
  {#if isCheckingSession}
    <div class="session-check" role="status" aria-live="polite">
      <div class="spin" aria-hidden="true">
        <LoaderCircle size={22} />
      </div>
      <p>Sprawdzanie aktywnej sesji...</p>
    </div>
  {:else}
    <div class="login-head">
      <span class="login-badge" aria-hidden="true">
        <ShieldCheck size={18} />
        Bezpieczne logowanie
      </span>
      <h1>Witaj ponownie</h1>
      <p>Zaloguj się, aby wrócić do swojego workspace i plików.</p>
    </div>

    {#if error}
      <div class="login-error" role="alert">
        {error}
      </div>
    {/if}

    <div class="fields">
      <Input 
        type="email" 
        placeholder="Adres e-mail" 
        name="email"
        autocomplete="email"
        required
        bind:value={email} 
        disabled={isLoading} 
      />
      <Input 
        type="password" 
        placeholder="Hasło" 
        name="password"
        autocomplete="current-password"
        minlength={8}
        required
        bind:value={password} 
        disabled={isLoading} 
      />
    </div>

    <Button type="submit" variant="primary" size="lg" {isLoading} class="w-full mt-1">
      Zaloguj się
    </Button>
  {/if}
</form>

<style>
  .login-card {
    width: min(460px, 100%);
    margin: 0 auto;
    border-radius: 28px;
    padding: clamp(24px, 5vw, 36px);
    border: 1px solid var(--color-glass-border);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    box-shadow:
      0 18px 54px color-mix(in oklab, #000 38%, transparent),
      inset 0 1px 0 color-mix(in oklab, var(--color-accent) 14%, transparent);
  }

  .session-check {
    min-height: 176px;
    display: grid;
    place-items: center;
    gap: var(--space-2);
    text-align: center;
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .spin {
    animation: spin 900ms linear infinite;
  }

  .login-head {
    display: grid;
    gap: var(--space-2);
  }

  .login-badge {
    width: fit-content;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: var(--radius-full);
    border: 1px solid var(--color-border-default);
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    line-height: var(--leading-xs);
  }

  .login-head h1 {
    font-size: clamp(30px, 6vw, var(--text-2xl));
    line-height: var(--leading-2xl);
    letter-spacing: -0.03em;
    color: var(--color-text-primary);
    font-weight: 600;
  }

  .login-head p {
    font-size: var(--text-sm);
    line-height: var(--leading-sm);
    color: var(--color-text-secondary);
  }

  .fields {
    display: grid;
    gap: var(--space-3);
  }

  .login-error {
    border-radius: var(--radius-md);
    border: 1px solid color-mix(in oklab, var(--color-danger) 24%, transparent);
    background: color-mix(in oklab, var(--color-danger) 14%, transparent);
    color: color-mix(in oklab, var(--color-danger) 85%, #fff);
    padding: 10px 12px;
    font-size: var(--text-sm);
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }

    to {
      transform: rotate(360deg);
    }
  }
</style>
