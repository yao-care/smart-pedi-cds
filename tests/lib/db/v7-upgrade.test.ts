/**
 * IndexedDB v5→v7 upgrade tx 整合測試。
 *
 * 為什麼必要：純函數 recompute-triage 已被 unit test 覆蓋（14+3 cases），
 * 但 applyTriageRecomputeUpgrade 內的 Dexie modify() 呼叫、children pre-load
 * Map、4 種 skip routing（no-details / no-completedAt / no-birthDate /
 * NaN-completedAt）、以及 schemaVersion 字串組合，這次 (2026-05-28) 用戶
 * dump 出錯後才意識到沒整合測試覆蓋是疏失。
 *
 * 測試策略：用 fake-indexeddb 開獨立 db name，模擬 v5→v6→v7 完整 chain，
 * 引用 schema.ts 內 export 的 applyTriageRecomputeUpgrade（避免複製邏輯）。
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { applyTriageRecomputeUpgrade } from '../../../src/lib/db/schema';

const TEST_STORES_V5 = {
  children: 'id, createdAt',
  assessments: 'id, childId, status, createdAt, [childId+status]',
};

/** Build a minimal v5→v7 Dexie chain (only children + assessments tables) and
 *  open it. Triggers all upgrade tx in sequence. */
async function openV7TestDb(dbName: string): Promise<Dexie> {
  const db = new Dexie(dbName);
  db.version(5).stores(TEST_STORES_V5);
  db.version(6).stores(TEST_STORES_V5).upgrade(tx => applyTriageRecomputeUpgrade(tx, 'v6'));
  db.version(7).stores(TEST_STORES_V5).upgrade(tx => applyTriageRecomputeUpgrade(tx, 'v7'));
  await db.open();
  return db;
}

/** Seed db at version 5 schema with assessments. Returns after close so the
 *  next open triggers v5→v6→v7 upgrade. */
async function seedV5Db(dbName: string, children: object[], assessments: object[]): Promise<void> {
  const v5 = new Dexie(dbName);
  v5.version(5).stores(TEST_STORES_V5);
  await v5.open();
  if (children.length > 0) await v5.table('children').bulkPut(children);
  if (assessments.length > 0) await v5.table('assessments').bulkPut(assessments);
  v5.close();
}

let testDbCounter = 0;
const nextDbName = () => `test-v7-upgrade-${Date.now()}-${++testDbCounter}`;

