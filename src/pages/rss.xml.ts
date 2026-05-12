import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';

export async function GET(context: APIContext) {
  const education = await getCollection('education');
  return rss({
    title: 'CDSS 兒科臨床決策輔助系統 — 衛教內容',
    description: '兒科健康衛教資源更新',
    site: context.site!.toString(),
    items: education.map((entry) => ({
      title: entry.data.title,
      description: entry.data.summary,
      pubDate: entry.data.publishedAt,
      link: `/smart-pedi-cds/education/${entry.id}/`,
    })),
    customData: '<language>zh-TW</language>',
  });
}
