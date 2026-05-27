import { AGE_GROUPS_CDSA } from '$lib/utils/age-groups';
export { AGE_GROUPS_CDSA } from '$lib/utils/age-groups';

export const CDSA_DOMAINS = [
  'behavior', 'gross_motor', 'fine_motor', 'language',
  'language_comprehension', 'language_expression', 'cognition', 'social_emotional',
] as const;
export type CdsaDomain = typeof CDSA_DOMAINS[number];
export type AgeGroupCDSA = typeof AGE_GROUPS_CDSA[number];
export type MatrixKey = `${CdsaDomain}:${AgeGroupCDSA}`;

export type MatrixCellData = {
  inapplicable: boolean;
  articleSlugs: string[];
  videoIds: string[];
};

export type MatrixData = Record<MatrixKey, MatrixCellData>;

type TriggerMap = Record<string, { videoIds: string[]; inapplicable: boolean; educationSlug?: string; articleSlugs?: string[] }>;

export function buildMatrixData(triggers: TriggerMap): MatrixData {
  const data: Record<string, MatrixCellData> = {};

  // Initialise all cells as applicable (empty → contributable).
  // Source of truth for inapplicability is src/data/education/content-relevance.yaml,
  // whose inapplicable section is compiled into cdsa.domain triggers with
  // inapplicable:true; only those flip a cell back to inapplicable below.
  for (const domain of CDSA_DOMAINS) {
    for (const age of AGE_GROUPS_CDSA) {
      data[`${domain}:${age}`] = { inapplicable: false, articleSlugs: [], videoIds: [] };
    }
  }

  // Populate from cdsa.domain.* triggers only. Articles (educationSlug) and videos
  // are independent — a cell may have an article, a video, both, or neither.
  for (const [trigger, entry] of Object.entries(triggers)) {
    const parts = trigger.split('.');
    if (parts[0] !== 'cdsa' || parts[1] !== 'domain' || parts[3] !== 'anomaly') continue;
    const cell = data[`${parts[2]}:${parts[4]}`];
    if (!cell) continue;
    cell.inapplicable = entry.inapplicable;
    if (!entry.inapplicable) {
      cell.videoIds = [...entry.videoIds];
      // 列出該情境所有相關文章（含主文章與補充推薦）；舊資料無 articleSlugs 時退回單篇主文章。
      if (entry.articleSlugs && entry.articleSlugs.length) {
        cell.articleSlugs = [...entry.articleSlugs];
      } else if (entry.educationSlug) {
        cell.articleSlugs = [entry.educationSlug];
      }
    }
  }

  return data as MatrixData;
}
