// Perfo — service worker : fonctionne hors ligne.
// Pense à changer VERSION à chaque mise à jour publiée.
const VERSION = 'perfo-v1.0.0';
const FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './assets/logo.png',
  './assets/calendar.png',
  './assets/p1.png',
  './assets/p2.png',
  './assets/p3.png',
  './assets/wallpaper.jpg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/maskable-192.png',
  './assets/maskable-512.png',
  './assets/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
