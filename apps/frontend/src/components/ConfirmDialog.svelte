<script lang="ts">
  let {
    message,
    onconfirm,
    oncancel,
  }: { message: string; onconfirm: () => void; oncancel: () => void } = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') oncancel();
  }
  function handleOverlayKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') oncancel();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_interactive_supports_focus a11y_click_events_have_key_events -->
<div class="overlay" role="dialog" aria-modal="true" onclick={oncancel} onkeydown={handleOverlayKeydown} tabindex="-1">
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="dialog" onclick={(e: MouseEvent) => e.stopPropagation()} onkeydown={(e: KeyboardEvent) => e.stopPropagation()}>
    <div class="dialog-icon">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    </div>
    <p class="dialog-msg">{message}</p>
    <div class="dialog-actions">
      <button onclick={oncancel} class="btn-ghost">Cancel</button>
      <button onclick={onconfirm} class="btn-danger">Confirm</button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    padding: 16px;
    animation: fadeIn 0.15s ease;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .dialog {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 24px;
    width: 100%;
    max-width: 360px;
    text-align: center;
    animation: slideUp 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  @keyframes slideUp {
    from { transform: translateY(16px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .dialog-icon {
    color: var(--color-warning);
    margin-bottom: 12px;
  }
  .dialog-msg {
    font-size: 14px;
    color: var(--color-text);
    margin: 0 0 20px;
    line-height: 1.5;
  }
  .dialog-actions {
    display: flex;
    gap: 8px;
    justify-content: center;
  }
</style>