describe('IndexedDB v5→v7 upgrade tx integration', () => {
  let dbName: string;

  beforeEach(() => {
    dbName = nextDbName();
  });

  it('recomputes assessment with full data → schemaVersion=v7-recomputed', async () => {
    await seedV5Db(dbName, [
      { id: 'child-1', birthDate: '2020-05-11', createdAt: new Date('2026-01-01') },
    ], [
      {
        id: 'assess-1',
        childId: 'child-1',
        status: 'completed',
        completedAt: new Date('2026-05-28T07:39:27Z'),
        createdAt: new Date('2026-05-28T07:30:00Z'),
        triageResult: {
          category: 'monitor',
          confidence: 0.75,
          summary: '舊文案',
          details: [
            // The "細動作 15 分" repro case from 2026-05-28 user report
            { domain: 'fine_motor', metric: 'drawingScore', value: 0, zScore: -2.75, directionalZ: -2.75, isAnomaly: true },
            { domain: 'fine_motor', metric: 'questionnaireScore', value: 4, zScore: 0.67, directionalZ: 0.67, maxScore: 4, isAnomaly: false },
          ],
        },
      },
    ]);

    const db = await openV7TestDb(dbName);
    const a = await db.table('assessments').get('assess-1');

    expect(a.schemaVersion).toBe('v7-recomputed');
    // drawing detail dropped by v7 sanitize
    expect(a.triageResult.details.find((d: { metric: string }) => d.metric === 'drawingScore')).toBeUndefined();
    // questionnaire kept, recomputed for ageGroup '61-72m' (child @ 6yr)
    const q = a.triageResult.details.find((d: { metric: string }) => d.metric === 'questionnaireScore');
    expect(q).toBeDefined();
    expect(q.directionalZ).toBeGreaterThan(0);
    // category bumped from monitor → normal (fine_motor only has positive z)
    expect(a.triageResult.category).toBe('normal');
    expect(a.triageResult.domainCategories?.fine_motor).toBe('normal');
    db.close();
  });

  it('skips when assessment has no completedAt → schemaVersion=v7-skip-no-completedAt', async () => {
    await seedV5Db(dbName, [
      { id: 'child-1', birthDate: '2020-05-11', createdAt: new Date('2026-01-01') },
    ], [
      {
        id: 'assess-incomplete',
        childId: 'child-1',
        status: 'started',
        // no completedAt
        createdAt: new Date('2026-05-28T07:30:00Z'),
        triageResult: {
          category: 'normal', confidence: 0.85, summary: '',
          details: [
            { domain: 'fine_motor', metric: 'questionnaireScore', value: 4, zScore: 0.5, directionalZ: 0.5, maxScore: 4, isAnomaly: false },
          ],
        },
      },
    ]);

    const db = await openV7TestDb(dbName);
    const a = await db.table('assessments').get('assess-incomplete');
    expect(a.schemaVersion).toBe('v7-skip-no-completedAt');
    db.close();
  });

  it('skips when child has no birthDate → schemaVersion=v7-skip-no-birthDate', async () => {
    await seedV5Db(dbName, [
      // child without birthDate field
      { id: 'child-no-bd', createdAt: new Date('2026-01-01') },
    ], [
      {
        id: 'assess-orphan',
        childId: 'child-no-bd',
        status: 'completed',
        completedAt: new Date('2026-05-28T07:39:27Z'),
        createdAt: new Date('2026-05-28T07:30:00Z'),
        triageResult: {
          category: 'normal', confidence: 0.85, summary: '',
          details: [
            { domain: 'fine_motor', metric: 'questionnaireScore', value: 4, zScore: 0.5, directionalZ: 0.5, maxScore: 4, isAnomaly: false },
          ],
        },
      },
    ]);

    const db = await openV7TestDb(dbName);
    const a = await db.table('assessments').get('assess-orphan');
    expect(a.schemaVersion).toBe('v7-skip-no-birthDate');
    db.close();
  });

  it('marks no-details when triageResult.details is empty array', async () => {
    await seedV5Db(dbName, [
      { id: 'child-1', birthDate: '2020-05-11', createdAt: new Date('2026-01-01') },
    ], [
      {
        id: 'assess-empty',
        childId: 'child-1',
        status: 'completed',
        completedAt: new Date('2026-05-28T07:39:27Z'),
        createdAt: new Date('2026-05-28T07:30:00Z'),
        triageResult: {
          category: 'normal', confidence: 0.85, summary: '',
          details: [], // empty
        },
      },
    ]);

    const db = await openV7TestDb(dbName);
    const a = await db.table('assessments').get('assess-empty');
    expect(a.schemaVersion).toBe('v7-no-details');
    db.close();
  });

  it('handles invalid birthDate string (NaN Date)', async () => {
    await seedV5Db(dbName, [
      { id: 'child-bad', birthDate: 'not-a-date', createdAt: new Date('2026-01-01') },
    ], [
      {
        id: 'assess-bad-bd',
        childId: 'child-bad',
        status: 'completed',
        completedAt: new Date('2026-05-28T07:39:27Z'),
        createdAt: new Date('2026-05-28T07:30:00Z'),
        triageResult: {
          category: 'normal', confidence: 0.85, summary: '',
          details: [{ domain: 'fine_motor', metric: 'questionnaireScore', value: 4, zScore: 0.5, directionalZ: 0.5, maxScore: 4, isAnomaly: false }],
        },
      },
    ]);

    const db = await openV7TestDb(dbName);
    const a = await db.table('assessments').get('assess-bad-bd');
    expect(a.schemaVersion).toBe('v7-skip-no-birthDate');
    db.close();
  });

  it('processes multiple assessments in one upgrade tx', async () => {
    await seedV5Db(dbName, [
      { id: 'c1', birthDate: '2020-05-11', createdAt: new Date() },
      { id: 'c2', birthDate: '2022-03-15', createdAt: new Date() },
    ], [
      {
        id: 'a1', childId: 'c1', status: 'completed',
        completedAt: new Date('2026-05-28'), createdAt: new Date('2026-05-28'),
        triageResult: { category: 'monitor', confidence: 0.75, summary: '',
          details: [{ domain: 'fine_motor', metric: 'drawingScore', value: 0, zScore: -2.75, directionalZ: -2.75, isAnomaly: true }],
        },
      },
      {
        id: 'a2', childId: 'c2', status: 'completed',
        completedAt: new Date('2026-05-28'), createdAt: new Date('2026-05-28'),
        triageResult: { category: 'normal', confidence: 0.85, summary: '',
          details: [{ domain: 'cognition', metric: 'questionnaireScore', value: 4, zScore: 0.5, directionalZ: 0.5, maxScore: 4, isAnomaly: false }],
        },
      },
    ]);

    const db = await openV7TestDb(dbName);
    const all = await db.table('assessments').toArray();
    expect(all).toHaveLength(2);
    // a1 經過 v6 upgrade 已被 sanitize：drawing value=0 被 drop →
    // recompute-triage 走 safe default (details=[], category=normal).
    // v7 upgrade 進來時 details 已空 → 走 'v7-no-details' 提早 return；
    // v7 不再覆蓋 triageResult（仍是 v6 設的 safe default）。這是預期語意：
    // schemaVersion 變 v7-no-details，但實際資料已是 v6 sanitize 結果。
    const a1 = all.find(a => a.id === 'a1');
    expect(a1.schemaVersion).toBe('v7-no-details');
    expect(a1.triageResult.category).toBe('normal');
    expect(a1.triageResult.details).toHaveLength(0);
    expect(a1.triageResult.summary).toContain('資料不足');
    // a2: keeps questionnaire, recomputes
    const a2 = all.find(a => a.id === 'a2');
    expect(a2.schemaVersion).toBe('v7-recomputed');
    expect(a2.triageResult.details).toHaveLength(1);
    db.close();
  });

  it('v6 → v7 chain preserves user value: drawing=0 + questionnaire stays category=normal (the 細動作 15 分 repro fix)', async () => {
    // 完整模擬 2026-05-28 用戶 dump 的情境，verify 升級後雷達修正。
    await seedV5Db(dbName, [
      { id: 'adult-test', birthDate: '2020-05-11', createdAt: new Date('2026-01-01') },
    ], [
      {
        id: 'adult-assess',
        childId: 'adult-test',
        status: 'completed',
        completedAt: new Date('2026-05-28T07:39:27Z'),
        createdAt: new Date('2026-05-28T07:30:00Z'),
        // Snapshot 自實際用戶 dump（partial — 留 fine_motor + 一個其他 domain）
        triageResult: {
          category: 'monitor',
          confidence: 0.75,
          summary: '細動作面向有待觀察。建議持續追蹤。',
          details: [
            { domain: 'fine_motor', metric: 'drawingScore', value: 0, zScore: -2.75, directionalZ: -2.75, normMean: 55, normStd: 20, isAnomaly: true },
            { domain: 'fine_motor', metric: 'questionnaireScore', value: 4, zScore: 0.67, directionalZ: 0.67, normMean: 3.438, normStd: 0.835, maxScore: 4, isAnomaly: false },
            { domain: 'cognition', metric: 'questionnaireScore', value: 4, zScore: 0.66, directionalZ: 0.66, normMean: 3.506, normStd: 0.753, maxScore: 4, isAnomaly: false },
          ],
        },
      },
    ]);

    const db = await openV7TestDb(dbName);
    const a = await db.table('assessments').get('adult-assess');

    // 預期 chain 行為：
    // v5 raw: 3 details (drawing v=0, fine_motor questionnaire, cognition questionnaire)
    // v6 sanitize: drop drawing → 2 details → recompute → fine_motor z=+0.67 / cognition z=+0.66 → all normal
    //   schemaVersion='v6-recomputed', triageResult.details.length=2, category='normal'
    // v7 進來: details.length=2 不為空 → sanitize 內無 drawing value=0 → 不 drop → recompute 再跑
    //   schemaVersion='v7-recomputed', triageResult 結構同 v6 結果
    expect(a.schemaVersion).toBe('v7-recomputed');
    expect(a.triageResult.category).toBe('normal');
    expect(a.triageResult.details).toHaveLength(2);
    // drawing detail 永遠不在重算結果裡
    expect(a.triageResult.details.find((d: { metric: string }) => d.metric === 'drawingScore')).toBeUndefined();
    // 兩個 questionnaire 都該保留
    expect(a.triageResult.details.filter((d: { metric: string }) => d.metric === 'questionnaireScore')).toHaveLength(2);
    // domain z 應該是正值（與 ASQ-3 借用常模對應）
    expect(a.triageResult.domainLevelZ?.fine_motor).toBeGreaterThan(0);
    expect(a.triageResult.domainLevelZ?.cognition).toBeGreaterThan(0);
    db.close();
  });
});
