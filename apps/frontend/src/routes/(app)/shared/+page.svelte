<svelte:head>
	<title>Udostępnione | UniSource</title>
</svelte:head>

<div class="shared-page">
	<header class="page-head">
		<h1>Udostępnione</h1>
		<p>Pliki i foldery udostępnione przez innych użytkowników pojawią się tutaj.</p>
	</header>

	<section class="glass placeholder-card" style="border-color: var(--color-glass-border);">
		<p>
			Ten widok jest przygotowany pod przyszłe endpointy współdzielenia. Aktualnie możesz zarządzać
			plikami i folderami w zakładce „Mój dysk".
		</p>
		<a
			href="/drive"
			class="cta-link"
			style="background: var(--color-accent); color: var(--color-text-on-accent);"
		>
			Przejdź do dysku
		</a>
	</section>
</div>

<style>
	.shared-page {
		padding: var(--space-4) var(--shell-px) calc(84px + env(safe-area-inset-bottom));
		display: grid;
		gap: var(--space-5);
		max-width: 800px;
	}

	.page-head {
		display: grid;
		gap: 6px;
	}

	h1 {
		font-size: clamp(1.8rem, 2.4vw, 2.2rem);
		line-height: 1.1;
		letter-spacing: -0.02em;
		color: var(--color-text-primary);
	}

	.page-head p {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	.placeholder-card {
		border-radius: var(--radius-lg);
		padding: var(--space-5);
		display: grid;
		gap: var(--space-4);
	}

	.placeholder-card p {
		font-size: var(--text-sm);
		line-height: var(--leading-sm);
		color: var(--color-text-secondary);
	}

	.cta-link {
		display: inline-flex;
		align-items: center;
		border-radius: var(--radius-full);
		padding: 8px 18px;
		font-size: var(--text-sm);
		font-weight: 500;
		transition: opacity var(--duration-fast) linear;
	}

	.cta-link:hover {
		opacity: 0.86;
	}

	@media (min-width: 768px) {
		.shared-page {
			padding-top: var(--space-6);
			padding-bottom: var(--space-8);
		}

		.placeholder-card {
			padding: var(--space-6);
		}
	}
</style>
