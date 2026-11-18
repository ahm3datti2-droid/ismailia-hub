const CACHE_NAME = 'ismailia-hub-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/css/style.css',
  '/js/config.js',
  '/js/firebase.js',
  '/js/database.js',
  '/js/ui.js',
  '/js/app.js',
  '/js/admin.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});
