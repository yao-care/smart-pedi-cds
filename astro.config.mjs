import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://yao.care',
  base: '/smart-pedi-cds',
  integrations: [svelte(), sitemap()],
  output: 'static',
  vite: {
    worker: {
      format: 'es',
    },
  },
});
