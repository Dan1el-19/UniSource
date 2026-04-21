<script lang="ts">
	import Sidebar from '$components/layout/Sidebar.svelte';
	import BottomDock from '$components/layout/BottomDock.svelte';

	let { children } = $props();
</script>

<div
	class="flex h-dvh w-full min-w-0 overflow-hidden"
	style="background: var(--color-bg-base);"
>
	<Sidebar />

	<main
		class="drive-scroll-region relative flex min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"
		style="background: transparent;"
	>
		{@render children()}
	</main>

	<BottomDock />
</div>
