// @ts-check
import { defineConfig } from 'astro/config';
import { setMaxListeners } from 'node:events';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';

setMaxListeners(20);

// https://astro.build/config
export default defineConfig({
  integrations: [svelte()],
  vite: {
    plugins: [tailwindcss()],
  },
});