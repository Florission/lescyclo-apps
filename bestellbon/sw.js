// Offline-Cache: zuerst Netz (für Updates), sonst Cache
const C = 'lc-bestellbon-v13'
const FILES = ["./", "index.html", "shim.js", "store.js", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(C).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const same = new URL(e.request.url).origin === location.origin;
  // eigene Dateien immer beim Server nachfragen (kein veralteter Browser-Cache)
  e.respondWith(fetch(same ? new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }) : e.request).then((r) => { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
