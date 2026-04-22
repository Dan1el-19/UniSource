<!-- apps/frontend/src/routes/(app)/admin/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  onMount(() => {
    goto('/admin/users', { replaceState: true });
  });
</script>
