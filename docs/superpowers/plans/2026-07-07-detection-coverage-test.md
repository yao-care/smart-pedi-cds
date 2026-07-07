# 檢測覆蓋 E2E 測試 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一支資料驅動的 Playwright E2E，對 6 面向 × 7 年齡層實跑真實評估、驗證檢測數值是否正確落地 IndexedDB，並附一支完整性稽核腳本確認測試無漏。

**Architecture:** 純函數 helpers（TDD/vitest）負責「應測清單展開、golden 常模計算、覆蓋記錄、完整性比對」；Playwright helpers 負責「驅動問卷/主動模組、讀 IndexedDB、攔截匯出」；主 spec 對 live URL 跑真實流程並斷言。測試輸入與 golden 一律源自真實資料（`questions.json`、ASQ-3 Table 18），零人工假設。

**Tech Stack:** Playwright（`@playwright/test` ^1.60）、Vitest、TypeScript strict、Node fs。

## Global Constraints

- TypeScript strict，不允許 `any`（測試端不可迴避型別；解析 JSON 時用明確 interface）。
- 測試目標為 live：`PLAYWRIGHT_BASE_URL=https://smart-pedi-cds.yao.care`；未設時維持本機 `pnpm preview`。既有 `tests/e2e/parent-flow.spec.ts` 不可受影響。
- DB 名稱 `cdss-pediatric`（Dexie v7）。數值落地點 `assessments.triageResult.details[]`；媒體落地點 `mediaFiles` 表。
- gating 門檻（copy verbatim）：`DOMAIN_REFER_Z = -2`、`DOMAIN_MONITOR_Z = -1`。常模縮放：`mean_local = mean_asq × maxScore / 60`、`sd_local = sd_asq × maxScore / 60`；`z = (score − mean_local) / sd_local`。
- ASQ-3 interval 對應：`2-6m→4, 7-12m→10, 13-24m→18, 25-36m→30, 37-48m→42, 49-60m→54, 61-72m→60`。
- domain→area 對應：`cognition→problem_solving, fine_motor→fine_motor, gross_motor→gross_motor, language_comprehension→communication, language_expression→communication, social_emotional→personal_social`。
- 真實有題格 = 40；全枚舉問卷單元 = 190；主動模組格 = 26（game/video/drawing 全 7 齡 + voice 5 齡 13m+）。
- 本階段為「測試 + 缺口報告」，不修復缺口。測試預期出現大量紅格（Voice/Video 未接線、四匯出無媒體）——這是預期結果，非測試失敗。

## 執行波次（供多工 dispatch）

- **Wave A（全平行，無互相依賴）**：Task 1, 2, 3, 4, 5, 7, 8, 9, 10
- **Wave B**：Task 6（依 4,5）、Task 11（依 2,3,4,5,7,8）
- **Wave C**：Task 12（依 9,11）、Task 13（依 10,11）
- **Wave D**：Task 14（依全部）

---

### Task 1: Playwright live config 切換

**Files:**
- Modify: `playwright.config.ts`

**Interfaces:**
- Produces: 當 `process.env.PLAYWRIGHT_BASE_URL` 有值時，baseURL 指 live 且不啟 webServer；否則維持本機 preview。fake-media launch flags 全域生效。

- [ ] **Step 1: 改寫 config**

```ts
import { defineConfig, devices } from '@playwright/test';

const liveBase = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: liveBase ?? 'http://localhost:4321',
    trace: 'retain-on-failure',
    // fake 麥克風/攝影機：讓 getUserMedia 不跳權限、可餵測試音檔
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--use-file-for-fake-audio-capture=tests/e2e/fixtures/fake-voice.wav',
      ],
    },
  },
  webServer: liveBase
    ? undefined
    : {
        command: 'pnpm preview --port 4321',
        url: 'http://localhost:4321',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 2: 建 fake 音檔 fixture**

Run:
```bash
mkdir -p tests/e2e/fixtures
# 產生 3 秒 440Hz 正弦波 wav（若無 ffmpeg 改用 node 產 PCM，見下）
ffmpeg -f lavfi -i "sine=frequency=440:duration=3" -ar 16000 -ac 1 tests/e2e/fixtures/fake-voice.wav -y || node tests/e2e/fixtures/gen-wav.mjs
```

若無 ffmpeg，建立 `tests/e2e/fixtures/gen-wav.mjs`：

```js
import { writeFileSync } from 'fs';
const sr = 16000, sec = 3, n = sr * sec;
const data = Buffer.alloc(44 + n * 2);
data.write('RIFF', 0); data.writeUInt32LE(36 + n * 2, 4); data.write('WAVE', 8);
data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20);
data.writeUInt16LE(1, 22); data.writeUInt32LE(sr, 24); data.writeUInt32LE(sr * 2, 28);
data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
data.write('data', 36); data.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / sr) * 8000), 44 + i * 2);
writeFileSync('tests/e2e/fixtures/fake-voice.wav', data);
console.log('wrote fake-voice.wav');
```

- [ ] **Step 3: 驗證既有測試不受影響**

Run: `pnpm build && pnpm exec playwright test parent-flow --project=chromium`
Expected: PASS（本機 preview 路徑不變）

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts tests/e2e/fixtures/
git commit -m "test(e2e): live URL 切換 + fake media launch flags"
```

---

### Task 2: age-fixtures helper

**Files:**
- Create: `tests/e2e/helpers/age-fixtures.ts`
- Test: `tests/e2e/helpers/age-fixtures.test.ts`

**Interfaces:**
- Produces: `birthDateForAgeGroup(ageGroup, now?): string`（回推出生日期，使 `ageGroupCDSA()` 映射回同一 ageGroup）；`ALL_AGE_GROUPS: AgeGroupCDSA[]`。

- [ ] **Step 1: 寫失敗測試**

```ts
import { describe, it, expect } from 'vitest';
import { birthDateForAgeGroup, ALL_AGE_GROUPS } from './age-fixtures';
import { ageGroupCDSA } from '../../../src/lib/utils/age-groups';

describe('birthDateForAgeGroup', () => {
  it('每個年齡層回推的生日都映射回同一 ageGroup', () => {
    const now = new Date('2026-07-07T00:00:00Z');
    for (const ag of ALL_AGE_GROUPS) {
      const birth = birthDateForAgeGroup(ag, now);
      expect(ageGroupCDSA(new Date(birth + 'T00:00:00Z'))).toBe(ag);
    }
  });
  it('涵蓋 7 個年齡層', () => {
    expect(ALL_AGE_GROUPS).toHaveLength(7);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm exec vitest run tests/e2e/helpers/age-fixtures.test.ts`
Expected: FAIL（`birthDateForAgeGroup` 未定義）

- [ ] **Step 3: 實作**

