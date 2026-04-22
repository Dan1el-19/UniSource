<script lang="ts">
  let {
    value = 0,
    tone = 'accent',
    className = '',
  } = $props<{
    value?: number;
    tone?: 'accent' | 'success' | 'warning' | 'danger';
    className?: string;
  }>();

  const clamped = $derived(Math.max(0, Math.min(100, value)));
</script>

<div
  class={`admin-progress admin-progress--${tone} ${className}`}
  role="progressbar"
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow={clamped}
>
  <span class="admin-progress__fill" style={`width: ${clamped}%;`}></span>
</div>

<style>
  .admin-progress {
    width: 100%;
    height: var(--admin-space-1, 8px);
    border-radius: 999px;
    overflow: hidden;
    background: color-mix(in oklab, var(--color-bg-surface) 92%, transparent);
  }

  .admin-progress__fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--color-accent), color-mix(in oklab, var(--color-accent) 72%, white));
  }

  .admin-progress--success .admin-progress__fill {
    background: linear-gradient(90deg, var(--color-success), color-mix(in oklab, var(--color-success) 72%, white));
  }

  .admin-progress--warning .admin-progress__fill {
    background: linear-gradient(90deg, var(--color-warning), color-mix(in oklab, var(--color-warning) 72%, white));
  }

  .admin-progress--danger .admin-progress__fill {
    background: linear-gradient(90deg, var(--color-danger), color-mix(in oklab, var(--color-danger) 72%, white));
  }
</style>
