import { readFile, writeFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { BASE_PATH, THEME_COLOR } from './base.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const template = await readFile(
  resolve(repoRoot, 'scripts/templates/manifest.template.json'),
  'utf-8',
);
const output = template
  .replace(/__BASE_PATH__/g, BASE_PATH)
  .replace(/__THEME_COLOR__/g, THEME_COLOR);

await writeFile(resolve(repoRoot, 'dist/manifest.json'), output);
console.log(`Built dist/manifest.json — base=${BASE_PATH}, theme=${THEME_COLOR}`);
