import { readFile, writeFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { BASE_PATH, THEME_COLOR, SITE_NAME, SITE_SHORT_NAME, SITE_DESCRIPTION } from './base.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const template = await readFile(
  resolve(repoRoot, 'scripts/templates/manifest.template.json'),
  'utf-8',
);
const output = template
  .replace(/__BASE_PATH__/g, BASE_PATH)
  .replace(/__THEME_COLOR__/g, THEME_COLOR)
  .replace(/__NAME__/g, SITE_NAME)
  .replace(/__SHORT_NAME__/g, SITE_SHORT_NAME)
  .replace(/__DESCRIPTION__/g, SITE_DESCRIPTION);

await writeFile(resolve(repoRoot, 'dist/manifest.json'), output);
console.log(`Built dist/manifest.json — base=${BASE_PATH}, theme=${THEME_COLOR}`);
