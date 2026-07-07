import { appendFileSync, readFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';

export type CoverageEntry =
  | { kind: 'questionnaire'; domain: string; age: string; score: number }
  | { kind: 'module'; module: string; age: string };

/**
 * 覆蓋紀錄採「每 worker 一個 NDJSON shard」設計，取代舊版「單一 JSON 檔
 * read-modify-write」——後者在 Playwright 多 worker 平行時會 lost update
 * （兩 worker 同時 read → push → write 互蓋），且 `beforeAll` 每 worker 各跑
 * 一次 reset 會互相清檔。
 *
 * 現在：
 * - recordCoverage 用 appendFileSync 對「本 worker 專屬 shard」附加一行（append
 *   對小寫入是原子的，跨 process 不互蓋）。
 * - readCoverage 合併目錄下所有 shard。
 * - resetCoverage 整個目錄 wipe，僅供「跑一次」的情境呼叫（Playwright
 *   globalSetup / vitest 單元測試的 beforeEach）；**切勿**放進 per-worker 的
 *   test.beforeAll，否則後啟動的 worker 會清掉先啟動 worker 已寫的資料。
 */
const DIR = 'test-results/coverage';

/** 本 worker 專屬 shard；平行 index 由 Playwright 注入，vitest / 單 process 時為 0。 */
function shardFile(): string {
  const idx = process.env.TEST_PARALLEL_INDEX ?? '0';
  return join(DIR, `shard-${idx}.ndjson`);
}

export function resetCoverage(): void {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
}

export function readCoverage(): CoverageEntry[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter(f => f.endsWith('.ndjson'))
    .flatMap(f =>
      readFileSync(join(DIR, f), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line) as CoverageEntry),
    );
}

export function recordCoverage(entry: CoverageEntry): void {
  mkdirSync(DIR, { recursive: true });
  appendFileSync(shardFile(), JSON.stringify(entry) + '\n');
}
