/**
 * 發展警訊（red flags）——獨立於 per-domain 分流平均的安全網。
 *
 * 為什麼需要（2026-07-10 醫師視角審查）：per-domain gating 取問卷各面向 z 的平均，
 * 關鍵里程碑的單題失分會被同面向其他題稀釋。但臨床上有一組「單一命中即需轉介、
 * 不受總分稀釋」的紅旗（不會走、無語言、叫名無反應、無指物分享、無假裝遊戲、
 * 缺社會性微笑）。本模組獨立偵測這些紅旗；命中即強制升為 refer。
 *
 * 依據（age-band 里程碑，公認臨床共識）：
 *   - CDC「Learn the Signs. Act Early.」developmental milestones（cdc.gov/act-early）
 *   - AAP Bright Futures / 建議 9・18・30 個月一般發展篩檢、18・24 個月自閉篩檢
 *   - M-CHAT（叫名無反應、無指物分享、無假裝遊戲＝自閉早期警訊）
 * 觸發年齡採「該里程碑應達成月齡的保守上端」，避開正常發展的個別差異下限。
 *
 * 資料來源限制：紅旗需 per-question 原始作答（questionnaireAnswers），僅新評估存有；
 * v8 之前的歷史評估未存 per-question，無法回溯偵測（可接受——紅旗是即時篩檢安全網）。
 * 發展「倒退」（失去已有技能）需縱貫比較，列為後續，不在本橫斷偵測範圍。
 */

import { AGE_GROUPS_CDSA, type AgeGroupCDSA } from '../../lib/utils/age-groups';

export interface RedFlag {
  /** 紅旗唯一 id。 */
  id: string;
  /** 對應問卷題 id（該題答最低分＝完全不會 時觸發）。 */
  questionId: string;
  /** 觸發起始年齡層：受測年齡 ≥ 此層才視為紅旗（避開正常範圍下限）。 */
  minAgeGroup: AgeGroupCDSA;
  /** 家長可讀的紅旗描述。 */
  label: string;
  /** 文獻依據（簡短，供醫師檢視）。 */
  basis: string;
}

/**
 * 紅旗清單。每項＝「特定里程碑題」在「應達成年齡」仍答最低分（score 0＝完全不會）。
 * questionId 對應 src/data/questionnaire/questions.json 的題目 id。
 */
export const RED_FLAGS: readonly RedFlag[] = [
  {
    id: 'no-social-smile',
    questionId: 'se-01', // 「寶寶看到熟悉的人會微笑嗎？」
    minAgeGroup: '7-12m',
    label: '對熟悉的人缺乏社會性微笑',
    basis: 'CDC：社會性微笑約 2 個月出現；7 個月後仍缺乏需評估。',
  },
  {
    id: 'no-name-response',
    questionId: 'lc-01', // 「叫寶寶的名字時會轉頭看嗎？」
    minAgeGroup: '13-24m',
    label: '叫名字時很少有反應',
    basis: '叫名反應 9–12 個月應出現；持續缺乏為自閉症早期警訊（M-CHAT）。',
  },
  {
    id: 'no-first-words',
    questionId: 'le-01', // 「寶寶會發出有意義的聲音嗎？（如叫爸爸、媽媽）」
    minAgeGroup: '13-24m',
    label: '尚無有意義的單字「如叫爸爸、媽媽」',
    basis: 'CDC：12 個月應有有意義單字，15–18 個月應有數個單字。',
  },
  {
    id: 'no-joint-attention-pointing',
    questionId: 'le-03', // 「寶寶會用手指東西要大人看嗎？」
    minAgeGroup: '13-24m',
    label: '尚不會用手指東西與大人分享「共享式注意力」',
    basis: 'CDC/M-CHAT：15–18 個月應以手指物分享；缺乏為自閉症早期警訊。',
  },
  {
    id: 'not-walking',
    questionId: 'gm-03', // 「孩子能自己走路嗎？」
    minAgeGroup: '25-36m',
    label: '兩歲後仍不會自己走路',
    basis: 'CDC：18 個月應能獨立行走；18 個月不會走為轉介指標（AAP）。',
  },
  {
    id: 'no-pretend-play',
    questionId: 'se-04', // 「孩子玩玩具時會假裝餵娃娃吃東西嗎？」
    minAgeGroup: '25-36m',
    label: '尚無假裝「象徵」遊戲',
    basis: 'CDC：18 個月應有假裝遊戲；24 個月後缺乏為發展/自閉警訊。',
  },
];

/**
 * 偵測命中的紅旗：受測年齡 ≥ 紅旗起始年齡層，且該題答最低分（score === 0）。
 *
 * @param answers  per-question 原始作答（questionId → score）。缺該題則不觸發。
 * @param ageGroup 受測年齡層。
 */
export function detectRedFlags(
  answers: Record<string, number>,
  ageGroup: AgeGroupCDSA,
): RedFlag[] {
  const ageIdx = AGE_GROUPS_CDSA.indexOf(ageGroup);
  if (ageIdx < 0) return [];
  return RED_FLAGS.filter((flag) => {
    if (ageIdx < AGE_GROUPS_CDSA.indexOf(flag.minAgeGroup)) return false;
    return answers[flag.questionId] === 0;
  });
}
