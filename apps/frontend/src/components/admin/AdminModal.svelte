<script lang="ts">
  import type { Snippet } from 'svelte';
  import { X } from 'lucide-svelte';
  import AdminButton from './AdminButton.svelte';

  let {
    label = '',
    title = '',
    description = '',
    onclose,
    footer,
    children,
  } = $props<{
    label?: string;
    title?: string;
    description?: string;
    onclose: () => void;
    footer?: Snippet;
    children?: Snippet;
  }>();
</script>

<div class="admin-modal__backdrop" role="presentation" onclick={onclose}></div>

<div class="admin-modal glass" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title">
  <header class="admin-modal__header">
    <div class="admin-modal__copy">
      {#if label}
        <span class="admin-modal__label">{label}</span>
      {/if}

      <h2 id="admin-modal-title" class="admin-modal__title">{title}</h2>

      {#if description}
        <p class="admin-modal__description">{description}</p>
      {/if}
    </div>

    <AdminButton variant="ghost" size="sm" iconOnly={true} onclick={onclose} className="admin-modal__close">
      <X size={16} />
    </AdminButton>
  </header>

  <div class="admin-modal__body">
    {@render children?.()}
  </div>

  {#if footer}
    <footer class="admin-modal__footer">
      {@render footer()}
    </footer>
  {/if}
</div>

<style>
  @keyframes admin-modal-enter-mobile {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes admin-modal-enter-desktop {
    from {
      opacity: 0;
      transform: translate(-50%, calc(-50% + 8px)) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  .admin-modal__backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: color-mix(in oklab, #000 44%, transparent);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  .admin-modal {
    position: fixed;
    inset: auto var(--admin-space-3, 16px) var(--admin-space-3, 16px);
    z-index: 81;
    display: grid;
    gap: var(--admin-space-4, 24px);
    width: auto;
    max-width: 560px;
    padding: var(--admin-space-4, 24px);
    border-radius: var(--admin-radius-lg, 24px);
    border-color: color-mix(in oklab, var(--color-glass-border) 88%, transparent);
    background:
      linear-gradient(180deg, color-mix(in oklab, var(--color-bg-elevated) 76%, transparent), color-mix(in oklab, var(--color-bg-surface) 84%, transparent));
    backdrop-filter: blur(calc(var(--color-glass-blur) * 0.8)) saturate(138%);
    -webkit-backdrop-filter: blur(calc(var(--color-glass-blur) * 0.8)) saturate(138%);
    box-shadow:
      0 12px 32px rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.04);
    animation: admin-modal-enter-mobile var(--duration-enter, 250ms) var(--ease-spring, cubic-bezier(0.33, 1, 0.68, 1)) both;
  }

  .admin-modal__header,
  .admin-modal__footer {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--admin-space-3, 16px);
  }

  .admin-modal__copy,
  .admin-modal__body {
    display: grid;
    gap: var(--admin-space-2, 12px);
  }

  .admin-modal__label {
    display: inline-flex;
    width: fit-content;
    padding: var(--admin-space-1, 8px) var(--admin-space-2, 12px);
    border-radius: 999px;
    border: 1px solid color-mix(in oklab, var(--color-glass-border) 70%, transparent);
    background: color-mix(in oklab, var(--color-bg-overlay) 80%, transparent);
    color: var(--color-text-secondary);
    font-size: var(--admin-text-meta-size, 12px);
    line-height: var(--admin-text-meta-line-height, 1.3);
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .admin-modal__title {
    color: var(--color-text-primary);
    font-size: var(--admin-text-section-size, 20px);
    line-height: var(--admin-text-section-line-height, 1.2);
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .admin-modal__description {
    color: var(--color-text-secondary);
    font-size: var(--admin-text-body-size, 14px);
    line-height: var(--admin-text-body-line-height, 1.4);
  }

  .admin-modal__footer {
    justify-content: flex-end;
  }

  @media (min-width: 960px) {
    .admin-modal {
      inset: 50% auto auto 50%;
      width: min(560px, calc(100% - 48px));
      transform: translate(-50%, -50%);
      animation-name: admin-modal-enter-desktop;
    }
  }

  @media (max-width: 959px) {
    .admin-modal__header,
    .admin-modal__footer {
      flex-direction: column;
      align-items: stretch;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .admin-modal {
      animation: none;
    }
  }
</style>
