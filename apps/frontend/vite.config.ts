import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	resolve: {
		alias: {
			'@unisource/sdk': path.resolve(__dirname, '../../packages/unisource-sdk/src/index.ts'),
		},
	},
	optimizeDeps: {
		exclude: ['@unisource/sdk'],
	},
});
