<script lang="ts">
  import type { Snippet } from 'svelte';
  import { LoaderCircle } from 'lucide-svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  let {
    type = 'button',
    variant = 'secondary',
    size = 'md',
    iconOnly = false,
    isLoading = false,
    disabled = false,
    className = '',
    onclick,
    children,
    ...restProps
  } = $props<{
    type?: 'button' | 'submit' | 'reset';
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
    iconOnly?: boolean;
    isLoading?: boolean;
    disabled?: boolean;
    className?: string;
    onclick?: (event: MouseEvent) => void;
    children?: Snippet;
  } & Omit<HTMLButtonAttributes, 'type' | 'disabled' | 'class' | 'onclick'>>();
</script>

<button
  {type}
  class={`admin-button admin-button--${variant} admin-button--${size} ${iconOnly ? 'admin-button--icon' : ''} ${className}`}
  disabled={disabled || isLoading}
  {onclick}
  {...restProps}
>
  <span class:admin-button__content-hidden={isLoading} class="admin-button__content">
    {@render children?.()}
  </span>

  {#if isLoading}
    <span class="admin-button__loader" aria-hidden="true">
      <LoaderCircle size={size === 'sm' ? 16 : 18} />
    </span>
  {/if}
</button>

<style>
  .admin-button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--admin-space-1, 8px);
    border-radius: var(--admin-radius-md, 16px);
    border: 1px solid transparent;
    padding: 0 var(--admin-space-3, 16px);
    font-size: var(--admin-text-body-size, 14px);
    line-height: var(--admin-text-body-line-height, 1.4);
    font-weight: 600;
    transition:
      background-color 160ms ease,
      border-color 160ms ease,
      color 160ms ease,
      opacity 160ms ease;
  }

  .admin-button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .admin-button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .admin-button--md {
    min-height: 48px;
  }

  .admin-button--sm {
    min-height: 40px;
    padding: 0 var(--admin-space-2, 12px);
  }

  .admin-button--icon {
    width: 40px;
    padding: 0;
  }

  .admin-button--primary {
    background: color-mix(in oklab, var(--color-accent) 88%, white 12%);
    border-color: color-mix(in oklab, var(--color-accent) 60%, transparent);
    color: var(--color-text-on-accent);
  }

  .admin-button--primary:hover:not(:disabled) {
    filter: brightness(1.04);
  }

  .admin-button--secondary {
    background: color-mix(in oklab, var(--color-bg-overlay) 76%, transparent);
    border-color: color-mix(in oklab, var(--color-glass-border) 86%, transparent);
    color: var(--color-text-primary);
  }

  .admin-button--secondary:hover:not(:disabled) {
    background: color-mix(in oklab, var(--color-bg-elevated) 82%, transparent);
  }

  .admin-button--ghost {
    background: transparent;
    border-color: transparent;
    color: var(--color-text-secondary);
  }

  .admin-button--ghost:hover:not(:disabled) {
    background: color-mix(in oklab, var(--color-bg-overlay) 60%, transparent);
    color: var(--color-text-primary);
  }

  .admin-button--danger {
    background: color-mix(in oklab, var(--color-danger) 84%, transparent);
    border-color: color-mix(in oklab, var(--color-danger) 52%, transparent);
    color: #fff;
  }

  .admin-button__content {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--admin-space-1, 8px);
  }

  .admin-button__content-hidden {
    opacity: 0;
  }

  .admin-button__loader {
    position: absolute;
    inset: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    animation: admin-button-spin 900ms linear infinite;
  }

  @keyframes admin-button-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .admin-button,
    .admin-button__loader {
      transition: none;
      animation: none;
    }
  }
</style>
