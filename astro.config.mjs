import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  site: 'https://yao.care',
  base: '/smart-pedi-cds',
  integrations: [svelte(), sitemap()],
  output: 'static',
  vite: {
    resolve: {
      alias: {
        '$lib': path.resolve(__dirname, './src/lib'),
      },
    },
    worker: {
      format: 'es',
    },
  },
});
