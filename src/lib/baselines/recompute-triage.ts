/**
 * 對既有評估（IndexedDB 內 Assessment.triageResult）做 §7.2 2026-05-28 rev
 * 規則下的「retroactive 重算」純函數 lib。
 *
 * 為什麼存在這個 lib（spec §7.3 + §13.5）：
 *   - Phase 2 把 live triage 改成 per-domain z 合成 + ASQ-3 借用，新評估走新邏輯
 *   - 但 IndexedDB 內 v5 之前完成的 Assessment 仍存舊邏輯下的 triageResult：
 *       問卷 detail 的 directionalZ = null（沒常模可算）
 *       per-detail isAnomaly 用舊門檻（normalized < 0.5 / z ≤ -1.5）
 *       category / confidence / summary 用舊 anomalyCount + 跨 domain 規則
 *   - 不重算的話，歷史評估打開 ResultView 會出現「雷達 50 卻判 monitor」這種
 *     視覺矛盾——這正是 §1 報告的問題現象。
 *
 * 設計：
 *   - 純函數（不 import db / dexie），給 IndexedDB v6 upgrade tx 和測試共用
 *   - 共享 triage.ts 的 const（PER_DETAIL_ANOMALY_Z / DOMAIN_REFER_Z /
 *     DOMAIN_MONITOR_Z / TRIAGE_DOMAIN_LABELS）作為單一真相源
 *   - 重算範圍：
 *       1. 問卷 detail：getQuestionnaireNorm(domain, ageGroup, maxScore)
 *          → 重算 zScore / directionalZ / normMean / normStd
 *       2. 所有 detail：用新 PER_DETAIL_ANOMALY_Z 重套 isAnomaly
 *          （z-based 模組的 directionalZ 在 v5 已正確，只是 isAnomaly 門檻變）
 *       3. domainLevelZ / domainCategories / category / confidence / summary /
 *          anomalyCount 全部從重算後 details 推導
 *   - 安全網：缺 maxScore / norm lookup 失敗 / unknown domain → 保留舊 detail
 *     但仍套新 isAnomaly 門檻；不會丟資料、不會拋例外。
 */

import {
  PER_DETAIL_ANOMALY_Z,
  DOMAIN_REFER_Z,
  DOMAIN_MONITOR_Z,
  TRIAGE_DOMAIN_LABELS,
} from '../../engine/cdsa/triage-constants';
import {
  getQuestionnaireNorm,
  type QuestionnaireDomain,
} from './questionnaire-norms';
import type { AgeGroupCDSA } from '../utils/age-groups';

/** 與 schema.ts Assessment.triageResult.details[] 結構一致（避免循環 import）。 */
export interface PersistedTriageDetail {
  domain: string;
  metric: string;
  value: number;
  zScore: number | null;
  directionalZ: number | null;
  normMean?: number | null;
  normStd?: number | null;
  maxScore?: number | null;
  isAnomaly: boolean;
}

export interface PersistedTriageResult {
  category: 'normal' | 'monitor' | 'refer';
  confidence: number;
  summary: string;
  details?: PersistedTriageDetail[];
  anomalyCount?: number;
  domainLevelZ?: Record<string, number>;
  domainCategories?: Record<string, 'normal' | 'monitor' | 'refer'>;
}

const KNOWN_QUESTIONNAIRE_DOMAINS = new Set<QuestionnaireDomain>([
  'cognition', 'fine_motor', 'gross_motor',
  'language_comprehension', 'language_expression', 'social_emotional',
]);

function isQuestionnaireDomain(d: string): d is QuestionnaireDomain {
  return KNOWN_QUESTIONNAIRE_DOMAINS.has(d as QuestionnaireDomain);
}