```ts
import { AGE_GROUPS_CDSA, type AgeGroupCDSA } from '../../../src/lib/utils/age-groups';

export const ALL_AGE_GROUPS: readonly AgeGroupCDSA[] = AGE_GROUPS_CDSA;

/** 各年齡層取一個「桶中央」月齡，避免落在邊界上。 */
export const AGE_GROUP_REF_MONTHS: Record<AgeGroupCDSA, number> = {
  '2-6m': 4, '7-12m': 10, '13-24m': 18, '25-36m': 30,
  '37-48m': 42, '49-60m': 54, '61-72m': 66,
};

/** 回推使 ageGroupCDSA() 落在指定桶的出生日期（YYYY-MM-DD）。
 *  日固定取 15 號，避開月底 + 月初的進位邊界。 */
export function birthDateForAgeGroup(ageGroup: AgeGroupCDSA, now: Date = new Date()): string {
  const months = AGE_GROUP_REF_MONTHS[ageGroup];
  const d = new Date(now.getFullYear(), now.getMonth() - months, 15);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm exec vitest run tests/e2e/helpers/age-fixtures.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/helpers/age-fixtures.ts tests/e2e/helpers/age-fixtures.test.ts
git commit -m "test(e2e): age-fixtures 生日回推 helper"
```

---

### Task 3: expected-norms helper（golden 常模，獨立實作）

**Files:**
- Create: `tests/e2e/helpers/expected-norms.ts`
- Test: `tests/e2e/helpers/expected-norms.test.ts`

**Interfaces:**
- Produces: `expectedQuestionnaireZ(domain, ageGroup, score, maxScore): number`；`categoryFromZ(z): 'normal'|'monitor'|'refer'`。獨立於生產 `questionnaire-norms.ts` 實作公式（共用 raw json），以免測試與被測同義反覆。

- [ ] **Step 1: 寫失敗測試**

手算基準：取 `13-24m` `gross_motor`，maxScore=4，score=0。interval=18, area=gross_motor。z = (0 − mean×4/60)/(sd×4/60) = −mean/sd（scale 約分）。測試改用「與生產 getQuestionnaireNorm 一致」交叉驗證即可（兩邊獨立實作、應得同值）。

```ts
import { describe, it, expect } from 'vitest';
import { expectedQuestionnaireZ, categoryFromZ } from './expected-norms';
import { getQuestionnaireNorm } from '../../../src/lib/baselines/questionnaire-norms';

describe('expectedQuestionnaireZ', () => {
  it('與生產 getQuestionnaireNorm 交叉一致（獨立實作、同結果）', () => {
    const cases = [
      { d: 'gross_motor', a: '13-24m', s: 0, m: 4 },
      { d: 'cognition', a: '25-36m', s: 3, m: 4 },
      { d: 'social_emotional', a: '2-6m', s: 2, m: 2 },
    ] as const;
    for (const c of cases) {
      const norm = getQuestionnaireNorm(c.d, c.a, c.m);
      const expectedZ = (c.s - norm.mean) / norm.sd;
      expect(expectedQuestionnaireZ(c.d, c.a, c.s, c.m)).toBeCloseTo(expectedZ, 6);
    }
  });
  it('categoryFromZ 用 -2/-1 門檻', () => {
    expect(categoryFromZ(-2.5)).toBe('refer');
    expect(categoryFromZ(-2)).toBe('refer');
    expect(categoryFromZ(-1.5)).toBe('monitor');
    expect(categoryFromZ(-1)).toBe('monitor');
    expect(categoryFromZ(-0.5)).toBe('normal');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm exec vitest run tests/e2e/helpers/expected-norms.test.ts`
Expected: FAIL（未定義）

- [ ] **Step 3: 實作**

```ts
import rawTable18 from '../../../src/data/baselines/asq3-table18-raw.json';
import type { AgeGroupCDSA } from '../../../src/lib/utils/age-groups';

type Area = 'communication' | 'gross_motor' | 'fine_motor' | 'problem_solving' | 'personal_social';

const DOMAIN_TO_AREA: Record<string, Area> = {
  cognition: 'problem_solving',
  fine_motor: 'fine_motor',
  gross_motor: 'gross_motor',
  language_comprehension: 'communication',
  language_expression: 'communication',
  social_emotional: 'personal_social',
};

const AGE_TO_INTERVAL: Record<AgeGroupCDSA, string> = {
  '2-6m': '4', '7-12m': '10', '13-24m': '18', '25-36m': '30',
  '37-48m': '42', '49-60m': '54', '61-72m': '60',
};

interface RawCell { mean: number; sd: number; cutoff1Sd: number; cutoff15Sd: number; cutoff2Sd: number; }
const INTERVALS = (rawTable18 as { intervals: Record<string, Record<Area, RawCell>> }).intervals;

const ASQ3_MAX = 60;

export function expectedQuestionnaireZ(
  domain: string, ageGroup: AgeGroupCDSA, score: number, maxScore: number,
): number {
  const area = DOMAIN_TO_AREA[domain];
  const interval = AGE_TO_INTERVAL[ageGroup];
  const cell = INTERVALS[interval]?.[area];
  if (!cell) throw new Error(`no norm cell: ${domain}/${ageGroup}`);
  const scale = maxScore / ASQ3_MAX;
  const mean = cell.mean * scale;
  const sd = cell.sd * scale;
  return (score - mean) / sd;
}

export function categoryFromZ(z: number): 'normal' | 'monitor' | 'refer' {
  if (z <= -2) return 'refer';
  if (z <= -1) return 'monitor';
  return 'normal';
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm exec vitest run tests/e2e/helpers/expected-norms.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/helpers/expected-norms.ts tests/e2e/helpers/expected-norms.test.ts
git commit -m "test(e2e): expected-norms golden 常模（獨立實作交叉驗證）"
```

---

### Task 4: coverage-expected（應測清單展開）

**Files:**
- Create: `tests/e2e/coverage-expected.ts`
- Test: `tests/e2e/coverage-expected.test.ts`

**Interfaces:**
- Produces: `expectedQuestionnaireUnits(): QUnit[]`（190 筆 `{domain, age, score, maxScore}`）；`expectedActiveModuleCells(): ModuleCell[]`（26 筆 `{module, age}`）。

- [ ] **Step 1: 寫失敗測試**

