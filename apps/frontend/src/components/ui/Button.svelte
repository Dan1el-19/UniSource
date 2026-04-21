<script lang="ts">
  import type { Snippet } from 'svelte';
  import { LoaderCircle } from 'lucide-svelte';

  let { 
    type = 'button',
    variant = 'primary', 
    size = 'md', 
    isLoading = false,
    disabled = false,
    class: className = '',
    children, 
    onclick
  } = $props<{
    type?: 'button' | 'submit' | 'reset';
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
    disabled?: boolean;
    class?: string;
    children?: Snippet;
    onclick?: (e: MouseEvent) => void;
  }>();

  const sizeMap = {
    sm: 'btn-sm',
    md: 'btn-md',
    lg: 'btn-lg'
  } as const;

  const variantMap = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger',
    ghost: 'btn-ghost'
  } as const;

  const computedSize = $derived(sizeMap[size as keyof typeof sizeMap]);
  const computedVariant = $derived(variantMap[variant as keyof typeof variantMap]);
</script>

<button 
  {type}
  class="btn-base {computedSize} {computedVariant} {className}"
  disabled={disabled || isLoading}
  {onclick}
>
  <div class="flex items-center gap-2 transition-opacity {isLoading ? 'opacity-0' : 'opacity-100'}">
    {@render children?.()}
  </div>
  {#if isLoading}
    <div class="absolute inset-0 flex items-center justify-center">
      <LoaderCircle class="animate-spin" size={size === 'sm' ? 16 : 20} />
    </div>
  {/if}
</button>

<style>
  .btn-base {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    font-weight: 500;
    letter-spacing: 0.01em;
    transition:
      transform var(--duration-instant) var(--ease-in-out),
      background-color var(--duration-fast) var(--ease-in-out),
      border-color var(--duration-fast) var(--ease-in-out),
      color var(--duration-fast) var(--ease-in-out),
      box-shadow var(--duration-fast) var(--ease-in-out),
      opacity var(--duration-fast) var(--ease-in-out);
    will-change: transform;
  }

  .btn-base:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .btn-base:active:not(:disabled) {
    transform: scale(0.97);
    transition-duration: var(--duration-fast);
    transition-timing-function: var(--ease-spring);
  }

  .btn-base:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .btn-base:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }

  .btn-sm {
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    line-height: var(--leading-sm);
  }

  .btn-md {
    padding: 10px 16px;
    border-radius: var(--radius-md);
    font-size: var(--text-base);
    line-height: var(--leading-base);
  }

  .btn-lg {
    padding: 12px 24px;
    border-radius: var(--radius-lg);
    font-size: var(--text-base);
    line-height: var(--leading-base);
  }

  .btn-primary {
    background: var(--color-accent);
    color: var(--color-text-on-accent);
    border-color: color-mix(in oklab, var(--color-accent) 78%, var(--color-bg-base));
    box-shadow: 0 8px 24px color-mix(in oklab, var(--color-accent) 14%, transparent);
  }

  .btn-primary:hover:not(:disabled) {
    filter: brightness(1.04);
  }

  .btn-secondary {
    background: color-mix(in oklab, var(--color-bg-surface) 68%, transparent);
    color: var(--color-text-primary);
    border-color: var(--color-border-default);
    backdrop-filter: blur(calc(var(--color-glass-blur) * 0.5)) saturate(160%);
    -webkit-backdrop-filter: blur(calc(var(--color-glass-blur) * 0.5)) saturate(160%);
  }

  .btn-secondary:hover:not(:disabled) {
    background: color-mix(in oklab, var(--color-bg-elevated) 74%, transparent);
  }

  .btn-danger {
    background: color-mix(in oklab, var(--color-danger) 90%, transparent);
    color: #fff;
    border-color: color-mix(in oklab, var(--color-danger) 55%, #000);
  }

  .btn-danger:hover:not(:disabled) {
    filter: brightness(1.05);
  }

  .btn-ghost {
    background: transparent;
    color: var(--color-text-secondary);
    border-color: transparent;
  }

  .btn-ghost:hover:not(:disabled) {
    background: var(--color-accent-muted);
    color: var(--color-text-primary);
  }

  @media (prefers-reduced-motion: reduce) {
    .btn-base {
      transition-duration: 0.01ms;
    }

    .btn-base:hover:not(:disabled),
    .btn-base:active:not(:disabled) {
      transform: none;
    }
  }
</style>
