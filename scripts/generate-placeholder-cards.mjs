// Generate 60 placeholder illustration cards (6 domains × 10).
// Pure SVG flat illustrations rendered via sharp — no fonts/emoji required.
// CC0, no rights issues.

import { writeFile, mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// 5 shape types × 2 colour variants = 10 per domain.
// Two-colour variants (yellow / purple) keep the variant easy to name
// out loud ("按紫色的圓") and distinct under the always-white inner ring,
// which decouples shape colour from the domain-coloured background.
const SHAPES = ['circle', 'square', 'triangle', 'star', 'hexagon'];
const VARIANTS = [
  { tag: 'yellow', label: '黃', primary: '#fbbf24', accent: 'rgba(255,255,255,0.92)' },
  { tag: 'purple', label: '紫', primary: '#a855f7', accent: 'rgba(255,255,255,0.92)' },
];

const DOMAINS = {
  gross_motor: { color: '#fb923c', label: '大動作' },
  fine_motor: { color: '#22c55e', label: '精細動作' },
  language_comp: { color: '#3b82f6', label: '語言理解' },
  language_expr: { color: '#a855f7', label: '語言表達' },
  cognition: { color: '#eab308', label: '認知' },
  social_emotional: { color: '#ec4899', label: '社交情緒' },
};

const DESC = {
  circle: '圓形',
  square: '方形',
  triangle: '三角形',
  star: '星形',
  hexagon: '六角形',
};

function starPath(cx, cy, outerR, innerR) {
  let path = '';
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    path += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)} `;
  }
  return path + 'Z';
}

function hexagonPath(cx, cy, r) {
  let path = '';
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3 - Math.PI / 6;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    path += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)} `;
  }
  return path + 'Z';
}

function makeSvg(shape, bgColor, variant) {
  const cx = 256, cy = 256;
  const r = 130;
  let shapeNode = '';
  switch (shape) {
    case 'circle':
      shapeNode = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${variant.primary}" />`;
      break;
    case 'square':
      shapeNode = `<rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" rx="24" fill="${variant.primary}" />`;
      break;
    case 'triangle':
      shapeNode = `<polygon points="${cx},${cy - r} ${cx + r},${cy + r * 0.8} ${cx - r},${cy + r * 0.8}" fill="${variant.primary}" />`;
      break;
    case 'star':
      shapeNode = `<path d="${starPath(cx, cy, r, r * 0.42)}" fill="${variant.primary}" />`;
      break;
    case 'hexagon':
      shapeNode = `<path d="${hexagonPath(cx, cy, r)}" fill="${variant.primary}" />`;
      break;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${bgColor}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${bgColor}" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="48" fill="url(#bg)"/>
  <circle cx="${cx}" cy="${cy}" r="180" fill="${variant.accent}" />
  ${shapeNode}
</svg>`;
}

async function generate() {
  const cards = [];
  for (const [domain, def] of Object.entries(DOMAINS)) {
    const domainDir = resolve(repoRoot, 'public/cards', domain);
    await mkdir(domainDir, { recursive: true });

    let seq = 0;
    for (let v = 0; v < VARIANTS.length; v++) {
      for (let s = 0; s < SHAPES.length; s++) {
        seq++;
        const shape = SHAPES[s];
        const variant = VARIANTS[v];
        const variantTag = variant.tag;
        const variantLabel = variant.label;
        const filename = `${domain}/${String(seq).padStart(2, '0')}-${shape}-${variantTag}.webp`;
        const destPath = resolve(repoRoot, 'public/cards', filename);

        const svg = makeSvg(shape, def.color, variant);
        await sharp(Buffer.from(svg)).resize(512, 512).webp({ quality: 90 }).toFile(destPath);

        cards.push({
          id: `${domain}-${String(seq).padStart(2, '0')}`,
          domain,
          filename,
          description: `${def.label}：${DESC[shape]}（${variantLabel}）`,
          source: 'manual',
          sourceUrl: 'https://github.com/yao-care/smart-pedi-cds',
          attribution: 'Generated placeholder (geometric flat)',
          license: 'CC0',
          reviewStatus: 'approved',
        });
        console.log(`  ✓ ${filename}`);
      }
    }
  }

  const indexPath = resolve(repoRoot, 'src/data/cards/index.json');
  await writeFile(indexPath, JSON.stringify(cards, null, 2) + '\n');
  console.log(`\nGenerated ${cards.length} cards. Index: ${indexPath}`);
}

console.log('Generating placeholder cards…');
await generate();
