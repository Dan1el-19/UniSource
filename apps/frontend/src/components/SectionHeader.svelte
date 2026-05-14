<script lang="ts">
  let {
    title,
    back,
    children,
  }: { title: string; back?: string; children?: import('svelte').Snippet } = $props();
</script>

<div class="header">
  <div>
    {#if back}
      <a href={back} class="back">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </a>
    {/if}
    <h1 class="title">{title}</h1>
  </div>
  {#if children}
    <div class="actions">{@render children()}</div>
  {/if}
</div>

<style>
  .header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--color-muted);
    margin-bottom: 4px;
    transition: color 0.15s;
  }
  .back:hover { color: var(--color-text); }
  .title {
    font-size: 22px;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.02em;
  }
  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
</style>
