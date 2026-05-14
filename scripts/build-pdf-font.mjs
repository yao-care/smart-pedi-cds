// Build subset PDF fonts. Run with `pnpm run rebuild:pdf-font`.
// Reads Noto Sans TC woff2 from @fontsource and writes base64-encoded
// TTF subsets to public/fonts/ as ES modules consumed by font-loader.ts.

import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import subsetFont from 'subset-font';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const SRC_REGULAR = resolve(
  repoRoot,
  'node_modules/@fontsource/noto-sans-tc/files/noto-sans-tc-chinese-traditional-400-normal.woff2',
);
const SRC_BOLD = resolve(
  repoRoot,
  'node_modules/@fontsource/noto-sans-tc/files/noto-sans-tc-chinese-traditional-700-normal.woff2',
);
const CHARSET_PATH = resolve(repoRoot, 'scripts/pdf-charset.txt');

async function makeSubset(srcPath, outPath, exportName) {
  const buf = await readFile(srcPath);
  const charset = await readFile(CHARSET_PATH, 'utf-8');
  // 'truetype' === 'sfnt' alias; jsPDF accepts SFNT binaries.
  const subset = await subsetFont(buf, charset, { targetFormat: 'truetype' });
  const b64 = subset.toString('base64');
  await writeFile(
    outPath,
    `// AUTO-GENERATED — do not edit. Run \`pnpm run rebuild:pdf-font\`.\n` +
      `export const ${exportName} = '${b64}';\n`,
  );
  console.log(`  ${outPath.replace(repoRoot + '/', '')} — ${(subset.length / 1024).toFixed(1)} KB`);
}

console.log('Building PDF font subsets…');
await makeSubset(
  SRC_REGULAR,
  resolve(repoRoot, 'public/fonts/NotoSansTC-subset-regular.js'),
  'NotoSansTC_Regular_base64',
);
await makeSubset(
  SRC_BOLD,
  resolve(repoRoot, 'public/fonts/NotoSansTC-subset-bold.js'),
  'NotoSansTC_Bold_base64',
);
console.log('Done.');
