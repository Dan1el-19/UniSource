<script lang="ts">
  let { used, max }: { used: number; max: number } = $props();
  const pct = $derived(max > 0 ? Math.min(100, (used / max) * 100) : 0);
  const color = $derived(
    pct > 90 ? 'var(--color-danger)' :
    pct > 70 ? 'var(--color-warning)' :
    'var(--color-accent)'
  );
</script>

<div class="bar-track">
  <div class="bar-fill" style="width: {pct}%; background: {color};"></div>
</div>

<style>
  .bar-track {
    height: 8px;
    background: rgba(255,255,255,0.06);
    border-radius: 4px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }
</style>
