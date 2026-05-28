/**
 * Register the Service Worker in production builds only.
 *
 * 2026-05-28：先前透過 SW postMessage SW_UPDATED → window 'sw-updated'
 * CustomEvent 觸發 OfflineBanner 的「新版已可用」橫幅。後因 SW 採
 * skipWaiting + clients.claim 立即接管 + HTML network-first，橫幅實質沒
 * 提示價值（page 已是新版），反成 UX 噪音，於本日移除整套通知鏈。
 */
export function registerSW(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  navigator.serviceWorker.register(`${base}/sw.js`).catch((err) => {
    console.warn('SW register failed', err);
  });
}
