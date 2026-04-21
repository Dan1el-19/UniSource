<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '../ui/Button.svelte';
  import { authState } from '../../state/auth.svelte';

  let { autoRedirectAuthenticated = true } = $props<{ autoRedirectAuthenticated?: boolean }>();

  let isChecking = $state(true);
  let isAuthenticated = $state(false);

  const href = $derived(isAuthenticated ? '/drive' : '/login');
  const label = $derived(isAuthenticated ? 'Przejdź do dysku' : 'Zaloguj się');

  onMount(() => {
    let cancelled = false;

    (async () => {
      const currentUser = await authState.checkSession();
      if (cancelled) {
        return;
      }

      isAuthenticated = currentUser !== null;
      isChecking = false;

      if (isAuthenticated && autoRedirectAuthenticated) {
        window.location.replace('/drive');
      }
    })();

    return () => {
      cancelled = true;
    };
  });
</script>

<div class="cta-root">
  <a class="cta-link" href={href} aria-label={label}>
    <Button size="lg" variant="primary">
      {label}
    </Button>
  </a>

  <p class="cta-meta" aria-live="polite">
    {#if isChecking}
      Sprawdzanie sesji...
    {:else if isAuthenticated}
      Aktywna sesja wykryta.
    {:else}
      Po zalogowaniu od razu przejdziesz do panelu.
    {/if}
  </p>
</div>

<style>
  .cta-root {
    display: grid;
    justify-items: center;
    gap: var(--space-3);
  }

  .cta-link {
    display: inline-flex;
  }

  .cta-meta {
    font-size: var(--text-xs);
    line-height: var(--leading-xs);
    color: var(--color-text-tertiary);
    text-align: center;
  }
</style>