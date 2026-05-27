import type { APIContext } from 'astro';

const DISALLOW = ['/settings', '/admin', '/result', '/workspace', '/history'];

export function GET(context: APIContext) {
  const sitemap = new URL('/sitemap-index.xml', context.site!).href;
  const body = [
    'User-agent: *',
    'Allow: /',
    ...DISALLOW.map((p) => `Disallow: ${p}`),
    '',
    `Sitemap: ${sitemap}`,
    '',
  ].join('\n');
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
