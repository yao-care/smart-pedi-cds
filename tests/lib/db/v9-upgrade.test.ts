/**
 * IndexedDB v5→v9 upgrade tx 整合測試。
 * v9 重算讓歷史評估的 gating 白名單化——drawing 不再污染 fine_motor、
 * behavior 不再產出 gating（與 live triage 一致）。
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { applyTriageRecomputeUpgrade } from '../../../src/lib/db/schema';

const TEST_STORES = {
  children: 'id, createdAt',
  assessments: 'id, childId, status, createdAt, [childId+status]',
};

async function openV9TestDb(dbName: string): Promise<Dexie> {
  const db = new Dexie(dbName);
  db.version(5).stores(TEST_STORES);
  db.version(6).stores(TEST_STORES).upgrade(tx => applyTriageRecomputeUpgrade(tx, 'v6'));
  db.version(7).stores(TEST_STORES).upgrade(tx => applyTriageRecomputeUpgrade(tx, 'v7'));
  db.version(8).stores(TEST_STORES).upgrade(tx => applyTriageRecomputeUpgrade(tx, 'v8'));
  db.version(9).stores(TEST_STORES).upgrade(tx => applyTriageRecomputeUpgrade(tx, 'v9'));
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

let c = 0;
const nextDbName = () => `test-v9-upgrade-${Date.now()}-${++c}`;

describe('IndexedDB v5→v9 upgrade tx integration', () => {
  let dbName: string;
  beforeEach(() => { dbName = nextDbName(); });

  it('recompute removes drawing/behavior from gating; fine_motor reflects only questionnaire', async () => {
    await seedV5Db(dbName, [
      { id: 'child-1', birthDate: '2022-03-09', createdAt: new Date('2026-01-01') },
    ], [
      {
        id: 'assess-1',
        childId: 'child-1',
        status: 'completed',
        completedAt: new Date('2026-07-09T06:34:00Z'),
        createdAt: new Date('2026-07-09T06:20:00Z'),
        triageResult: {
          category: 'monitor', confidence: 0.75, summary: '舊文案',
          details: [
            // drawing 正常曾把 fine_motor 從 refer 拉成 monitor
            { domain: 'fine_motor', metric: 'drawingScore', value: 60, zScore: 0.25, directionalZ: 0.25, isAnomaly: false },
            { domain: 'fine_motor', metric: 'questionnaireScore', value: 2, zScore: -3, directionalZ: -3, maxScore: 20, isAnomaly: true },
            // behavior 曾獨立產出 gating
            { domain: 'behavior', metric: 'completionRate', value: 0.1, zScore: -4, directionalZ: -4, isAnomaly: true },
          ],
        },
      },
    ]);

    const db = await openV9TestDb(dbName);
    const a = await db.table('assessments').get('assess-1');

    expect(a.schemaVersion).toBe('v9-recomputed');
    // fine_motor 只反映問卷 → refer（drawing 不稀釋）
    expect(a.triageResult.domainCategories?.fine_motor).toBe('refer');
    // behavior 不在 gating
    expect(a.triageResult.domainCategories?.behavior).toBeUndefined();
    // drawing detail 仍保留供顯示
    expect(a.triageResult.details.some((d: { metric: string }) => d.metric === 'drawingScore')).toBe(true);
    db.close();
  });
});