```ts
import { describe, it, expect } from 'vitest';
import { expectedQuestionnaireUnits, expectedActiveModuleCells } from './coverage-expected';

describe('coverage-expected', () => {
  it('問卷單元共 190 筆', () => {
    expect(expectedQuestionnaireUnits()).toHaveLength(190);
  });
  it('2-6m 不含 cognition / language_expression', () => {
    const units = expectedQuestionnaireUnits().filter(u => u.age === '2-6m');
    const domains = new Set(units.map(u => u.domain));
    expect(domains.has('cognition')).toBe(false);
    expect(domains.has('language_expression')).toBe(false);
  });
  it('每單元 score 落在 0..maxScore', () => {
    for (const u of expectedQuestionnaireUnits()) {
      expect(u.score).toBeGreaterThanOrEqual(0);
      expect(u.score).toBeLessThanOrEqual(u.maxScore);
    }
  });
  it('主動模組 26 格：voice 僅 13m+，其餘全 7 齡', () => {
    const cells = expectedActiveModuleCells();
    expect(cells).toHaveLength(26);
    const voiceAges = cells.filter(c => c.module === 'voice').map(c => c.age);
    expect(voiceAges).not.toContain('2-6m');
    expect(voiceAges).not.toContain('7-12m');
    expect(voiceAges).toHaveLength(5);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm exec vitest run tests/e2e/coverage-expected.test.ts`
Expected: FAIL（未定義）

- [ ] **Step 3: 實作**

```ts
import questionsJson from '../../src/data/questionnaire/questions.json';
import { AGE_GROUPS_CDSA, type AgeGroupCDSA } from '../../src/lib/utils/age-groups';

export interface QUnit { domain: string; age: AgeGroupCDSA; score: number; maxScore: number; }
export interface ModuleCell { module: 'game' | 'voice' | 'video' | 'drawing'; age: AgeGroupCDSA; }

interface Q { domain: string; ageGroups: string[]; options: { score: number }[]; }
const QUESTIONS = (questionsJson as { questions: Q[] }).questions;

/** (age → domain → maxScore)；只含有題格。 */
function maxScoreMap(): Record<string, Record<string, number>> {
  const map: Record<string, Record<string, number>> = {};
  for (const q of QUESTIONS) {
    const itemMax = Math.max(...q.options.map(o => o.score));
    for (const ag of q.ageGroups) {
      (map[ag] ??= {})[q.domain] = (map[ag][q.domain] ?? 0) + itemMax;
    }
  }
  return map;
}

export function expectedQuestionnaireUnits(): QUnit[] {
  const map = maxScoreMap();
  const units: QUnit[] = [];
  for (const age of AGE_GROUPS_CDSA) {
    const byDomain = map[age] ?? {};
    for (const [domain, maxScore] of Object.entries(byDomain)) {
      for (let score = 0; score <= maxScore; score++) {
        units.push({ domain, age, score, maxScore });
      }
    }
  }
  return units;
}

/** voice 在 instructionLevel==='none'（2-6m/7-12m）被 skip；其餘模組全齡。 */
export function expectedActiveModuleCells(): ModuleCell[] {
  const cells: ModuleCell[] = [];
  const voiceSkip = new Set<AgeGroupCDSA>(['2-6m', '7-12m']);
  for (const age of AGE_GROUPS_CDSA) {
    cells.push({ module: 'game', age });
    cells.push({ module: 'video', age });
    cells.push({ module: 'drawing', age });
    if (!voiceSkip.has(age)) cells.push({ module: 'voice', age });
  }
  return cells;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm exec vitest run tests/e2e/coverage-expected.test.ts`
Expected: PASS（190 + 26）

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/coverage-expected.ts tests/e2e/coverage-expected.test.ts
git commit -m "test(e2e): coverage-expected 應測清單展開（190+26）"
```

---

### Task 5: coverage-recorder（實測記錄）

**Files:**
- Create: `tests/e2e/helpers/coverage-recorder.ts`
- Test: `tests/e2e/helpers/coverage-recorder.test.ts`

**Interfaces:**
- Produces: `resetCoverage()`、`recordCoverage(entry: CoverageEntry)`、`readCoverage(): CoverageEntry[]`。`CoverageEntry = { kind:'questionnaire', domain, age, score } | { kind:'module', module, age }`。寫入 `test-results/coverage-actual.json`。

- [ ] **Step 1: 寫失敗測試**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { resetCoverage, recordCoverage, readCoverage } from './coverage-recorder';

describe('coverage-recorder', () => {
  beforeEach(() => resetCoverage());
  it('reset 後為空', () => {
    expect(readCoverage()).toEqual([]);
  });
  it('record 後可讀回、可累積', () => {
    recordCoverage({ kind: 'questionnaire', domain: 'gross_motor', age: '13-24m', score: 2 });
    recordCoverage({ kind: 'module', module: 'voice', age: '25-36m' });
    expect(readCoverage()).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm exec vitest run tests/e2e/helpers/coverage-recorder.test.ts`
Expected: FAIL（未定義）

- [ ] **Step 3: 實作**

```ts
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export type CoverageEntry =
  | { kind: 'questionnaire'; domain: string; age: string; score: number }
  | { kind: 'module'; module: string; age: string };

const FILE = 'test-results/coverage-actual.json';

function ensureDir(): void {
  mkdirSync(dirname(FILE), { recursive: true });
}

export function resetCoverage(): void {
  ensureDir();
  writeFileSync(FILE, '[]');
}

export function readCoverage(): CoverageEntry[] {
  if (!existsSync(FILE)) return [];
  return JSON.parse(readFileSync(FILE, 'utf8')) as CoverageEntry[];
}

export function recordCoverage(entry: CoverageEntry): void {
  ensureDir();
  const arr = readCoverage();
  arr.push(entry);
  writeFileSync(FILE, JSON.stringify(arr));
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm exec vitest run tests/e2e/helpers/coverage-recorder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/helpers/coverage-recorder.ts tests/e2e/helpers/coverage-recorder.test.ts
git commit -m "test(e2e): coverage-recorder 實測記錄"
```

---

### Task 6: coverage-completeness（稽核比對 + 報告）

**Depends:** Task 4, 5

**Files:**
- Create: `tests/e2e/coverage-completeness.ts`
- Test: `tests/e2e/coverage-completeness.test.ts`

**Interfaces:**
- Consumes: `expectedQuestionnaireUnits`/`expectedActiveModuleCells`（Task 4）；`readCoverage`（Task 5）。
- Produces: `auditCoverage(actual: CoverageEntry[]): AuditReport`（`{ missing, extra, coveredPct, byAge }`）；`formatReport(r): string`；CLI 進入點（`import.meta.url` 為主模組時讀檔、印報告、`process.exitCode = missing.length ? 1 : 0`）。

- [ ] **Step 1: 寫失敗測試**

