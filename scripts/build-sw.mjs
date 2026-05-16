import { readdir, readFile, writeFile } from 'fs/promises';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { BASE_PATH } from './base.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const template = await readFile(resolve(repoRoot, 'scripts/templates/sw.template.js'), 'utf-8');

/**
 * SW_VERSION = content hash of (SW template + dist/_astro filenames).
 *
 * Why filenames, not contents: Astro names its JS/CSS bundles with a
 * content hash (e.g. `index.D3kJ8s2x.js`). If any source file changes,
 * the resulting filename changes, so a sorted list of filenames is itself
 * a stable content signature of the entire UI bundle.
 *
 * Result: changes that don't affect the UI bundle — docs, tests, lockfiles,
 * comments — do NOT bump the SW version. Only real UI-affecting changes
 * trigger the "新版已可用" banner.
 *
 * Falls back to git SHA on first invocation before `astro build` runs
 * (e.g. local diagnostics); CI always sees dist/_astro and hits the hash path.
 */
let swVersion;
try {
  const astroDir = resolve(repoRoot, 'dist/_astro');
  const entries = await readdir(astroDir, { recursive: true });
  const files = entries.filter((f) => /\.(js|css)$/.test(f)).sort();
  if (files.length === 0) throw new Error('dist/_astro is empty');

  const hash = createHash('sha256');
  hash.update(template);
  for (const f of files) hash.update(f + '\n');
  swVersion = hash.digest('hex').slice(0, 8);
} catch (err) {
  const gitSha = execSync('git rev-parse --short HEAD', { cwd: repoRoot }).toString().trim();
  console.warn(`[build-sw] content-hash unavailable (${err.message}); falling back to git SHA ${gitSha}`);
  swVersion = gitSha;
}

const output = template
  .replace(/__SW_VERSION__/g, swVersion)
  .replace(/__BASE_PATH__/g, BASE_PATH);

await writeFile(resolve(repoRoot, 'dist/sw.js'), output);
console.log(`Built dist/sw.js — version=${swVersion}, base=${BASE_PATH}`);
