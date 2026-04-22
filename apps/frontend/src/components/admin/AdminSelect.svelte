<script lang="ts">
  import type { HTMLSelectAttributes } from 'svelte/elements';

  let {
    value = $bindable(''),
    disabled = false,
    className = '',
    children,
    ...restProps
  } = $props<{
    value?: string;
    disabled?: boolean;
    className?: string;
    children?: import('svelte').Snippet;
  } & Omit<HTMLSelectAttributes, 'value' | 'disabled' | 'class'>>();
</script>

<div class={`admin-select ${className}`}>
  <select
    bind:value
    {disabled}
    {...restProps}
    class="admin-select__field"
  >
    {@render children?.()}
  </select>
  <span class="admin-select__arrow" aria-hidden="true">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 4L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </span>
</div>

<style>
  .admin-select {
    position: relative;
    display: flex;
    width: 100%;
  }

  .admin-select__field {
    width: 100%;
    min-height: 48px;
    padding: 0 40px 0 var(--admin-space-3, 16px);
    border-radius: var(--admin-radius-md, 16px);
    border: 1px solid color-mix(in oklab, var(--color-glass-border) 88%, transparent);
    background: color-mix(in oklab, var(--color-bg-overlay) 74%, transparent);
    color: var(--color-text-primary);
    font-size: var(--admin-text-body-size, 14px);
    line-height: var(--admin-text-body-line-height, 1.4);
    outline: none;
    appearance: none;
    cursor: pointer;
    transition:
      border-color 160ms ease,
      background-color 160ms ease,
      box-shadow 160ms ease;
  }

  .admin-select__field:hover:not(:disabled),
  .admin-select__field:focus-visible {
    border-color: color-mix(in oklab, var(--color-accent) 36%, var(--color-glass-border));
  }

  .admin-select__field:focus-visible {
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-accent) 20%, transparent);
  }

  .admin-select__field:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .admin-select__arrow {
    position: absolute;
    inset: 0 var(--admin-space-3, 16px) 0 auto;
    display: inline-flex;
    align-items: center;
    color: var(--color-text-secondary);
    pointer-events: none;
  }
</style>
