// GitHub Pages sets a cache lifetime on static files. Keep this worker scoped
// to the margin worksheet so its navigations and assets always use the network.
const pagePath = new URL(self.registration.scope).pathname;
const assetsPath = new URL('venture/', self.registration.scope).pathname;

self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const worksheet = request.mode === 'navigate' && url.pathname === pagePath;
  const asset = request.mode !== 'navigate' && url.pathname.startsWith(assetsPath);
  if (worksheet || asset) event.respondWith(fetchFresh(request, url));
});

async function fetchFresh(request, url) {
  // Use a unique URL to bypass the GitHub Pages edge cache as well as the browser cache.
  url.searchParams.set('_marginFresh', crypto.randomUUID());
  const response = await fetch(url, { cache: 'no-store', credentials: request.credentials });
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, max-age=0');
  headers.delete('Content-Encoding');
  headers.delete('Content-Length');
  headers.delete('ETag');
  headers.delete('Last-Modified');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
