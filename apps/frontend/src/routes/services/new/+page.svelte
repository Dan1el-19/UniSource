<script lang="ts">
  import type { ActionData } from './$types';
  import SectionHeader from '$components/SectionHeader.svelte';

  let { form }: { form: ActionData } = $props();
</script>

<div class="page-pad">
  <SectionHeader title="New Service" back="/services" />

  {#if form?.error}
    <div class="alert-error">{form.error}</div>
  {/if}

  <div class="alert-warn">
    <strong>Important:</strong> After creating a service, register the matching R2 bucket binding in <code>apps/backend/wrangler.jsonc</code>
    and redeploy the backend, otherwise uploads will fail with <code>R2 binding not configured</code>.
    The binding key follows the convention <code>&lt;BUCKET_NAME&gt;_BUCKET</code> (uppercased, non-alphanumerics replaced with <code>_</code>).
  </div>

  <form method="POST" class="card form-card">
    <div class="form-grid">
      <div class="field">
        <label for="id">Service ID</label>
        <input id="id" name="id" type="text" required pattern="[a-z0-9-]+" placeholder="my-service" />
        <span class="hint">URL-safe slug, e.g. "my-service"</span>
      </div>
      <div class="field">
        <label for="name">Display Name</label>
        <input id="name" name="name" type="text" required placeholder="My Service" />
      </div>
      <div class="field">
        <label for="default_bucket">Default R2 Bucket</label>
        <input id="default_bucket" name="default_bucket" type="text" required placeholder="my-bucket" />
      </div>
      <div class="field">
        <label for="object_key_prefix">Object Key Prefix <span class="hint">(optional)</span></label>
        <input
          id="object_key_prefix"
          name="object_key_prefix"
          type="text"
          pattern="[a-z0-9_/-]*"
          maxlength="64"
          placeholder="e.g. tenant1 (leave empty for none)"
        />
        <span class="hint">Lowercase, digits, hyphens, underscores, and slashes only. Files are stored under <code>&lt;prefix&gt;/uploads/...</code></span>
      </div>
      <div class="field">
        <label for="max_storage_bytes">Max Storage (bytes)</label>
        <input id="max_storage_bytes" name="max_storage_bytes" type="number" required value="10737418240" min="1" />
      </div>
      <div class="field">
        <label for="max_file_size_bytes">Max File Size (bytes)</label>
        <input id="max_file_size_bytes" name="max_file_size_bytes" type="number" required value="536870912" min="1" />
      </div>
      <div class="field">
        <label for="recommended_upload_destination">Upload Destination</label>
        <select id="recommended_upload_destination" name="recommended_upload_destination">
          <option value="r2">R2</option>
          <option value="appwrite">Appwrite</option>
          <option value="hybrid">Hybrid</option>
        </select>
      </div>
    </div>

    <div class="form-actions">
      <button type="submit" class="btn-primary">Create service</button>
      <a href="/services" class="btn-ghost">Cancel</a>
    </div>
  </form>
</div>

<style>
  .form-card {
    padding: 24px;
    margin-top: 16px;
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
  :global(.alert-warn) {
    margin-bottom: 16px;
  }
</style>
