<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label = '',
    title = '',
    description = '',
    className = '',
    contentClassName = '',
    footerClassName = '',
    action,
    footer,
    children,
  } = $props<{
    label?: string;
    title?: string;
    description?: string;
    className?: string;
    contentClassName?: string;
    footerClassName?: string;
    action?: Snippet;
    footer?: Snippet;
    children?: Snippet;
  }>();

  const hasHeader = $derived(Boolean(label || title || description || action));
</script>

<section class={`admin-card glass ${className}`}>
  {#if hasHeader}
    <header class="admin-card__header">
      <div class="admin-card__copy">
        {#if label}
          <span class="admin-card__label">{label}</span>
        {/if}

        {#if title}
          <h2 class="admin-card__title">{title}</h2>
        {/if}

        {#if description}
          <p class="admin-card__description">{description}</p>
        {/if}
      </div>

      {#if action}
        <div class="admin-card__action">
          {@render action()}
        </div>
      {/if}
    </header>
  {/if}

  <div class={`admin-card__content ${contentClassName}`}>
    {@render children?.()}
  </div>

  {#if footer}
    <footer class={`admin-card__footer ${footerClassName}`}>
      {@render footer()}
    </footer>
  {/if}
</section>

<style>
  .admin-card {
    display: grid;
    gap: var(--admin-space-4, 24px);
    padding: var(--admin-space-4, 24px);
    border-radius: var(--admin-radius-lg, 24px);
    border-color: color-mix(in oklab, var(--color-glass-border) 88%, transparent);
    background:
      linear-gradient(180deg, color-mix(in oklab, var(--color-bg-elevated) 74%, transparent), color-mix(in oklab, var(--color-bg-surface) 84%, transparent));
    backdrop-filter: blur(calc(var(--color-glass-blur) * 0.8)) saturate(138%);
    -webkit-backdrop-filter: blur(calc(var(--color-glass-blur) * 0.8)) saturate(138%);
    box-shadow:
      0 12px 32px rgba(0, 0, 0, 0.14),
      inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .admin-card__header,
  .admin-card__footer {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--admin-space-3, 16px);
  }

  .admin-card__copy {
    display: grid;
    gap: var(--admin-space-1, 8px);
  }

  .admin-card__label {
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

  .admin-card__title {
    color: var(--color-text-primary);
    font-size: var(--admin-text-section-size, 20px);
    line-height: var(--admin-text-section-line-height, 1.2);
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .admin-card__description {
    color: var(--color-text-secondary);
    font-size: var(--admin-text-body-size, 14px);
    line-height: var(--admin-text-body-line-height, 1.4);
  }

  .admin-card__content {
    display: grid;
    gap: var(--admin-space-4, 24px);
  }

  .admin-card__action,
  .admin-card__footer {
    flex-shrink: 0;
  }

  @media (max-width: 959px) {
    .admin-card__header,
    .admin-card__footer {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
