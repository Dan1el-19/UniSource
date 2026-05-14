<script lang="ts">
  let { message, action }: { message: string; action?: { label: string; href: string } } = $props();
</script>

<div class="empty">
  <div class="empty-icon">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 15s1.5-2 4-2 4 2 4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
  </div>
  <p class="empty-msg">{message}</p>
  {#if action}
    <a href={action.href} class="btn-primary">{action.label}</a>
  {/if}
</div>

<style>
  .empty {
    text-align: center;
    padding: 56px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .empty-icon {
    color: var(--color-muted);
    opacity: 0.5;
    margin-bottom: 4px;
  }
  .empty-msg {
    font-size: 13.5px;
    color: var(--color-muted);
    margin: 0;
  }
</style>
