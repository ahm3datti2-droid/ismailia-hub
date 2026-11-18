const CACHE_NAME = 'ismailia-hub-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/manifest.json',
  '/icons/icon.svg',
  '/css/style.css',
  '/js/config.js',
  '/js/firebase.js',
  '/js/database.js',
  '/js/ui.js',
  '/js/app.js',
  '/js/admin.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // نتعامل فقط مع طلبات GET لنفس النطاق (ملفات التطبيق الثابتة).
  // طلبات Firestore وFirebase وCDN تمرّ مباشرة للشبكة ولا تُخزَّن هنا.
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});