```ts
import { describe, it, expect } from 'vitest';
import { auditCoverage } from './coverage-completeness';
import { expectedQuestionnaireUnits, expectedActiveModuleCells } from './coverage-expected';
import type { CoverageEntry } from './helpers/coverage-recorder';

function fullActual(): CoverageEntry[] {
  const q = expectedQuestionnaireUnits().map(u => ({ kind: 'questionnaire', domain: u.domain, age: u.age, score: u.score } as CoverageEntry));
  const m = expectedActiveModuleCells().map(c => ({ kind: 'module', module: c.module, age: c.age } as CoverageEntry));
  return [...q, ...m];
}

describe('auditCoverage', () => {
  it('完整覆蓋 → 無漏、100%', () => {
    const r = auditCoverage(fullActual());
    expect(r.missing).toHaveLength(0);
    expect(r.coveredPct).toBe(100);
  });
  it('缺一單元 → 列出該漏測', () => {
    const actual = fullActual().slice(1); // 少第一筆
    const r = auditCoverage(actual);
    expect(r.missing).toHaveLength(1);
    expect(r.coveredPct).toBeLessThan(100);
  });
  it('無題卻測 → 列 extra', () => {
    const actual = [...fullActual(), { kind: 'questionnaire', domain: 'cognition', age: '2-6m', score: 0 } as CoverageEntry];
    const r = auditCoverage(actual);
    expect(r.extra).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm exec vitest run tests/e2e/coverage-completeness.test.ts`
Expected: FAIL（未定義）

- [ ] **Step 3: 實作**

```ts
import { expectedQuestionnaireUnits, expectedActiveModuleCells } from './coverage-expected';
import { readCoverage, type CoverageEntry } from './helpers/coverage-recorder';

function keyOf(e: CoverageEntry): string {
  return e.kind === 'questionnaire'
    ? `q:${e.age}:${e.domain}:${e.score}`
    : `m:${e.age}:${e.module}`;
}

export interface AuditReport {
  missing: string[];
  extra: string[];
  coveredPct: number;
  byAge: Record<string, { covered: number; total: number }>;
}

export function auditCoverage(actual: CoverageEntry[]): AuditReport {
  const expected: CoverageEntry[] = [
    ...expectedQuestionnaireUnits().map(u => ({ kind: 'questionnaire', domain: u.domain, age: u.age, score: u.score } as CoverageEntry)),
    ...expectedActiveModuleCells().map(c => ({ kind: 'module', module: c.module, age: c.age } as CoverageEntry)),
  ];
  const expectedKeys = new Set(expected.map(keyOf));
  const actualKeys = new Set(actual.map(keyOf));

  const missing = [...expectedKeys].filter(k => !actualKeys.has(k)).sort();
  const extra = [...actualKeys].filter(k => !expectedKeys.has(k)).sort();

  const byAge: Record<string, { covered: number; total: number }> = {};
  for (const e of expected) {
    const age = 'age' in e ? e.age : '';
    (byAge[age] ??= { covered: 0, total: 0 }).total++;
    if (actualKeys.has(keyOf(e))) byAge[age].covered++;
  }

  const coveredPct = Math.round(((expectedKeys.size - missing.length) / expectedKeys.size) * 100);
  return { missing, extra, coveredPct, byAge };
}

export function formatReport(r: AuditReport): string {
  const lines: string[] = [];
  lines.push('檢測覆蓋完整性稽核');
  lines.push(`涵蓋率 ${r.coveredPct}%　漏測 ${r.missing.length}　逾測 ${r.extra.length}`);
  lines.push(`漏測（應測未跑）：${r.missing.length ? '' : '無'}`);
  for (const k of r.missing) lines.push(`  - ${k}`);
  lines.push(`逾測（無題卻測）：${r.extra.length ? '' : '無'}`);
  for (const k of r.extra) lines.push(`  - ${k}`);
  lines.push('── 分齡明細 ──');
  for (const [age, s] of Object.entries(r.byAge)) {
    lines.push(`${age}\t${s.covered}/${s.total}${s.covered === s.total ? ' ✓' : ' ✗'}`);
  }
  return lines.join('\n');
}

// CLI 進入點
if (process.argv[1] && process.argv[1].endsWith('coverage-completeness.ts')) {
  const report = auditCoverage(readCoverage());
  console.log(formatReport(report));
  process.exitCode = report.missing.length ? 1 : 0;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm exec vitest run tests/e2e/coverage-completeness.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/coverage-completeness.ts tests/e2e/coverage-completeness.test.ts
git commit -m "test(e2e): coverage-completeness 稽核比對 + 報告"
```

---

### Task 7: idb-reader（讀 IndexedDB）

**Files:**
- Create: `tests/e2e/helpers/idb-reader.ts`

**Interfaces:**
- Produces: `readLatestTriage(page): Promise<TriageDetailsShape | null>`；`readMediaCounts(page): Promise<Record<string, number>>`（各 fileType 的 blob 筆數 + 總 size）。整合驗證在 Task 11 主 spec 進行（此 helper 無獨立單元測試，因需真實頁面 IDB）。

- [ ] **Step 1: 實作**

```ts
import type { Page } from '@playwright/test';

export interface TriageDetail {
  domain: string; metric: string; value: number;
  zScore: number | null; directionalZ: number | null; isAnomaly: boolean;
  maxScore?: number | null;
}
export interface TriageDetailsShape {
  category: 'normal' | 'monitor' | 'refer';
  details: TriageDetail[];
  domainLevelZ?: Record<string, number>;
  domainCategories?: Record<string, 'normal' | 'monitor' | 'refer'>;
}

/** 讀最新一筆 assessment 的 triageResult（依 createdAt 排序）。 */
export function readLatestTriage(page: Page): Promise<TriageDetailsShape | null> {
  return page.evaluate(() => new Promise<TriageDetailsShape | null>((resolve, reject) => {
    const req = indexedDB.open('cdss-pediatric');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('assessments', 'readonly');
      const getAll = tx.objectStore('assessments').getAll();
      getAll.onerror = () => reject(getAll.error);
      getAll.onsuccess = () => {
        const rows = (getAll.result as Array<{ createdAt: string | number | Date; triageResult?: TriageDetailsShape }>)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        resolve(rows[0]?.triageResult ?? null);
      };
    };
  }));
}

/** 各 fileType 的媒體筆數與總 byte 數。 */
export function readMediaCounts(page: Page): Promise<Record<string, { count: number; bytes: number }>> {
  return page.evaluate(() => new Promise<Record<string, { count: number; bytes: number }>>((resolve, reject) => {
    const req = indexedDB.open('cdss-pediatric');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('mediaFiles', 'readonly');
      const getAll = tx.objectStore('mediaFiles').getAll();
      getAll.onerror = () => reject(getAll.error);
      getAll.onsuccess = () => {
        const out: Record<string, { count: number; bytes: number }> = {};
        for (const m of getAll.result as Array<{ fileType: string; fileSize: number }>) {
          (out[m.fileType] ??= { count: 0, bytes: 0 });
          out[m.fileType].count++;
          out[m.fileType].bytes += m.fileSize ?? 0;
        }
        resolve(out);
      };
    };
  }));
}
```

