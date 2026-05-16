const CACHE_VERSION = 'plivex-v22';

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
  './src/ui/screens/stats.js',
  './src/ui/screens/calendar.js',
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
  const url = new URL(req.url);

  // Web Share Target: incoming POST from the OS share sheet. Parse the
  // multipart payload, classify files by MIME type, stash the normalized
  // payload in a transient cache, then redirect to the app with a flag
  // it can pick up on next render. The redirect target is './' which is
  // already in APP_SHELL — no network required.
  if (req.method === 'POST' && url.pathname.endsWith('/share')) {
    event.respondWith(handleShareTarget(req));
    return;
  }

  if (req.method !== 'GET') return;
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

const SHARE_STAGING_CACHE = 'plivex-share-staging';
const SHARE_STAGING_KEY = './share-payload';

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function handleShareTarget(request) {
  const payload = { title: '', content: '', photos: [], audio: [], files: [] };
  try {
    const formData = await request.formData();
    payload.title = String(formData.get('title') || '').slice(0, 500);
    const text = String(formData.get('text') || '');
    const sharedUrl = String(formData.get('url') || '');
    payload.content = [text, sharedUrl].filter(Boolean).join('\n').trim().slice(0, 50000);

    const files = formData.getAll('files');
    for (const f of files) {
      if (!f || typeof f.arrayBuffer !== 'function' || !f.size) continue;
      const buf = new Uint8Array(await f.arrayBuffer());
      const item = {
        name: f.name || 'shared',
        type: f.type || 'application/octet-stream',
        dataB64: bytesToBase64(buf)
      };
      if (item.type.startsWith('image/')) payload.photos.push(item);
      else if (item.type.startsWith('audio/')) payload.audio.push(item);
      else payload.files.push(item);
    }

    const cache = await caches.open(SHARE_STAGING_CACHE);
    await cache.put(
      new Request(SHARE_STAGING_KEY),
      new Response(JSON.stringify(payload), {
        headers: { 'Content-Type': 'application/json' }
      })
    );
  } catch {
    // Best-effort. If parsing fails the user lands on the entry list
    // without a prefilled form; they can compose manually.
  }
  return Response.redirect('./?share=pending', 303);
}
