<script lang="ts">
	import LoginForm from '$components/auth/LoginForm.svelte';
</script>

<svelte:head>
	<title>Zaloguj się | UniSource</title>
	<meta name="description" content="Logowanie dla aplikacji cloud storage" />
</svelte:head>

<main
	class="relative flex min-h-dvh items-center justify-center overflow-hidden px-shell py-10 sm:py-14 xl:py-16 2xl:py-20"
>
	<div class="pointer-events-none absolute inset-0 -z-10">
		<div
			class="absolute inset-0"
			style="background: radial-gradient(760px 460px at 50% -35%, color-mix(in oklab, var(--color-accent) 7%, transparent) 0%, transparent 72%), linear-gradient(180deg, color-mix(in oklab, var(--color-bg-base) 98%, #000) 0%, var(--color-bg-base) 100%);"
		></div>
		<div
			class="absolute inset-0"
			style="background-image: radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--color-border-subtle) 58%, transparent) 1px, transparent 0); background-size: 24px 24px; opacity: 0.14;"
		></div>
	</div>

	<LoginForm />
</main>