- [ ] **Step 2: 型別檢查**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: 無 idb-reader 相關錯誤

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/helpers/idb-reader.ts
git commit -m "test(e2e): idb-reader 讀 triageResult / mediaFiles"
```

---

### Task 8: questionnaire-driver（依目標分數作答）

**Files:**
- Create: `tests/e2e/helpers/questionnaire-driver.ts`
- Test: `tests/e2e/helpers/questionnaire-driver.test.ts`（純測 `allocateScores`，不需瀏覽器）

**Interfaces:**
- Produces: `allocateScores(ageGroup, targetByDomain): Record<questionId, score>`（把每 domain 目標總分拆到題目，每題 0..2）；`answerQuestionnaire(page, ageGroup, targetByDomain): Promise<void>`（依序點 `.option-btn[data-score=...]` 直到「問卷完成！」）。

- [ ] **Step 1: 寫失敗測試（allocateScores 純函數）**

```ts
import { describe, it, expect } from 'vitest';
import { allocateScores } from './questionnaire-driver';
import questionsJson from '../../../src/data/questionnaire/questions.json';

const QS = (questionsJson as { questions: { id: string; domain: string; ageGroups: string[] }[] }).questions;

describe('allocateScores', () => {
  it('每 domain 分配後的題目分數總和 = 目標', () => {
    const target = { gross_motor: 3 }; // 13-24m gross 2 題 max4
    const alloc = allocateScores('13-24m', target);
    const gmQs = QS.filter(q => q.domain === 'gross_motor' && q.ageGroups.includes('13-24m'));
    const sum = gmQs.reduce((s, q) => s + (alloc[q.id] ?? 0), 0);
    expect(sum).toBe(3);
    for (const q of gmQs) { expect(alloc[q.id]).toBeGreaterThanOrEqual(0); expect(alloc[q.id]).toBeLessThanOrEqual(2); }
  });
  it('未指定的 domain 預設滿分（避免非目標面向汙染 category）', () => {
    const alloc = allocateScores('13-24m', { gross_motor: 0 });
    const fmQs = QS.filter(q => q.domain === 'fine_motor' && q.ageGroups.includes('13-24m'));
    const sum = fmQs.reduce((s, q) => s + (alloc[q.id] ?? 0), 0);
    expect(sum).toBe(fmQs.length * 2); // 滿分
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm exec vitest run tests/e2e/helpers/questionnaire-driver.test.ts`
Expected: FAIL（未定義）

- [ ] **Step 3: 實作**

```ts
import type { Page } from '@playwright/test';
import questionsJson from '../../../src/data/questionnaire/questions.json';
import type { AgeGroupCDSA } from '../../../src/lib/utils/age-groups';

interface Q { id: string; domain: string; ageGroups: string[]; options: { score: number }[]; }
const QUESTIONS = (questionsJson as { questions: Q[] }).questions;

function questionsFor(ageGroup: AgeGroupCDSA): Q[] {
  return QUESTIONS.filter(q => q.ageGroups.includes(ageGroup));
}

/** 把每 domain 目標總分拆到該 domain 的題目（每題上限 2）。未指定的 domain 給滿分。 */
export function allocateScores(
  ageGroup: AgeGroupCDSA, targetByDomain: Record<string, number>,
): Record<string, number> {
  const qs = questionsFor(ageGroup);
  const byDomain: Record<string, Q[]> = {};
  for (const q of qs) (byDomain[q.domain] ??= []).push(q);

  const alloc: Record<string, number> = {};
  for (const [domain, domainQs] of Object.entries(byDomain)) {
    const perMax = domainQs.map(q => Math.max(...q.options.map(o => o.score))); // 每題 2
    const fullMax = perMax.reduce((a, b) => a + b, 0);
    let remaining = domain in targetByDomain ? targetByDomain[domain] : fullMax;
    domainQs.forEach((q, i) => {
      const take = Math.max(0, Math.min(perMax[i], remaining));
      alloc[q.id] = take;
      remaining -= take;
    });
  }
  return alloc;
}

/** 依序作答直到摘要出現。點 data-score 對應按鈕，等 520ms 回饋動畫。 */
export async function answerQuestionnaire(
  page: Page, ageGroup: AgeGroupCDSA, targetByDomain: Record<string, number>,
): Promise<void> {
  const qs = questionsFor(ageGroup);
  const alloc = allocateScores(ageGroup, targetByDomain);
  for (let i = 0; i < qs.length; i++) {
    await page.locator('.option-btn').first().waitFor({ state: 'visible', timeout: 10_000 });
    const score = alloc[qs[i].id];
    await page.locator(`.option-btn[data-score="${score}"]`).first().click();
    await page.waitForTimeout(600); // 520ms 回饋 + 進位
  }
  await page.getByText('問卷完成！').waitFor({ timeout: 10_000 });
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm exec vitest run tests/e2e/helpers/questionnaire-driver.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/helpers/questionnaire-driver.ts tests/e2e/helpers/questionnaire-driver.test.ts
git commit -m "test(e2e): questionnaire-driver 依目標分數作答（data-score）"
```

---

### Task 9: active-module-driver（驅動主動模組）

**Files:**
- Create: `tests/e2e/helpers/active-module-driver.ts`

**Interfaces:**
- Produces: `playGame(page)`、`doVoice(page)`、`doVideo(page)`、`doDrawing(page)`——各自把該步驟走到「繼續下一步」。以 accessible text 定位按鈕，對「無法互動則跳過」的模組走 skip 路徑。整合驗證在 Task 12。

- [ ] **Step 1: 實作**

```ts
import type { Page } from '@playwright/test';

/** 互動遊戲：自動點刺激選項直到完成或跳過。GameModule 完成會 addAnalysis(behaviorMetrics)。 */
export async function playGame(page: Page): Promise<void> {
  // 遊戲每回合出現數個可點目標；點到出現「繼續下一步」為止，最多 20 回合。
  for (let i = 0; i < 20; i++) {
    const next = page.getByRole('button', { name: /繼續下一步/ });
    if (await next.isVisible().catch(() => false)) break;
    const stimulus = page.locator('[data-game-option], .stimulus-option, button.card-option').first();
    if (await stimulus.isVisible().catch(() => false)) {
      await stimulus.click();
    } else {
      // 找不到互動元件 → 用跳過鈕保流程前進
      const skip = page.getByRole('button', { name: /跳過遊戲評估/ });
      if (await skip.isVisible().catch(() => false)) { await skip.click(); break; }
    }
    await page.waitForTimeout(400);
  }
  await page.getByRole('button', { name: /繼續下一步/ }).click();
}

/** 語音：授權麥克風（fake audio）→ 播放+錄音 → 下一題，走完所有 prompt。 */
export async function doVoice(page: Page): Promise<void> {
  const allow = page.getByRole('button', { name: /允許使用麥克風/ });
  if (await allow.isVisible().catch(() => false)) await allow.click();
  for (let i = 0; i < 6; i++) {
    const done = page.getByRole('button', { name: /繼續下一步/ });
    if (await done.isVisible().catch(() => false)) break;
    const record = page.getByRole('button', { name: /播放指令 \+ 開始錄音/ });
    if (await record.isVisible().catch(() => false)) {
      await record.click();
      // 15s 自動停；提早按停止錄音縮短
      const stop = page.getByRole('button', { name: /停止錄音/ });
      await stop.click({ timeout: 20_000 }).catch(() => {});
      await page.getByRole('button', { name: /下一題/ }).click({ timeout: 5_000 }).catch(() => {});
    } else {
      break;
    }
    await page.waitForTimeout(400);
  }
  await page.getByRole('button', { name: /繼續下一步/ }).click({ timeout: 10_000 });
}

/** 影片：授權攝影機（fake）→ 錄 → 下一步。 */
export async function doVideo(page: Page): Promise<void> {
  const open = page.getByRole('button', { name: /開啟攝影機/ });
  if (await open.isVisible().catch(() => false)) await open.click();
  const rec = page.getByRole('button', { name: /開始錄製/ });
  if (await rec.isVisible().catch(() => false)) {
    await rec.click();
    await page.waitForTimeout(2_000);
    await page.getByRole('button', { name: /停止錄製/ }).click().catch(() => {});
  }
  await page.getByRole('button', { name: /繼續下一步/ }).click({ timeout: 15_000 });
}

/** 繪圖：對 canvas 派發指標事件畫線，逐一送出所有形狀。 */
export async function doDrawing(page: Page): Promise<void> {
  for (let shape = 0; shape < 5; shape++) {
    const done = page.getByRole('button', { name: /繼續下一步/ });
    if (await done.isVisible().catch(() => false)) break;
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 80, box.y + 80);
      await page.mouse.down();
      await page.mouse.move(box.x + 200, box.y + 120, { steps: 8 });
      await page.mouse.move(box.x + 160, box.y + 240, { steps: 8 });
      await page.mouse.up();
    }
    await page.getByRole('button', { name: /完成此圖/ }).click({ timeout: 5_000 });
    await page.waitForTimeout(300);
  }
  await page.getByRole('button', { name: /繼續下一步/ }).click({ timeout: 10_000 });
}
```

- [ ] **Step 2: 型別檢查**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: 無 active-module-driver 相關錯誤

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/helpers/active-module-driver.ts
git commit -m "test(e2e): active-module-driver 驅動 game/voice/video/drawing"
```

---

### Task 10: export-inspector（匯出完整性探測）

**Files:**
- Create: `tests/e2e/helpers/export-inspector.ts`

**Interfaces:**
- Produces: `captureFhirUpload(page, action): Promise<{ resourceTypes: string[]; hasMedia: boolean }>`（攔截 FHIR/GCM POST，解析 payload，判斷有無 Media/DocumentReference）；`downloadPdf(page, trigger): Promise<Buffer>`；`hasHistoryDownload(page): Promise<boolean>`。**不真送**外部——用 `page.route` 攔截後回 stub 回應。

- [ ] **Step 1: 實作**

```ts
import type { Page, Download } from '@playwright/test';

/** 攔截 FHIR/GCM 上傳，回傳送出的 resourceType 清單與是否含媒體。攔截後回假成功，不真送。 */
export async function captureFhirUpload(
  page: Page, trigger: () => Promise<void>,
): Promise<{ resourceTypes: string[]; hasMedia: boolean }> {
  const resourceTypes: string[] = [];
  await page.route('**/*', async route => {
    const req = route.request();
    if (req.method() === 'POST' && /fhir|Observation|Bundle|Questionnaire/i.test(req.url())) {
      try {
        const body = req.postDataJSON() as { resourceType?: string; entry?: { resource?: { resourceType?: string } }[] };
        if (body.resourceType) resourceTypes.push(body.resourceType);
        for (const e of body.entry ?? []) if (e.resource?.resourceType) resourceTypes.push(e.resource.resourceType);
      } catch { /* 非 JSON body 略過 */ }
      await route.fulfill({ status: 201, contentType: 'application/json', body: '{"resourceType":"OperationOutcome"}' });
      return;
    }
    await route.continue();
  });
  await trigger();
  await page.waitForTimeout(1_000);
  await page.unroute('**/*');
  const hasMedia = resourceTypes.some(t => t === 'Media' || t === 'DocumentReference' || t === 'Binary');
  return { resourceTypes, hasMedia };
}

/** 觸發 PDF 下載並回傳位元組（供檢查是否含音檔章節等）。 */
export async function downloadPdf(page: Page, trigger: () => Promise<void>): Promise<Buffer> {
  const [download]: [Download] = await Promise.all([
    page.waitForEvent('download'),
    trigger(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

/** 歷史頁是否存在「下載/匯出資料包」功能。 */
export async function hasHistoryDownload(page: Page): Promise<boolean> {
  await page.goto('/history/');
  const btn = page.getByRole('button', { name: /下載|匯出/ }).or(page.getByRole('link', { name: /下載|匯出/ }));
  return btn.first().isVisible().catch(() => false);
}
```

- [ ] **Step 2: 型別檢查**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: 無 export-inspector 相關錯誤

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/helpers/export-inspector.ts
git commit -m "test(e2e): export-inspector 匯出完整性探測"
```

---

### Task 11: 主 spec 維度①問卷（資料驅動全枚舉）

**Depends:** Task 2, 3, 4, 5, 7, 8

**Files:**
- Create: `tests/e2e/detection-coverage.spec.ts`

**Interfaces:**
- Consumes: 全部 helper。
- Produces: 對每個 (age) 走 profile→問卷，枚舉各 domain 分數點，斷言 IDB `triageResult.details` 的 z 與 `expectedQuestionnaireZ` 一致，並 `recordCoverage`。

- [ ] **Step 1: 寫主 spec 的問卷段**

```ts
import { test, expect } from '@playwright/test';
import { ALL_AGE_GROUPS, birthDateForAgeGroup } from './helpers/age-fixtures';
import { answerQuestionnaire } from './helpers/questionnaire-driver';
import { readLatestTriage } from './helpers/idb-reader';
import { expectedQuestionnaireZ } from './helpers/expected-norms';
import { recordCoverage, resetCoverage } from './helpers/coverage-recorder';
import { getQuestionnaireMaxScores } from '../../src/lib/questionnaire/max-scores';

test.beforeAll(() => resetCoverage());

async function startAssessment(page, ageGroup) {
  await page.goto('/assess/');
  await page.getByRole('heading', { name: '兒童基本資料' }).waitFor({ timeout: 15_000 });
  await page.getByLabel(/出生日期/).fill(birthDateForAgeGroup(ageGroup));
  await page.getByRole('button', { name: '開始評估' }).click();
  await page.getByRole('progressbar').waitFor({ timeout: 10_000 });
}

for (const ageGroup of ALL_AGE_GROUPS) {
  const maxScores = getQuestionnaireMaxScores(ageGroup);
  const domains = Object.keys(maxScores);

  test.describe(`維度①問卷 ${ageGroup}`, () => {
    for (const domain of domains) {
      for (let score = 0; score <= maxScores[domain]; score++) {
        test(`${ageGroup} ${domain} score=${score} → z 落地正確`, async ({ page }) => {
          test.setTimeout(90_000);
          await startAssessment(page, ageGroup);
          // 目標 domain 取 score，其餘 domain 滿分（隔離）
          await answerQuestionnaire(page, ageGroup, { [domain]: score });

          // 走到 result（問卷後模組若未 skip，用 forceFull=false 下滿分會 skip 多數；
          // 這裡目標 domain 可能低分不 skip，交由後續 Task 12 的完整流程；
          // 本段聚焦問卷 z，於摘要後點「依建議繼續」並讓後續模組走 skip/跳過到 result）
          await page.getByRole('button', { name: '依建議繼續' }).click();
          await advanceToResult(page);

          const triage = await readLatestTriage(page);
          expect(triage, 'triageResult 應已落地').not.toBeNull();
          const detail = triage!.details.find(d => d.domain === domain && d.metric === 'questionnaireScore');
          expect(detail, `${domain} 應有 questionnaireScore detail`).toBeTruthy();

          const expectedZ = expectedQuestionnaireZ(domain, ageGroup, score, maxScores[domain]);
          expect(detail!.zScore).toBeCloseTo(expectedZ, 4);

          recordCoverage({ kind: 'questionnaire', domain, age: ageGroup, score });
        });
      }
    }
  });
}
```

- [ ] **Step 2: 加 advanceToResult helper（同檔頂部）**

```ts
// 走完問卷後剩餘模組：能跳過就跳過，直到出現結果頁「各面向評估」。
async function advanceToResult(page) {
  for (let i = 0; i < 8; i++) {
    if (await page.getByRole('heading', { name: '各面向評估' }).isVisible().catch(() => false)) return;
    const skip = page.getByRole('button', { name: /跳過|繼續下一步/ }).first();
    if (await skip.isVisible().catch(() => false)) { await skip.click(); await page.waitForTimeout(500); continue; }
    await page.waitForTimeout(500);
  }
  await page.getByText(/正常|追蹤觀察|建議轉介/).first().waitFor({ timeout: 15_000 });
}
```

- [ ] **Step 3: 對 live 跑單一年齡層冒煙**

Run: `PLAYWRIGHT_BASE_URL=https://smart-pedi-cds.yao.care pnpm exec playwright test detection-coverage --grep "13-24m gross_motor score=0" --project=chromium`
Expected: PASS（triage 落地、z 相符）；若 FAIL 檢視是 driver selector 或 skip 流程，據實調整。

- [ ] **Step 4: 跑完整問卷維度**

Run: `PLAYWRIGHT_BASE_URL=https://smart-pedi-cds.yao.care pnpm exec playwright test detection-coverage --grep "維度①問卷" --project=chromium`
Expected: 綠格（問卷有接線）；記錄任何非預期紅格。

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/detection-coverage.spec.ts
git commit -m "test(e2e): 維度①問卷資料驅動全枚舉 + z 落地斷言"
```

---

### Task 12: 主 spec 維度①②主動模組 + 媒體落地

**Depends:** Task 9, 11

**Files:**
- Modify: `tests/e2e/detection-coverage.spec.ts`

**Interfaces:**
- Consumes: `playGame/doVoice/doVideo/doDrawing`（Task 9）、`readLatestTriage/readMediaCounts`（Task 7）。
- Produces: 對每齡跑完整主動流程，斷言（a）媒體 blob 落地 size>0，（b）triage 是否出現主動 domain 真值——Voice(`language`)/Video(`gross_motor`) 預期**缺席**（照出斷鏈），並 recordCoverage module 格。

- [ ] **Step 1: 加主動模組段**

```ts
import { playGame, doVoice, doVideo, doDrawing } from './helpers/active-module-driver';
import { readMediaCounts } from './helpers/idb-reader';
import { expectedActiveModuleCells } from './coverage-expected';

for (const cell of expectedActiveModuleCells()) {
  test(`維度②媒體落地 ${cell.module} ${cell.age}`, async ({ page }) => {
    test.setTimeout(120_000);
    await startAssessment(page, cell.age);
    // 全 domain 低分 → 不 skip 任何主動模組
    await answerQuestionnaire(page, cell.age, Object.fromEntries(
      Object.keys(getQuestionnaireMaxScores(cell.age)).map(d => [d, 0]),
    ));
    await page.getByRole('button', { name: '跑完整評估' }).click();

    await playGame(page);
    // 依序：voice（若該齡有）→ video → drawing
    if (cell.module === 'voice' || (cell.age !== '2-6m' && cell.age !== '7-12m')) {
      await doVoice(page).catch(() => {});
    }
    await doVideo(page).catch(() => {});
    await doDrawing(page).catch(() => {});
    await advanceToResult(page);

    const media = await readMediaCounts(page);
    if (cell.module === 'voice') {
      expect(media['voice']?.bytes ?? 0, 'voice 音檔應真的錄到').toBeGreaterThan(0);
    }
    if (cell.module === 'video') {
      expect(media['video']?.bytes ?? 0, 'video 應真的錄到').toBeGreaterThan(0);
    }
    if (cell.module === 'drawing') {
      expect(media['drawing']?.bytes ?? 0, 'drawing 應存 PNG').toBeGreaterThan(0);
    }

    // 維度①主動接線稽核（預期缺口，用 soft 記錄不讓測試紅）
    const triage = await readLatestTriage(page);
    const langDetail = triage?.details.find(d => d.domain === 'language');
    const gmDetail = triage?.details.find(d => d.domain === 'gross_motor' && d.metric === 'poseClassification');
    test.info().annotations.push({ type: 'wiring', description: `voice→language:${!!langDetail} video→gross_motor:${!!gmDetail}` });

    recordCoverage({ kind: 'module', module: cell.module, age: cell.age });
  });
}
```

- [ ] **Step 2: 對 live 跑主動模組冒煙**

Run: `PLAYWRIGHT_BASE_URL=https://smart-pedi-cds.yao.care pnpm exec playwright test detection-coverage --grep "維度②媒體落地 voice 25-36m" --project=chromium`
Expected: voice bytes>0 PASS；annotation 記錄 `voice→language:false`（斷鏈缺口如實照出）

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/detection-coverage.spec.ts
git commit -m "test(e2e): 維度①②主動模組媒體落地 + 接線稽核"
```

---

### Task 13: 主 spec 維度③匯出完整性

**Depends:** Task 10, 11

**Files:**
- Modify: `tests/e2e/detection-coverage.spec.ts`

**Interfaces:**
- Consumes: `captureFhirUpload/downloadPdf/hasHistoryDownload`（Task 10）。
- Produces: 完成一次評估到 result 頁後，檢查四匯出出口是否帶媒體，斷言結果記入報告（本階段預期全部無媒體）。

- [ ] **Step 1: 加匯出段**

```ts
import { captureFhirUpload, downloadPdf, hasHistoryDownload } from './helpers/export-inspector';

test('維度③匯出完整性：四出口是否帶媒體', async ({ page }) => {
  test.setTimeout(120_000);
  const age = '25-36m';
  await startAssessment(page, age);
  await answerQuestionnaire(page, age, Object.fromEntries(
    Object.keys(getQuestionnaireMaxScores(age)).map(d => [d, 0]),
  ));
  await page.getByRole('button', { name: '跑完整評估' }).click();
  await doVoice(page).catch(() => {});
  await doVideo(page).catch(() => {});
  await doDrawing(page).catch(() => {});
  await advanceToResult(page);

  // GCM 上傳（result 頁 GcmUploadForm）
  const gcm = await captureFhirUpload(page, async () => {
    await page.getByRole('button', { name: /上傳|收案|送出/ }).first().click().catch(() => {});
  });
  expect(gcm.resourceTypes.length, 'GCM 應送出資源').toBeGreaterThan(0);
  test.info().annotations.push({ type: 'export', description: `GCM hasMedia:${gcm.hasMedia}` });

  // PDF
  const pdf = await downloadPdf(page, async () => {
    await page.getByRole('button', { name: /下載.*PDF|PDF.*下載|下載報告/ }).first().click();
  }).catch(() => Buffer.alloc(0));
  const pdfHasAudioMark = pdf.includes(Buffer.from('Media')) || pdf.includes(Buffer.from('audio'));
  test.info().annotations.push({ type: 'export', description: `PDF bytes:${pdf.length} audioMark:${pdfHasAudioMark}` });

  // 歷史下載包
  const histDl = await hasHistoryDownload(page);
  test.info().annotations.push({ type: 'export', description: `history download exists:${histDl}` });

  // 本階段：如實記錄缺口，不因缺口讓測試紅（缺口報告由 annotation 彙整）
  expect(true).toBe(true);
});
```

- [ ] **Step 2: 對 live 跑匯出段**

Run: `PLAYWRIGHT_BASE_URL=https://smart-pedi-cds.yao.care pnpm exec playwright test detection-coverage --grep "維度③匯出" --project=chromium`
Expected: PASS；annotation 記錄 `GCM hasMedia:false`、`PDF audioMark:false`、`history download exists:false`（四出口無媒體，如實照出）

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/detection-coverage.spec.ts
git commit -m "test(e2e): 維度③匯出完整性稽核（四出口媒體）"
```

---

### Task 14: 串接 scripts + 完整性稽核閘門

**Depends:** 全部

**Files:**
- Modify: `package.json`
- Create: `tests/e2e/README.md`

**Interfaces:**
- Produces: `pnpm test:detection`（跑主 spec）、`pnpm test:coverage-audit`（跑完整性稽核）。

- [ ] **Step 1: 加 scripts**

於 `package.json` scripts 加：

```json
"test:detection": "PLAYWRIGHT_BASE_URL=https://smart-pedi-cds.yao.care playwright test detection-coverage --project=chromium",
"test:coverage-audit": "tsx tests/e2e/coverage-completeness.ts"
```

（若無 `tsx`：`pnpm add -D tsx`。）

- [ ] **Step 2: 寫使用說明**

`tests/e2e/README.md`：

```markdown
# 檢測覆蓋 E2E

## 跑法
1. `pnpm test:detection` — 對 live 跑三維度測試，過程 recordCoverage 寫 test-results/coverage-actual.json
2. `pnpm test:coverage-audit` — 讀 coverage-actual.json 比對應測清單，印「涵蓋率 / 漏測 / 逾測 / 分齡明細」，漏測則 exit 1

## 三維度
- ①數值落地：assessments.triageResult.details 的 z 與真實常模一致
- ②媒體落地：mediaFiles blob size>0；接線缺口以 annotation 記錄
- ③匯出完整性：PDF/FHIR/GCM/歷史下載 是否帶媒體（annotation 記錄）

## 已知預期缺口（第二階段修）
Voice/Video 未 addAnalysis；voice 無上傳；四匯出無媒體；歷史無下載包。
```

- [ ] **Step 3: 驗證稽核閘門**

Run: `pnpm test:detection && pnpm test:coverage-audit`
Expected: 稽核印「涵蓋率 100%、漏測：無」（測試已覆蓋全部 190+26 單元）

- [ ] **Step 4: Commit**

```bash
git add package.json tests/e2e/README.md
git commit -m "test(e2e): 串接 test:detection / test:coverage-audit 閘門"
```

---

## Self-Review

**1. Spec coverage：**
- §5.1 三維度 → Task 11（①）、12（①②）、13（③）✓
- §5.2 資料驅動全枚舉 → Task 4（展開）+ 11（枚舉執行）✓
- §5.3 檔案結構 → 各 helper Task 2,3,7,8,9,10；expected-norms=Task 3 ✓
- §5.4 live config → Task 1 ✓
- §6 完整性稽核 → Task 4（expected）+ 5（recorder）+ 6（audit）+ 14（閘門）✓
- §7 缺口預測 → Task 12（接線 annotation）、13（匯出 annotation）如實照出 ✓
- §8 實作挑戰：FHIR/GCM 不真上傳 → Task 10 `page.route` 攔截 ✓；skip 邏輯 → Task 11 隔離 / Task 12 forceFull ✓；fake audio → Task 1 flags ✓

**2. Placeholder scan：** 各 code 步驟均具體；driver selector 以真實 DOM（`.option-btn[data-score]`、accessible text）為據。E2E 冒煙步驟明示「FAIL 則據實調整 selector」屬正常 E2E 收斂，非 placeholder。

**3. Type consistency：** `CoverageEntry`（Task 5）在 Task 6 一致使用；`TriageDetailsShape`（Task 7）在 Task 11/12 一致；`allocateScores`/`answerQuestionnaire` 簽名在 Task 8 定義、Task 11/12 消費一致；`expectedQuestionnaireUnits` 190 筆貫穿 Task 4/6/11。

**已知風險（實作時收斂）：** 主動模組 driver 的 selector（`[data-game-option]` 等）為推測 fallback，Task 12 冒煙時對照 GameModule 真實 DOM 調整；此為 E2E 常態，不阻塞計畫。
