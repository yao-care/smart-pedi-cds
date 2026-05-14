import { readFile, writeFile } from 'fs/promises';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { BASE_PATH } from './base.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const gitSha = execSync('git rev-parse --short HEAD', { cwd: repoRoot }).toString().trim();

const template = await readFile(resolve(repoRoot, 'scripts/templates/sw.template.js'), 'utf-8');
const output = template
  .replace(/__SW_VERSION__/g, gitSha)
  .replace(/__BASE_PATH__/g, BASE_PATH);

await writeFile(resolve(repoRoot, 'dist/sw.js'), output);
console.log(`Built dist/sw.js — version=${gitSha}, base=${BASE_PATH}`);
