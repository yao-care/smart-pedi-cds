import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { SITE } from '../lib/seo/site';

export async function GET(context: APIContext) {
  const site = context.site!;
  const abs = (p: string) => new URL(p, site).href;
  const education = await getCollection('education');
  const topics = education
    .map((e) => `- [${e.data.title}](${abs(`/education/${e.id}/`)}): ${e.data.summary}`)
    .join('\n');

  const body = `# ${SITE.name}

> ${SITE.tagline}，在瀏覽器完成、不上傳個資。
> 評估語言、動作、社交、認知等發展里程碑，並提供對應衛教內容。

## 這是什麼
- 家長可自行操作的兒童發展評估，依年齡給適齡題目
- 結果非醫療診斷，發現疑慮建議就醫評估
- 由 ${SITE.organization.name} 開發，開源、純瀏覽器、零個資上傳

## 衛教主題
${topics}

## 開始評估
- [家長評估入口](${abs('/assess/')})
- [衛教內容](${abs('/education/')})
- [內容更新 RSS](${abs('/rss.xml')})

## 原始碼
${SITE.repo}
`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
