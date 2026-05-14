<script lang="ts">
  let { serviceId, onclose }: { serviceId: string; onclose: () => void } = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
  function handleOverlayKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_interactive_supports_focus a11y_click_events_have_key_events -->
<div class="overlay" role="dialog" aria-modal="true" onclick={onclose} onkeydown={handleOverlayKeydown} tabindex="-1">
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="modal" onclick={(e: MouseEvent) => e.stopPropagation()} onkeydown={(e: KeyboardEvent) => e.stopPropagation()}>
    <div class="modal-header">
      <h2 class="modal-title">New API Key</h2>
      <button class="modal-close" onclick={onclose} aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <form method="POST" action="?/create">
      <div class="modal-body">
        <div class="field">
          <label for="nk-name">Name</label>
          <input id="nk-name" name="name" type="text" required placeholder="My integration" />
        </div>
        <div class="field">
          <label for="nk-perms">Permissions</label>
          <input id="nk-perms" name="permissions" type="text" required placeholder="upload, files:read" />
          <span class="hint">upload · files:read · files:delete · shares · releases · main_storage · admin</span>
        </div>
        <div class="field">
          <label for="nk-cors">CORS Origins</label>
          <textarea id="nk-cors" name="cors_origins" rows="3" placeholder="https://example.com"></textarea>
        </div>
      </div>

      <div class="modal-footer">
        <button type="submit" class="btn-primary">Create key</button>
        <button type="button" onclick={onclose} class="btn-ghost">Cancel</button>
      </div>
    </form>
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

  .modal {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    width: 100%;
    max-width: 440px;
    max-height: 90vh;
    overflow-y: auto;
    animation: slideUp 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  @keyframes slideUp {
    from { transform: translateY(16px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px 0;
  }
  .modal-title {
    font-size: 16px;
    font-weight: 700;
    margin: 0;
  }
  .modal-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    background: transparent;
    border: none;
    color: var(--color-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: background 0.15s, color 0.15s;
  }
  .modal-close:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px 20px;
  }
  .modal-footer {
    display: flex;
    gap: 8px;
    padding: 0 20px 20px;
  }

  .hint {
    font-size: 10.5px;
    color: var(--color-muted);
  }

  @media (max-width: 480px) {
    .modal {
      max-width: 100%;
      border-radius: var(--radius-md);
    }
    .modal-footer {
      flex-direction: column;
    }
    .modal-footer :global(.btn-primary),
    .modal-footer :global(.btn-ghost) {
      width: 100%;
      justify-content: center;
    }
  }
</style>
