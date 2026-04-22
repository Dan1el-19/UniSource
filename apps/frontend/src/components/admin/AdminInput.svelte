<script lang="ts">
  import { Search } from 'lucide-svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';

  let {
    type = 'text',
    placeholder = '',
    value = $bindable(''),
    disabled = false,
    icon = null,
    className = '',
    ...restProps
  } = $props<{
    type?: 'text' | 'password' | 'email' | 'search' | 'number';
    placeholder?: string;
    value?: string;
    disabled?: boolean;
    icon?: 'search' | null;
    className?: string;
  } & Omit<HTMLInputAttributes, 'type' | 'placeholder' | 'value' | 'disabled' | 'class'>>();
</script>

<label class={`admin-input ${icon === 'search' ? 'admin-input--search' : ''} ${className}`}>
  {#if icon === 'search'}
    <span class="admin-input__icon" aria-hidden="true">
      <Search size={16} />
    </span>
  {/if}

  <input
    {type}
    {placeholder}
    bind:value
    {disabled}
    {...restProps}
    class="admin-input__field"
  />
</label>

<style>
  .admin-input {
    position: relative;
    display: flex;
    width: 100%;
  }

  .admin-input__icon {
    position: absolute;
    inset: 0 auto 0 var(--admin-space-2, 12px);
    display: inline-flex;
    align-items: center;
    color: var(--color-text-secondary);
    pointer-events: none;
  }

  .admin-input__field {
    width: 100%;
    min-height: 48px;
    padding: 0 var(--admin-space-3, 16px);
    border-radius: var(--admin-radius-md, 16px);
    border: 1px solid color-mix(in oklab, var(--color-glass-border) 88%, transparent);
    background: color-mix(in oklab, var(--color-bg-overlay) 74%, transparent);
    color: var(--color-text-primary);
    font-size: var(--admin-text-body-size, 14px);
    line-height: var(--admin-text-body-line-height, 1.4);
    outline: none;
    transition:
      border-color 160ms ease,
      background-color 160ms ease,
      box-shadow 160ms ease;
  }

  .admin-input--search .admin-input__field {
    padding-left: var(--admin-space-5, 32px);
  }

  .admin-input__field::placeholder {
    color: var(--color-text-tertiary);
  }

  .admin-input__field:hover:not(:disabled),
  .admin-input__field:focus-visible {
    border-color: color-mix(in oklab, var(--color-accent) 36%, var(--color-glass-border));
  }

  .admin-input__field:focus-visible {
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-accent) 20%, transparent);
  }

  .admin-input__field:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
</style>
