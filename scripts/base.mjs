// Single source of truth for build-time constants.
// Imported by astro.config.mjs, build-sw.mjs, build-manifest.mjs.
// Must remain pure constants — no Astro-only logic.
export const BASE_PATH = '/smart-pedi-cds';
export const THEME_COLOR = '#2563eb'; // matches tokens.css --color-accent hex fallback
