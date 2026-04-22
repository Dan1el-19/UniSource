<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    as = 'div',
    className = '',
    children,
  } = $props<{
    as?: string;
    className?: string;
    children?: Snippet;
  }>();
</script>

<svelte:element this={as} class={`admin-list-row ${className}`}>
  {@render children?.()}
</svelte:element>

<style>
  .admin-list-row {
    display: grid;
    align-items: center;
    gap: var(--admin-space-3, 16px);
    min-height: 72px;
    padding: var(--admin-space-2, 12px) var(--admin-space-3, 16px);
    border-radius: var(--admin-radius-md, 16px);
    border: 1px solid color-mix(in oklab, var(--color-glass-border) 80%, transparent);
    background: color-mix(in oklab, var(--color-bg-overlay) 62%, transparent);
  }
</style>
