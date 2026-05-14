const SW_VERSION = '__SW_VERSION__';
const BASE_PATH = '__BASE_PATH__';
const CACHE_NAME = `cdss-${SW_VERSION}`;

const STATIC_PATTERNS = [
  /_astro\//,
  /\/fonts\//,
  /\/cards\//,
  /\/sounds\//,
  /\/models\//,
  /\/icons\//,
  /manifest\.json$/,
];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
      const all = await self.clients.matchAll();
      all.forEach((c) => c.postMessage({ type: 'SW_UPDATED', version: SW_VERSION }));
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Same-origin only beyond this point
  if (url.origin !== self.location.origin) return;

  // SMART launch / FHIR launch query → never cache, isolate per tenant
  if (url.searchParams.has('iss') || url.searchParams.has('launch')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Only handle GET
  if (event.request.method !== 'GET') return;

  // Static assets: cache-first
  if (STATIC_PATTERNS.some((p) => p.test(url.pathname))) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // HTML pages: network-first, fallback to cache (key without query)
  if (
    event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') ?? '').includes('text/html')
  ) {
    event.respondWith(networkFirstHtml(event.request));
    return;
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirstHtml(req) {
  const cache = await caches.open(CACHE_NAME);
  const cacheKey = new Request(new URL(req.url).pathname, { method: 'GET' });
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(cacheKey, res.clone());
    return res;
  } catch {
    return (await cache.match(cacheKey)) ?? new Response('Offline', { status: 503 });
  }
}
