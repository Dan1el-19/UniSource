<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import CorsEditor from '$components/CorsEditor.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<div>
  <h2 class="section-title">CORS Origins</h2>
  <p class="section-desc">One origin per line. Replaces the full list on save.</p>

  {#if form?.saved}
    <div class="alert-success">Origins saved successfully.</div>
  {/if}
  {#if form?.error}
    <div class="alert-error">{form.error}</div>
  {/if}

  <div class="cors-wrap">
    <CorsEditor origins={data.origins} />
  </div>
</div>

<style>
  .section-title {
    font-size: 16px;
    font-weight: 700;
    margin: 0 0 4px;
  }
  .section-desc {
    font-size: 13px;
    color: var(--color-muted);
    margin: 0 0 16px;
  }
  .cors-wrap {
    max-width: 520px;
  }
  :global(.alert-success),
  :global(.alert-error) {
    margin-bottom: 16px;
  }
</style>
