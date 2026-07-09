/**
 * 評估報告的家長導向文案（2026-07-10 三方審查落地）。
 *
 * 集中「亮點 / 情緒正常化 / 接下來怎麼做 / 如何看待運用」的文案與衍生邏輯，
 * 供結果頁（ResultView）與 PDF（AssessmentPdfReport）共用，避免兩處重複。
 * 全為零後端寫死內容。措辭走非病理化、賦能（strength-based）方向：先接住情緒、
 * 先呈現強項、再談挑戰、最後給可行動的下一步。
 */

import { TRIAGE_DOMAIN_LABELS } from '../../engine/cdsa/triage-constants';
import type { DomainScore } from '../../engine/cdsa/radar-scoring';

export type TriageCategory = 'normal' | 'monitor' | 'refer';

/**
 * 取「表現和同齡孩子相當或更好」（位階 ≥ 50）的面向中文標籤，高分在前、最多 3 個。
 * 用於報告「亮點」區塊——先呈現強項，維繫家長對孩子的正向連結與後續介入動機。
 * 若沒有任一面向 ≥ 50，回空陣列（呼叫端改用過程性優勢，如「願意完成整個評估」）。
 */
export function getStrengthLabels(domainScores: DomainScore[]): string[] {
  return [...domainScores]
    .filter((d) => d.score >= 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((d) => TRIAGE_DOMAIN_LABELS[d.domain] ?? d.domain);
}

/**
 * 依分流類別的「接下來可以怎麼做」步驟。refer 帶台灣在地轉介路徑（聯合評估中心、
 * 縣市通報轉介中心、健保/補助、黃金期）；monitor 給在家陪伴 + 再評估；normal 給
 * 正向肯定 + 再篩時機。
 */
export function getNextSteps(category: TriageCategory): string[] {
  if (category === 'refer') {
    return [
      '先掛小兒科門診，跟醫師說明你平常的觀察。',
      '請醫師轉介，或自行預約「兒童發展聯合評估中心」。',
      '聯繫所在縣市的「兒童發展通報轉介中心」（可上網搜尋「你的縣市 + 兒童發展通報轉介中心」）。',
      '多數評估與早期療育有健保或補助，及早介入是把握 0 到 6 歲的黃金期。',
    ];
  }
  if (category === 'monitor') {
    return [
      '目前不需要緊張，先在家多陪孩子玩下面建議的親子活動。',
      '若過一段時間仍無明顯進展，或你有疑慮，再諮詢兒科醫師。',
      '下次兒童健檢時，可請醫師一起追蹤這幾個面向。',
    ];
  }
  return [
    '孩子目前發展在同齡常見範圍，繼續用日常遊戲陪他探索就很好。',
    '建議在下次兒童健檢時再追蹤，或過幾個月後可再自評一次。',
  ];
}

/** 情緒正常化（refer/monitor 時顯示，接住家長的焦慮與自責）。 */
export const REASSURANCE_TEXT =
  '看到這個結果，您可能會擔心、甚至自責，這很正常。發展的個別差異絕大多數和教養方式無關，而是每個孩子有自己的節奏。您願意花時間替孩子做評估，已經是在為他做對的事——接下來要做的不是自責，而是陪他、必要時找專業一起。';

/** 「如何看待與運用這份結果」（含避免在孩子面前貼標籤）。 */
export const HOW_TO_USE_ITEMS: readonly string[] = [
  '這是篩檢，不是診斷：它像體溫計，提示「值得再看看」，不等於生病。',
  '請避免在孩子面前討論分數、或說他「慢／不會」——孩子聽得懂語氣。要談，等他不在場。',
  '跟家人或老師可以說「我們幫他做了發展檢查，想在某些方面多陪他一點」，不需要用「遲緩」「有問題」這類詞。',
  '一份結果只是一個時間點，孩子每天都在變，過陣子再評估更能看出發展的軌跡。',
];