/**
 * 對單筆 detail 套新邏輯。問卷類 detail 重算 z；其他 detail 只更新 isAnomaly。
 *
 * 安全網（v5 落地檔欄位不齊全時）：
 *   - 問卷 + 缺 maxScore：保留 detail（不丟）+ 用既有 directionalZ 套新 isAnomaly 門檻
 *   - 問卷 + norm lookup 失敗：同上
 *   - 非問卷 + directionalZ 仍 null：保留 detail 原 isAnomaly（極罕見）
 */
function recomputeDetail(d: PersistedTriageDetail, ageGroup: AgeGroupCDSA): PersistedTriageDetail {
  // 語音時長遷移：舊評估 voice detail 的 domain 為 'language'，與問卷的
  // language_comprehension / language_expression 並存時，雷達會出現孤立且重複
  // 的「語言」格（報告矛盾根因）。遷移到 language_expression，與 triage.ts 的新
  // 產生邏輯一致；voiceDuration 仍為 display-only，於下方 domainZs 合成被排除。
  if (d.metric === 'voiceDuration' && d.domain === 'language') {
    const migrated = { ...d, domain: 'language_expression' };
    return d.directionalZ !== null && d.directionalZ !== undefined
      ? { ...migrated, isAnomaly: d.directionalZ <= PER_DETAIL_ANOMALY_Z }
      : migrated;
  }

  // 問卷面向：嘗試重算 z
  if (d.metric === 'questionnaireScore' && isQuestionnaireDomain(d.domain)) {
    if (!d.maxScore || d.maxScore <= 0) {
      return {
        ...d,
        isAnomaly:
          d.directionalZ !== null && d.directionalZ !== undefined
            ? d.directionalZ <= PER_DETAIL_ANOMALY_Z
            : d.isAnomaly,
      };
    }
    try {
      const norm = getQuestionnaireNorm(d.domain, ageGroup, d.maxScore);
      const z = (d.value - norm.mean) / norm.sd;
      return {
        ...d,
        zScore: z,
        directionalZ: z,
        normMean: norm.mean,
        normStd: norm.sd,
        isAnomaly: z <= PER_DETAIL_ANOMALY_Z,
      };
    } catch {
      return {
        ...d,
        isAnomaly:
          d.directionalZ !== null && d.directionalZ !== undefined
            ? d.directionalZ <= PER_DETAIL_ANOMALY_Z
            : d.isAnomaly,
      };
    }
  }

  // 非問卷 detail（behavior / drawing / voice / pose）：directionalZ 已在 v5 算
  // 正確，只重套新 isAnomaly 門檻；directionalZ 保留原值。
  if (d.directionalZ !== null && d.directionalZ !== undefined) {
    return { ...d, isAnomaly: d.directionalZ <= PER_DETAIL_ANOMALY_Z };
  }
  return d;
}

/**
 * 對整個 triageResult 重算。輸入舊 result + ageGroup（外部需從 birthDate +
 * completedAt 推回，見 ageGroupCDSAAt），輸出全新 result（不 mutate 入參）。
 *
 * 若 details 為空或 undefined，原樣回傳（沒得算）。
 */
