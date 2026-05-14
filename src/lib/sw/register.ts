/**
 * Register the Service Worker in production builds only.
 * Dispatches a `sw-updated` CustomEvent on `window` when a new SW activates,
 * so the UI can prompt the user to reload.
 */
export function registerSW(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  navigator.serviceWorker
    .register(`${base}/sw.js`)
    .then(() => {
      navigator.serviceWorker.addEventListener('message', (ev: MessageEvent) => {
        if (ev.data?.type === 'SW_UPDATED') {
          window.dispatchEvent(new CustomEvent('sw-updated', { detail: ev.data }));
        }
      });
    })
    .catch((err) => {
      console.warn('SW register failed', err);
    });
}
