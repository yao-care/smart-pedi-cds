/**
 * IndexedDB v5→v8 upgrade tx 整合測試。
 *
 * v8 重算的目的（延續 v6/v7 的 applyTriageRecomputeUpgrade 機制）：
 *   1. 歷史 voice detail 的 domain 'language' → 'language_expression'——消除雷達上
 *      與問卷 language_comprehension / language_expression 並存的孤立「語言」重複格
 *      （2026-07-09 用戶 dump 59b02781 報告矛盾的根因）。
 *   2. recompute 的 per-domain gating 排除 poseClassification / voiceDuration
 *      （display-only），與 live triage 對齊（此前 recompute 漏排除 pose）。
 *
 * 純函數層（recompute-triage）的 voice 遷移 / gating 排除已由 unit test 覆蓋；
 * 本檔驗證 Dexie upgrade tx 端到端把舊資料實際 migrate 落地。
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { applyTriageRecomputeUpgrade } from '../../../src/lib/db/schema';

const TEST_STORES = {
  children: 'id, createdAt',
  assessments: 'id, childId, status, createdAt, [childId+status]',
};

/** Build a v5→v8 Dexie chain and open it, triggering all upgrade tx in sequence. */
async function openV8TestDb(dbName: string): Promise<Dexie> {
  const db = new Dexie(dbName);
  db.version(5).stores(TEST_STORES);
  db.version(6).stores(TEST_STORES).upgrade(tx => applyTriageRecomputeUpgrade(tx, 'v6'));
  db.version(7).stores(TEST_STORES).upgrade(tx => applyTriageRecomputeUpgrade(tx, 'v7'));
  db.version(8).stores(TEST_STORES).upgrade(tx => applyTriageRecomputeUpgrade(tx, 'v8'));
  await db.open();
  return db;
}

async function seedV5Db(dbName: string, children: object[], assessments: object[]): Promise<void> {
  const v5 = new Dexie(dbName);
  v5.version(5).stores(TEST_STORES);
  await v5.open();
  if (children.length > 0) await v5.table('children').bulkPut(children);
  if (assessments.length > 0) await v5.table('assessments').bulkPut(assessments);
  v5.close();
}

let testDbCounter = 0;
const nextDbName = () => `test-v8-upgrade-${Date.now()}-${++testDbCounter}`;

describe('IndexedDB v5→v8 upgrade tx integration', () => {
  let dbName: string;

  beforeEach(() => {
    dbName = nextDbName();
  });

  it('migrates legacy voice detail domain language → language_expression', async () => {
    await seedV5Db(dbName, [
      { id: 'child-1', birthDate: '2022-03-09', createdAt: new Date('2026-01-01') },
    ], [
      {
        id: 'assess-voice',
        childId: 'child-1',
        status: 'completed',
        completedAt: new Date('2026-07-09T06:34:00Z'),
        createdAt: new Date('2026-07-09T06:20:00Z'),
        triageResult: {
          category: 'refer', confidence: 0.9, summary: '舊文案',
          details: [
            // 語音時長，舊 domain='language'
            { domain: 'language', metric: 'voiceDuration', value: 10, zScore: 0.4, directionalZ: 0.4, isAnomaly: false },
            // 問卷語言表達（嚴重落後）
            { domain: 'language_expression', metric: 'questionnaireScore', value: 2, zScore: -3, directionalZ: -3, maxScore: 20, isAnomaly: true },
          ],
        },
      },
    ]);

    const db = await openV8TestDb(dbName);
    const a = await db.table('assessments').get('assess-voice');

    expect(a.schemaVersion).toBe('v8-recomputed');
    const voice = a.triageResult.details.find((d: { metric: string }) => d.metric === 'voiceDuration');
    expect(voice).toBeDefined();
    expect(voice.domain).toBe('language_expression'); // migrated
    // 不得再有孤立的 'language' domain（雷達重複來源）。
    expect(a.triageResult.details.some((d: { domain: string }) => d.domain === 'language')).toBe(false);
    db.close();
  });

  it('voice does NOT dilute the questionnaire language_expression refer signal', async () => {
    // 用戶 59b02781 情境核心：語言表達問卷 refer，語音正常。遷移後 voice 併入
    // language_expression 顯示，但 gating 排除 voice → 分流判定仍 refer（未稀釋）。
    await seedV5Db(dbName, [
      { id: 'child-2', birthDate: '2022-03-09', createdAt: new Date('2026-01-01') },
    ], [
      {
        id: 'assess-nodilute',
        childId: 'child-2',
        status: 'completed',
        completedAt: new Date('2026-07-09T06:34:00Z'),
        createdAt: new Date('2026-07-09T06:20:00Z'),
        triageResult: {
          category: 'refer', confidence: 0.9, summary: '',
          details: [
            { domain: 'language', metric: 'voiceDuration', value: 10, zScore: 0.4, directionalZ: 0.4, isAnomaly: false },
            { domain: 'language_expression', metric: 'questionnaireScore', value: 2, zScore: -3, directionalZ: -3, maxScore: 20, isAnomaly: true },
          ],
        },
      },
    ]);

    const db = await openV8TestDb(dbName);
    const a = await db.table('assessments').get('assess-nodilute');

    expect(a.triageResult.domainCategories?.language_expression).toBe('refer');
    expect(a.triageResult.category).toBe('refer');
    db.close();
  });

  it('leaves an already-correct assessment (no legacy voice) semantically unchanged', async () => {
    // 沒有舊 voice 'language' 的評估，v8 重算不應引入孤立 language，也不改分類。
    await seedV5Db(dbName, [
      { id: 'child-3', birthDate: '2022-03-09', createdAt: new Date('2026-01-01') },
    ], [
      {
        id: 'assess-clean',
        childId: 'child-3',
        status: 'completed',
        completedAt: new Date('2026-07-09T06:34:00Z'),
        createdAt: new Date('2026-07-09T06:20:00Z'),
        triageResult: {
          category: 'normal', confidence: 0.85, summary: '',
          details: [
            { domain: 'cognition', metric: 'questionnaireScore', value: 18, zScore: 0.5, directionalZ: 0.5, maxScore: 20, isAnomaly: false },
          ],
        },
      },
    ]);

    const db = await openV8TestDb(dbName);
    const a = await db.table('assessments').get('assess-clean');

    expect(a.schemaVersion).toBe('v8-recomputed');
    expect(a.triageResult.details.some((d: { domain: string }) => d.domain === 'language')).toBe(false);
    db.close();
  });
});
