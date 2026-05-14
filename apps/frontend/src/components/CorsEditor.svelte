<script lang="ts">
  let { origins }: { origins: string[] } = $props();
  let value = $state('');
  $effect(() => { value = origins.join('\n'); });
</script>

<form method="POST" class="cors-form">
  <textarea
    name="origins"
    rows="10"
    bind:value
    placeholder="https://example.com&#10;https://app.example.com"
    class="cors-textarea"
  ></textarea>
  <div>
    <button type="submit" class="btn-primary">Save origins</button>
  </div>
</form>

<style>
  .cors-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .cors-textarea {
    width: 100%;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 12px 14px;
    font-size: 13px;
    font-family: var(--font-mono);
    color: var(--color-text);
    outline: none;
    resize: vertical;
    transition: border-color 0.15s, box-shadow 0.15s;
    line-height: 1.7;
  }
  .cors-textarea:focus {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-soft);
  }
</style>
