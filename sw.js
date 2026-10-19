// Service worker: offline app shell with a versioned cache.
// Bump VERSION on every deploy; the app then shows a "Reload" toast.
//   - App shell: cache first (the whole shell is precached per version).
//   - data/plan.json: stale-while-revalidate; open pages are told when it changed.

const VERSION = '1.0.0';
const CACHE = `fitness-${VERSION}`;
const PLAN = 'data/plan.json';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/base.css',
  'css/components.css',
  'css/views.css',
  'js/app.js',
  'js/store.js',
  'js/plan.js',
  'js/dates.js',
  'js/dom.js',
  'js/router.js',
  'js/swipe.js',
  'js/timer.js',
  'js/pwa.js',
  'js/views/view.js',
  'js/views/today.js',
  'js/views/plan.js',
  'js/views/log.js',
  'js/components/tab-bar.js',
  'js/components/toast.js',
  'js/components/timer-pill.js',
  'js/components/sheet.js',
  'js/components/stepper.js',
  'js/components/progress-ring.js',
  'js/components/set-logger.js',
  'js/components/trend-chart.js',
  'js/components/backup.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  PLAN,
];

const scoped = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the HTTP cache, so a new version never precaches stale files.
  const requests = SHELL.map((path) => new Request(scoped(path), { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(requests)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('fitness-') && key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (windows[0]) return windows[0].focus();
      return self.clients.openWindow(scoped('./'));
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fromCache(scoped('index.html'), request));
  } else if (url.href === scoped(PLAN)) {
    event.respondWith(staleWhileRevalidate(event));
  } else {
    event.respondWith(fromCache(request, request));
  }
});

async function fromCache(key, request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(key, { ignoreSearch: true });
  return cached ?? fetch(request);
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE);
  const key = scoped(PLAN);
  const cached = await cache.match(key);
  const cachedText = cached ? cached.clone().text() : Promise.resolve(null);

  const network = fetch(event.request, { cache: 'no-cache' })
    .then(async (response) => {
      if (!response.ok) return response;
      const [fresh, before] = await Promise.all([response.clone().text(), cachedText]);
      await cache.put(key, response.clone());
      if (before !== null && before !== fresh) await broadcast({ type: 'plan-updated' });
      return response;
    })
    .catch(() => null);

  event.waitUntil(network);
  return cached ?? (await network) ?? new Response('{"error":"offline"}', { status: 503, headers: { 'Content-Type': 'application/json' } });
}

async function broadcast(message) {
  const windows = await self.clients.matchAll({ type: 'window' });
  for (const client of windows) client.postMessage(message);
}
