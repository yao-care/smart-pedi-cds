import { mkdir, readdir, copyFile, stat, access } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Self-host MediaPipe Tasks Vision WASM 資產（followup B2 收斂，2026-07-08）。
 *
 * 為什麼：gross-motor pose 分析原本從 jsdelivr CDN 載 WASM、從 Google Storage 載
 * pose 模型 —— 對臨床工具是外部依賴 + 供應鏈風險（上游可無預警改變或下架）。改為
 * 全部自本站 `/models/` 供應。WASM 由 npm 包 `@mediapipe/tasks-vision` 自帶（版本由
 * package.json 釘），故不 commit 進 repo，而在 predev/prebuild 時從 node_modules
 * 複製到 public/models/mediapipe-wasm/（該目錄已 gitignore）。pose 模型（.task）非 npm
 * 來源，直接 commit 進 public/models/。astro build 再把 public/ 原樣複製到 dist/。
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const srcDir = resolve(repoRoot, 'node_modules/@mediapipe/tasks-vision/wasm');
const destDir = resolve(repoRoot, 'public/models/mediapipe-wasm');

try {
  await access(srcDir);
} catch {
  console.error(
    `[copy-mediapipe-assets] 找不到 ${srcDir} —— 請先 pnpm install（@mediapipe/tasks-vision 自帶 wasm）。`,
  );
  process.exit(1);
}

await mkdir(destDir, { recursive: true });

const files = await readdir(srcDir);
let copied = 0;
let bytes = 0;
for (const name of files) {
  const from = resolve(srcDir, name);
  const info = await stat(from);
  if (!info.isFile()) continue;
  await copyFile(from, resolve(destDir, name));
  copied += 1;
  bytes += info.size;
}

console.log(
  `[copy-mediapipe-assets] 複製 ${copied} 個 WASM 檔（${(bytes / 1024 / 1024).toFixed(1)}MB）→ public/models/mediapipe-wasm/`,
);
