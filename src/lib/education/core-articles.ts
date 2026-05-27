// 系統核心文章 = content-relevance.yaml 的 triggers 中標 browse:true 的文章
// （六大發展領域主衛教：行為/認知/粗動作/精細動作/語言理解/語言表達/語言刺激/社交情緒）。
//
// 對外曝光（/education 清單、ItemList schema、llms.txt、RSS）只主打這些核心文章，
// 排除：純配合影片的孤兒營養食譜（nutrition-*）、與只在矩陣特定格子作補充推薦的文章。
// content-relevance.yaml 為單一真相源；build 時讀取，產出 build-time 常數。

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

interface CRArticle {
  slug: string;
  severities?: string[];
  browse?: boolean;
}
interface CRTrigger {
  trigger: string;
  articles?: CRArticle[];
}
interface CRDoc {
  triggers?: CRTrigger[];
}

// build 時 astro 由 repo root 執行，cwd 即專案根（與 build-content-index.ts 一致）
const yamlPath = resolve(process.cwd(), 'src/data/education/content-relevance.yaml');

const doc = yaml.load(readFileSync(yamlPath, 'utf8')) as CRDoc;

/** 系統核心文章 slug（browse:true，去重排序）。 */
export const CORE_ARTICLE_SLUGS: readonly string[] = [
  ...new Set(
    (doc.triggers ?? []).flatMap((t) =>
      (t.articles ?? []).filter((a) => a.browse === true).map((a) => a.slug),
    ),
  ),
].sort();

/** 判斷某 slug 是否為系統核心文章。 */
export function isCoreArticle(slug: string): boolean {
  return CORE_ARTICLE_SLUGS.includes(slug);
}
