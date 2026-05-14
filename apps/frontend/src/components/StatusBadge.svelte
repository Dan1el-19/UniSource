<script lang="ts">
  let { label, variant = 'default' }: { label: string; variant?: 'default' | 'danger' | 'success' | 'warning' } = $props();
</script>

<span class="badge badge-{variant}">{label}</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    font-size: 10.5px;
    padding: 3px 10px;
    border-radius: var(--radius-full);
    font-weight: 600;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }
  .badge-default {
    background: rgba(255,255,255,0.06);
    color: var(--color-muted);
  }
  .badge-danger {
    background: var(--color-danger-soft);
    color: var(--color-danger);
  }
  .badge-success {
    background: var(--color-success-soft);
    color: var(--color-success);
  }
  .badge-warning {
    background: var(--color-warning-soft);
    color: var(--color-warning);
  }
</style>
