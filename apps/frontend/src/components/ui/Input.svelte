<script lang="ts">
  import { Search } from 'lucide-svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';

  let { 
    type = 'text', 
    placeholder = '', 
    value = $bindable(''), 
    disabled = false,
    icon = null,
    class: className = '',
    ...restProps
  } = $props<{
    type?: 'text' | 'password' | 'email' | 'search';
    placeholder?: string;
    value?: string;
    disabled?: boolean;
    icon?: 'search' | null;
    class?: string;
  } & Omit<HTMLInputAttributes, 'type' | 'placeholder' | 'value' | 'disabled' | 'class'>>();
</script>

<div class="input-wrap {icon === 'search' ? 'is-search' : ''} {className}">
  {#if icon === 'search'}
    <div class="search-icon" aria-hidden="true">
      <Search size={18} strokeWidth={2} />
    </div>
  {/if}

  <input 
    {type}
    {placeholder}
    bind:value
    {disabled}
    {...restProps}
    class="input-field"
  />
</div>

<style>
  .input-wrap {
    position: relative;
    display: flex;
    width: 100%;
  }

  .search-icon {
    position: absolute;
    left: 14px;
    top: 50%;
    z-index: 1;
    transform: translateY(-50%);
    color: var(--color-text-secondary);
    pointer-events: none;
  }

  .input-field {
    width: 100%;
    min-height: 44px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-default);
    background: color-mix(in oklab, var(--color-bg-elevated) 80%, transparent);
    color: var(--color-text-primary);
    font-size: var(--text-base);
    line-height: var(--leading-base);
    padding: 10px 14px;
    outline: none;
    transition:
      border-color var(--duration-fast) var(--ease-in-out),
      box-shadow var(--duration-fast) var(--ease-in-out),
      background-color var(--duration-fast) var(--ease-in-out);
  }

  .is-search .input-field {
    border-radius: var(--radius-full);
    padding-left: 40px;
    background: color-mix(in oklab, var(--color-bg-elevated) 72%, transparent);
  }

  .input-field::placeholder {
    color: var(--color-text-tertiary);
  }

  .input-field:hover:not(:disabled) {
    border-color: var(--color-border-strong);
  }

  .input-field:focus-visible {
    border-color: var(--color-border-strong);
    box-shadow: 0 0 0 3px var(--color-accent-muted);
  }

  .input-field:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }
</style>
