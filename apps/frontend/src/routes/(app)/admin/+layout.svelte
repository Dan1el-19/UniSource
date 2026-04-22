<!-- apps/frontend/src/routes/(app)/admin/+layout.svelte -->
<script lang="ts">
  let { children } = $props();
</script>

<div class="admin-shell">
  {@render children()}
</div>

<style>
  .admin-shell {
    --admin-text-page-size: 32px;
    --admin-text-page-line-height: 1.1;
    --admin-text-section-size: 20px;
    --admin-text-section-line-height: 1.2;
    --admin-text-card-size: 16px;
    --admin-text-card-line-height: 1.25;
    --admin-text-body-size: 14px;
    --admin-text-body-line-height: 1.4;
    --admin-text-meta-size: 12px;
    --admin-text-meta-line-height: 1.3;
    --admin-text-stat-size: 32px;
    --admin-text-stat-line-height: 1;
    --admin-radius-md: 16px;
    --admin-radius-lg: 24px;
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
    padding: 24px 24px calc(88px + env(safe-area-inset-bottom));
  }

  @media (max-width: 959px) {
    .admin-shell {
      --admin-text-page-size: 24px;
      --admin-text-stat-size: 24px;
    }
  }
</style>
