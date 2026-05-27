// Single source of truth for build-time constants.
// Imported by astro.config.mjs, build-sw.mjs, build-manifest.mjs.
// Must remain pure constants — no Astro-only logic.
//
// BASE_PATH = '' (empty) — site is hosted at root of smart-pedi-cds.yao.care.
// Previously '/smart-pedi-cds' when served from yao-care.github.io/smart-pedi-cds/.
export const BASE_PATH = '';
export const THEME_COLOR = '#3d6b54'; // matches tokens.css --color-accent hex fallback (deep eucalyptus, hue 155)

// 品牌字串真相源（跨 build/runtime）。site.ts 匯入後組成 SITE。
export const SITE_NAME = 'Smart Pedi 兒童發展智慧評估';
export const SITE_SHORT_NAME = 'Smart Pedi';
export const SITE_TAGLINE = '給 0–6 歲家長的免費兒童發展篩檢工具';
export const SITE_DESCRIPTION = '在瀏覽器完成的兒童發展評估，依年齡評估語言、動作、社交、認知等發展里程碑，並提供對應衛教內容。結果非醫療診斷，發現疑慮建議就醫評估。';
