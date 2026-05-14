// Download illustration-style cards from Pexels API into public/cards/.
// Requires PEXELS_API_KEY env var. Run with `PEXELS_API_KEY=xxx pnpm run download:cards`.
// Each downloaded card is set reviewStatus = 'pending'. Human spot-check required
// before flipping to 'approved' in src/data/cards/index.json.

import { writeFile, mkdir, readFile, access } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
if (!PEXELS_API_KEY) {
  console.error('Error: PEXELS_API_KEY env var required.');
  process.exit(1);
}

const PER_DOMAIN = parseInt(process.env.PER_DOMAIN ?? '10', 10);
const KEYWORDS = {
  gross_motor: ['child running illustration', 'kid jumping flat design', 'toddler walking cartoon'],
  fine_motor: ['child drawing illustration', 'kid hands flat design', 'children craft cartoon'],
  language_comp: ['child listening illustration', 'kids reading flat design'],
  language_expr: ['child talking illustration', 'kids speaking cartoon'],
  cognition: ['kids shapes flat design', 'children colors illustration', 'puzzle cartoon kids'],
  social_emotional: ['children friends illustration', 'kids emotions flat design', 'happy kid cartoon'],
};

async function fileExists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function searchPexels(query, perPage) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=square`;
  const res = await fetch(url, { headers: { Authorization: PEXELS_API_KEY } });
  if (!res.ok) throw new Error(`Pexels ${query}: HTTP ${res.status}`);
  return (await res.json()).photos ?? [];
}

async function downloadAndConvert(photoUrl, destPath) {
  const res = await fetch(photoUrl);
  if (!res.ok) throw new Error(`Photo download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await sharp(buf)
    .resize(512, 512, { fit: 'cover', position: 'center' })
    .webp({ quality: 80 })
    .toFile(destPath);
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

async function downloadDomain(domain) {
  const keywords = KEYWORDS[domain];
  const collected = new Map();
  for (const kw of keywords) {
    if (collected.size >= PER_DOMAIN) break;
    try {
      const photos = await searchPexels(kw, Math.min(PER_DOMAIN * 2, 20));
      for (const p of photos) {
        if (collected.size >= PER_DOMAIN) break;
        if (collected.has(p.id)) continue;
        collected.set(p.id, { photo: p, keyword: kw });
      }
    } catch (e) {
      console.warn(`  ! ${kw}: ${e.message}`);
    }
  }

  const cards = [];
  let seq = 1;
  for (const { photo, keyword } of collected.values()) {
    const slug = slugify(keyword);
    const filename = `${domain}/${String(seq).padStart(2, '0')}-${slug}.webp`;
    const destPath = resolve(repoRoot, 'public/cards', filename);
    await mkdir(dirname(destPath), { recursive: true });

    try {
      const photoUrl = photo.src?.large ?? photo.src?.original;
      await downloadAndConvert(photoUrl, destPath);
      cards.push({
        id: `${domain}-${String(seq).padStart(2, '0')}`,
        domain,
        filename,
        description: photo.alt || keyword,
        source: 'pexels',
        sourceUrl: photo.url,
        attribution: `Photo by ${photo.photographer} on Pexels`,
        license: 'Pexels',
        reviewStatus: 'pending',
      });
      console.log(`  ✓ ${filename}`);
      seq++;
    } catch (e) {
      console.warn(`  ! ${filename}: ${e.message}`);
    }
  }
  return cards;
}

console.log('Downloading illustration cards from Pexels…');
const allCards = [];
for (const domain of Object.keys(KEYWORDS)) {
  console.log(`\n[${domain}]`);
  const cards = await downloadDomain(domain);
  allCards.push(...cards);
}

// Merge with existing index.json (keep cards not from this run, e.g. manual)
const indexPath = resolve(repoRoot, 'src/data/cards/index.json');
let existing = [];
if (await fileExists(indexPath)) {
  try {
    existing = JSON.parse(await readFile(indexPath, 'utf-8'));
  } catch {}
}
const downloadedIds = new Set(allCards.map((c) => c.id));
const merged = [
  ...existing.filter((c) => !downloadedIds.has(c.id) && c.source !== 'pexels'),
  ...allCards,
];

await writeFile(indexPath, JSON.stringify(merged, null, 2) + '\n');
console.log(`\nDone. ${allCards.length} new cards downloaded. Total in index: ${merged.length}.`);
console.log('Next: human spot-check, then change reviewStatus to "approved" in src/data/cards/index.json.');
