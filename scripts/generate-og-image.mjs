import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SITE_NAME, SITE_TAGLINE } from './base.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const fontDir = resolve(repoRoot, 'node_modules/@fontsource/noto-sans-tc/files');

const fontRegular = await readFile(resolve(fontDir, 'noto-sans-tc-chinese-traditional-400-normal.woff'));
const fontBold = await readFile(resolve(fontDir, 'noto-sans-tc-chinese-traditional-700-normal.woff'));

const svg = await satori(
  {
    type: 'div',
    props: {
      style: {
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'flex-start',
        background: '#3d6b54', color: '#fbf8f2', padding: '90px',
        fontFamily: 'Noto Sans TC',
      },
      children: [
        { type: 'div', props: { style: { fontSize: 76, fontWeight: 700, marginBottom: 28, lineHeight: 1.2 }, children: SITE_NAME } },
        { type: 'div', props: { style: { fontSize: 38, opacity: 0.92, lineHeight: 1.4 }, children: SITE_TAGLINE } },
      ],
    },
  },
  {
    width: 1200, height: 630,
    fonts: [
      { name: 'Noto Sans TC', data: fontRegular, weight: 400, style: 'normal' },
      { name: 'Noto Sans TC', data: fontBold, weight: 700, style: 'normal' },
    ],
  },
);

const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
await mkdir(resolve(repoRoot, 'public/og'), { recursive: true });
await writeFile(resolve(repoRoot, 'public/og/og-default.png'), png);
console.log('Built public/og/og-default.png (1200x630)');
