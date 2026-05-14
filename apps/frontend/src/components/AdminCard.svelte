<script lang="ts">
  let { title, children }: { title: string; children: import('svelte').Snippet } = $props();
</script>

<div class="card">
  <div class="card-header">{title}</div>
  <div class="card-body">
    {@render children()}
  </div>
</div>

<style>
  .card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  .card-header {
    padding: 12px 18px;
    font-size: 11.5px;
    font-weight: 700;
    color: var(--color-muted);
    border-bottom: 1px solid var(--color-border);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .card-body {
    padding: 18px;
  }
</style>
