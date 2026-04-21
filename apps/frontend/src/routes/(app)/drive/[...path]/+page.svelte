<script lang="ts">
	import type { PageData } from './$types';
	import DriveBrowser from '$components/files/DriveBrowser.svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Mój dysk | UniSource</title>
</svelte:head>

<DriveBrowser currentPath={data.currentPath} />
