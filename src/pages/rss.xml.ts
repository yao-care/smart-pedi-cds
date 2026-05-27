import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { SITE } from '../lib/seo/site';

export async function GET(context: APIContext) {
  const education = await getCollection('education');
  return rss({
    title: `${SITE.name} — 衛教內容`,
    description: SITE.description,
    site: context.site!.toString(),
    items: education.map((entry) => ({
      title: entry.data.title,
      description: entry.data.summary,
      pubDate: entry.data.publishedAt,
      link: `/education/${entry.id}/`,
    })),
    customData: '<language>zh-TW</language>',
  });
}
