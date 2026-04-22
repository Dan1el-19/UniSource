<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    tone = 'neutral',
    className = '',
    children,
  } = $props<{
    tone?: 'neutral' | 'success' | 'danger' | 'accent';
    className?: string;
    children?: Snippet;
  }>();
</script>

<span class={`admin-badge admin-badge--${tone} ${className}`}>
  {@render children?.()}
</span>

<style>
  .admin-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--admin-space-1, 8px);
    min-height: 32px;
    padding: 0 var(--admin-space-2, 12px);
    border-radius: 999px;
    border: 1px solid color-mix(in oklab, var(--color-glass-border) 82%, transparent);
    background: color-mix(in oklab, var(--color-bg-overlay) 78%, transparent);
    color: var(--color-text-primary);
    font-size: var(--admin-text-meta-size, 12px);
    line-height: var(--admin-text-meta-line-height, 1.3);
    font-weight: 600;
    white-space: nowrap;
  }

  .admin-badge--success {
    background: color-mix(in oklab, var(--color-success) 16%, transparent);
    color: var(--color-success);
  }

  .admin-badge--danger {
    background: color-mix(in oklab, var(--color-danger) 16%, transparent);
    color: var(--color-danger);
  }

  .admin-badge--accent {
    background: color-mix(in oklab, var(--color-accent) 16%, transparent);
    color: var(--color-text-primary);
  }
</style>
