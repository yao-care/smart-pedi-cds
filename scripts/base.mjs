// Single source of truth for build-time constants.
// Imported by astro.config.mjs, build-sw.mjs, build-manifest.mjs.
// Must remain pure constants — no Astro-only logic.
//
// BASE_PATH = '' (empty) — site is hosted at root of smart-pedi-cds.yao.care.
// Previously '/smart-pedi-cds' when served from yao-care.github.io/smart-pedi-cds/.
export const BASE_PATH = '';
export const THEME_COLOR = '#2563eb'; // matches tokens.css --color-accent hex fallback
