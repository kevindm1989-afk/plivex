const CACHE_VERSION = 'plivex-v16';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/main.css',
  './src/app.js',
  './src/storage.js',
  './src/crypto.js',
  './src/chain.js',
  './src/ui/ui.js',
  './src/ui/dom.js',
  './src/ui/icons.js',
  './src/ui/components/button.js',
  './src/ui/components/input.js',
  './src/ui/components/dialog.js',
  './src/ui/components/strength-meter.js',
  './src/ui/components/audio-recorder.js',
  './src/ui/screens/install-gate.js',
  './src/ui/screens/setup.js',
  './src/ui/screens/lock.js',
  './src/ui/screens/entry-list.js',
  './src/ui/screens/entry-form.js',
  './src/ui/screens/entry-detail.js',
  './src/ui/screens/settings.js',
  './src/ui/screens/certificate.js',
  './src/ui/screens/help.js',
  './src/ui/screens/print-view.js',
  './src/ui/templates.js',
  './vendor/idb.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => cached);
    })
  );
});
