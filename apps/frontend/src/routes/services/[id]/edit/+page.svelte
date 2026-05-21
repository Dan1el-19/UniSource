<script lang="ts">
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const s = $derived(data.service);

  function fmtBytes(n: number) {
    if (n >= 1e12) return (n / 1e12).toFixed(1) + ' TB';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + ' GB';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB';
    return (n / 1e3).toFixed(0) + ' KB';
  }
</script>

<div>
  <h2 class="section-title">Edit Service</h2>

  {#if form?.error}
    <div class="alert-error">{form.error}</div>
  {/if}

  <form method="POST" class="card form-card">
    <div class="form-grid">
      <div class="field">
        <label for="name">Display Name</label>
        <input id="name" name="name" type="text" required value={s.name} />
      </div>
      <div class="field">
        <label for="default_bucket">Default R2 Bucket</label>
        <input id="default_bucket" name="default_bucket" type="text" required value={s.default_bucket} />
      </div>
      <div class="field">
        <label for="object_key_prefix">Object Key Prefix <span class="hint">(optional)</span></label>
        <input
          id="object_key_prefix"
          name="object_key_prefix"
          type="text"
          pattern="[a-z0-9_/-]*"
          maxlength="64"
          value={s.object_key_prefix}
        />
        <span class="hint">Changing this affects only NEW uploads. Existing files keep their stored keys.</span>
      </div>
      <div class="field">
        <label for="max_storage_bytes">Max Storage (bytes) <span class="hint">= {fmtBytes(s.max_storage_bytes)}</span></label>
        <input id="max_storage_bytes" name="max_storage_bytes" type="number" required min="1" value={s.max_storage_bytes} />
      </div>
      <div class="field">
        <label for="max_file_size_bytes">Max File Size (bytes) <span class="hint">= {fmtBytes(s.max_file_size_bytes)}</span></label>
        <input id="max_file_size_bytes" name="max_file_size_bytes" type="number" required min="1" value={s.max_file_size_bytes} />
      </div>
      <div class="field">
        <label for="recommended_upload_destination">Upload Destination</label>
        <select id="recommended_upload_destination" name="recommended_upload_destination">
          <option value="r2" selected={s.recommended_upload_destination === 'r2'}>R2</option>
          <option value="appwrite" selected={s.recommended_upload_destination === 'appwrite'}>Appwrite</option>
          <option value="hybrid" selected={s.recommended_upload_destination === 'hybrid'}>Hybrid</option>
        </select>
      </div>
    </div>

    <div class="form-actions">
      <button type="submit" class="btn-primary">Save changes</button>
      <a href="/services/{s.id}" class="btn-ghost">Cancel</a>
    </div>
  </form>
</div>

<style>
  .section-title {
    font-size: 16px;
    font-weight: 700;
    margin: 0 0 16px;
  }
  .form-card {
    padding: 24px;
  }
  .form-grid {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .form-actions {
    display: flex;
    gap: 10px;
    margin-top: 24px;
  }
  @media (max-width: 480px) {
    .form-actions {
      flex-direction: column;
    }
    .form-actions :global(.btn-primary),
    .form-actions :global(.btn-ghost) {
      width: 100%;
      justify-content: center;
    }
  }
  :global(.alert-error) {
    margin-bottom: 16px;
  }
</style>
