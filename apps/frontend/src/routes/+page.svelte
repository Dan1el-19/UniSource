<script lang="ts">
	import { Cloud } from 'lucide-svelte';
	import SessionCta from '$components/auth/SessionCta.svelte';
</script>

<svelte:head>
	<title>UniSource | Premium Cloud Storage</title>
	<meta name="description" content="Premium Cloud Storage Solution" />
</svelte:head>

<main
	class="landing-wrap relative min-h-dvh overflow-hidden px-shell py-16 flex items-center justify-center"
>
	<div class="absolute inset-0 pointer-events-none">
		<div class="landing-vignette absolute inset-0"></div>
		<div class="landing-grid absolute inset-0"></div>
	</div>

	<section
		class="hero-frame relative z-10 mx-auto w-full max-w-4xl rounded-[34px] px-6 py-10 text-center md:px-10 md:py-14 xl:max-w-5xl 2xl:max-w-6xl"
	>
		<div class="hero-mark mx-auto mb-9 inline-flex items-center gap-3 rounded-full px-4 py-2">
			<Cloud size={21} strokeWidth={1.7} style="color: var(--color-accent);" />
			<span class="hero-mark-label">UniSource</span>
		</div>

		<p class="hero-kicker mx-auto mb-6 inline-flex rounded-full px-4 py-1.5 text-sm">
			Dark-first file workspace
		</p>

		<h1
			class="hero-title mx-auto mb-8 max-w-3xl 2xl:max-w-4xl"
			style="color: var(--color-text-primary);"
		>
			Chmura, która wygląda jak produkt premium i działa jak narzędzie codzienne.
		</h1>

		<p
			class="hero-copy mx-auto mb-12 max-w-2xl text-base md:text-lg"
			style="color: var(--color-text-secondary);"
		>
			UniSource porządkuje pliki, foldery i uploady w jednej przestrzeni. Szybki dostęp, spokojny
			interfejs, pełna kontrola.
		</p>

		<SessionCta autoRedirectAuthenticated={true} />
	</section>
</main>

<style>
	.landing-wrap {
		background:
			radial-gradient(
				840px 520px at 50% -30%,
				color-mix(in oklab, var(--color-accent) 5%, transparent) 0%,
				transparent 68%
			),
			var(--color-bg-base);
	}

	.landing-vignette {
		background:
			radial-gradient(
				1150px 560px at 50% 115%,
				color-mix(in oklab, #000 54%, transparent) 0%,
				transparent 74%
			),
			linear-gradient(
				180deg,
				color-mix(in oklab, var(--color-bg-base) 96%, #000) 0%,
				var(--color-bg-base) 100%
			);
		opacity: 0.94;
	}

	.landing-grid {
		background-image: radial-gradient(
			circle at 1px 1px,
			color-mix(in oklab, var(--color-border-subtle) 48%, transparent) 1px,
			transparent 0
		);
		background-size: 24px 24px;
		opacity: 0.22;
	}

	.hero-frame {
		border: 1px solid color-mix(in oklab, var(--color-border-default) 32%, transparent);
		background: linear-gradient(
			180deg,
			color-mix(in oklab, var(--color-bg-base) 82%, transparent) 0%,
			color-mix(in oklab, var(--color-bg-base) 88%, transparent) 100%
		);
		box-shadow:
			0 0 0 1px color-mix(in oklab, var(--color-accent-glow) 72%, transparent),
			0 28px 64px color-mix(in oklab, #000 36%, transparent),
			inset 0 1px 0 color-mix(in oklab, var(--color-accent) 9%, transparent);
		backdrop-filter: blur(10px) saturate(120%);
		-webkit-backdrop-filter: blur(10px) saturate(120%);
	}

	.hero-mark {
		border: 1px solid color-mix(in oklab, var(--color-border-default) 36%, transparent);
		background: color-mix(in oklab, var(--color-bg-surface) 46%, transparent);
	}

	.hero-mark-label {
		font-size: var(--text-sm);
		line-height: var(--leading-sm);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-secondary);
	}

	.hero-kicker {
		border: 1px solid color-mix(in oklab, var(--color-border-subtle) 92%, transparent);
		color: color-mix(in oklab, var(--color-text-secondary) 95%, #fff);
		letter-spacing: 0.01em;
	}

	.hero-title {
		font-size: clamp(2.15rem, 5.4vw, 3.85rem);
		line-height: 1.14;
		font-weight: 560;
		letter-spacing: -0.024em;
		text-wrap: balance;
	}

	.hero-copy {
		text-wrap: pretty;
	}
</style>
