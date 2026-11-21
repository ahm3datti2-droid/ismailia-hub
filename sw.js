const CACHE_NAME = 'ismailia-hub-v32';
const ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/digital-awareness.html',
  '/manifest.json',
  '/manifest-admin.json',
  '/icons/icon.svg',
  '/icons/icon-admin-192.png',
  '/icons/icon-admin-512.png',
  '/icons/icon-admin-maskable-512.png',
  '/css/style.css',
  '/js/config.js',
  '/js/firebase.js',
  '/js/auth.js',
  '/js/database.js',
  '/js/ui.js',
  '/js/app.js',
  '/js/admin.js',
  '/js/digital-awareness.js',
  '/data/awareness/categories.json',
  '/data/awareness/featured.json',
  '/data/awareness/sources.json',
  '/data/awareness/tools.json',
  '/data/awareness/topics.json',
  '/data/trains.json',
  '/data/awareness/quiz.json',
  '/data/awareness/checklist.json',
  '/data/awareness/incident.json',
  '/data/awareness/scam.json',
  '/data/awareness/academy.json',
  '/data/awareness/meta.json',
  '/js/awareness-tools.js',
  '/js/awareness-academy.js',
  '/market.html',
  '/js/market.js'
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
  // الشبكة أولاً لملفات HTML و JS و CSS حتى لا تظهر نسخة قديمة بعد أي تحديث،
  // والكاش بديل فقط عند انقطاع الشبكة.
  const isHtmlOrJs = e.request.destination === 'document' || e.request.destination === 'script' || e.request.destination === 'style' || e.request.url.endsWith('.js') || e.request.url.endsWith('.html') || e.request.url.endsWith('.css') || e.request.url.endsWith('/');
  if (isHtmlOrJs) {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});
