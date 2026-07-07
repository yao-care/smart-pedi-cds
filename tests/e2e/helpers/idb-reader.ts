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
