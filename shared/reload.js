/**
 * Reloads the page with fresh files. GitHub Pages and AppsWarga's web view both cache JS/CSS
 * for a while, so first re-download every same-site file this page loaded with
 * `cache: 'reload'` (which stores the fresh copy), then reload. Saved data is left alone.
 */
export async function hardReload() {
  const urls = new Set([location.href.split('#')[0]]);
  for (const entry of performance.getEntriesByType('resource')) {
    try {
      const url = new URL(entry.name);
      if (url.origin === location.origin) urls.add(url.href.split('#')[0]);
    } catch {
      /* not a URL */
    }
  }
  try {
    if (window.caches) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch {
    /* Cache Storage unavailable */
  }
  await Promise.allSettled([...urls].map((u) => fetch(u, { cache: 'reload' })));
  location.reload();
}
