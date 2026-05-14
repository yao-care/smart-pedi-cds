// Generate PWA icons (192/512) — maskable-safe with 80% inner safe zone.
// Pure SVG → PNG via sharp. CC0.

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// Glyph: 「兒」character traced as paths so it works without system fonts.
// Width-512 viewBox. Single-stroke geometric mark.
function makeSvg(size) {
  const cx = size / 2;
  const r = size * 0.4; // safe-zone radius (80% of half)
  const stroke = size * 0.04;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </linearGradient>
  </defs>
  <!-- Full-bleed background (covers safe + bleed zones for maskable) -->
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <!-- Safe-zone inner ring -->
  <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="white" stroke-opacity="0.18" stroke-width="${stroke}"/>
  <!-- Pediatric mark: stylized parent + child silhouettes -->
  <g fill="white">
    <!-- Parent (left) head -->
    <circle cx="${cx - size * 0.13}" cy="${cx - size * 0.15}" r="${size * 0.06}"/>
    <!-- Parent body -->
    <rect x="${cx - size * 0.19}" y="${cx - size * 0.08}" width="${size * 0.12}" height="${size * 0.22}" rx="${size * 0.04}"/>
    <!-- Child (right) head -->
    <circle cx="${cx + size * 0.13}" cy="${cx - size * 0.06}" r="${size * 0.045}"/>
    <!-- Child body -->
    <rect x="${cx + size * 0.085}" y="${cx - size * 0.005}" width="${size * 0.09}" height="${size * 0.14}" rx="${size * 0.03}"/>
    <!-- Connecting heart -->
    <path d="M ${cx} ${cx + size * 0.04}
             c ${-size * 0.025} ${-size * 0.04}, ${-size * 0.09} ${-size * 0.02}, ${-size * 0.04} ${size * 0.04}
             c ${size * 0.02} ${size * 0.025}, ${size * 0.04} ${size * 0.045}, ${size * 0.04} ${size * 0.045}
             c 0 0, ${size * 0.02} ${-size * 0.02}, ${size * 0.04} ${-size * 0.045}
             c ${size * 0.05} ${-size * 0.06}, ${-size * 0.015} ${-size * 0.08}, ${-size * 0.04} ${-size * 0.04} z"
          fill="#fef3c7"/>
  </g>
</svg>`;
}

async function generate() {
  for (const size of [192, 512]) {
    const svg = makeSvg(size);
    const destPath = resolve(repoRoot, `public/icons/icon-${size}.png`);
    await sharp(Buffer.from(svg)).resize(size, size).png().toFile(destPath);
    console.log(`  ✓ public/icons/icon-${size}.png`);
  }
}

console.log('Generating PWA icons…');
await generate();
