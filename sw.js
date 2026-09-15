/* KuniMaster service worker — app shell cache (network-first for HTML, cache-first for assets) */
const VERSION = 'km-v1.0.0';
const SHELL = ['./', './index.html', './css/app.css', './manifest.webmanifest',
  './js/data-europe.js', './js/data-americas.js', './js/data-africa.js', './js/data-asia.js',
  './js/util.js', './js/store.js', './js/quiz.js', './js/engine.js', './js/net.js', './js/ui.js', './js/game-ui.js', './js/app.js',
  './assets/icon-192.png', './assets/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) { // fonts / peerjs / qr: network, fall back to cache
    e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put('./index.html', cp)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); return r; })));
});