export function recomputeTriageResult(
  oldResult: PersistedTriageResult,
  ageGroup: AgeGroupCDSA,
): PersistedTriageResult {
  if (!oldResult.details || oldResult.details.length === 0) return oldResult;

  // 0. 過濾掉 v5 / v6 之前的「無有效資料但被誤推入 details」紀錄。
  //    （2026-05-28 bug：drawing 模組沒互動或評分 bug 時 overallScore=0
  //    fallback 仍被 triage.ts 無條件 push，使 fine_motor domain 被誤判為
  //    monitor/refer。drawing-analysis 的評分 bug 修好前，採保守假設「v5/v6
  //    歷史 detail 中 metric='drawingScore' AND value=0」都視為無效資料 drop。
  //    對「真畫了卻被誤評 0 分」的用戶資料這也是正確處理：保留錯誤分數對
  //    判讀有害。triage.ts 中 shapes.length>0 guard 處理新評估情境。）
  const sanitizedDetails = oldResult.details.filter((d) => {
    if (d.metric === 'drawingScore' && d.value === 0) return false;
    return true;
  });
  if (sanitizedDetails.length === 0) {
    // 全 details 被視為無效（極端 case）→ 返回 normal baseline 避免空輸出
    return {
      category: 'normal',
      confidence: 0.5,
      summary: '評估資料不足，無法判讀。',
      details: [],
      anomalyCount: 0,
      domainLevelZ: {},
      domainCategories: {},
    };
  }

  // 1. 重算每筆 detail
  const newDetails = sanitizedDetails.map((d) => recomputeDetail(d, ageGroup));

  // 2. 合成 domain-level z（與 triage.ts 同邏輯：白名單只收問卷）
  const domainZs: Record<string, number[]> = {};
  for (const d of newDetails) {
    // 白名單：只有 ASQ-3 問卷常模驅動 gating。所有感測啟發式
    // （pose/voice/drawing/behavior）display-only——保留於 details 供顯示，
    // 不進 gating。與 live triage.ts 一致。
    if (d.metric !== 'questionnaireScore') continue;
    if (d.directionalZ !== null && d.directionalZ !== undefined) {
      if (!domainZs[d.domain]) domainZs[d.domain] = [];
      domainZs[d.domain].push(d.directionalZ);
    }
  }
  const domainLevelZ: Record<string, number> = {};
  for (const [domain, zs] of Object.entries(domainZs)) {
    domainLevelZ[domain] = zs.reduce((a, b) => a + b, 0) / zs.length;
  }

  // 3. domain category（同 triage.ts:276-280）
  const domainCategories: Record<string, 'normal' | 'monitor' | 'refer'> = {};
  for (const [domain, z] of Object.entries(domainLevelZ)) {
    if (z <= DOMAIN_REFER_Z) domainCategories[domain] = 'refer';
    else if (z <= DOMAIN_MONITOR_Z) domainCategories[domain] = 'monitor';
    else domainCategories[domain] = 'normal';
  }

  const referDomains = Object.entries(domainCategories)
    .filter(([, c]) => c === 'refer')
    .map(([d]) => d);
  const monitorDomains = Object.entries(domainCategories)
    .filter(([, c]) => c === 'monitor')
    .map(([d]) => d);

  // 4. overall category + confidence（同 triage.ts:292-303）
  let category: PersistedTriageResult['category'];
  let confidence: number;
  if (referDomains.length > 0) {
    category = 'refer';
    confidence = Math.min(0.95, 0.85 + 0.03 * referDomains.length + 0.02 * monitorDomains.length);
  } else if (monitorDomains.length > 0) {
    category = 'monitor';
    confidence = Math.min(0.90, 0.65 + 0.1 * monitorDomains.length);
  } else {
    category = 'normal';
    confidence = 0.85;
  }

  // 5. anomalyCount + summary
  const anomalyCount = newDetails.filter((d) => d.isAnomaly).length;
  const labelDomains = (ds: string[]) =>
    ds.map((d) => TRIAGE_DOMAIN_LABELS[d] ?? d).join('、');
  // 措辭與 triage.ts 同步（2026-07-10 去病理化）：狀態描述取代「異常/落後」定性字眼。
  const summary =
    category === 'normal'
      ? '各面向發展都在同齡常見範圍內。'
      : category === 'monitor'
        ? `${labelDomains(monitorDomains)}目前還在發展中，多數孩子會隨時間趕上。可以先在家多陪伴，過一段時間再評估一次。`
        : `這次評估中，${labelDomains(referDomains)}的表現和同齡孩子相比較不一致，建議讓專業人員進一步了解——這是釐清，不是診斷。`;

  return {
    category,
    confidence,
    summary,
    details: newDetails,
    anomalyCount,
    domainLevelZ,
    domainCategories,
  };
}
