/**
 * Service Worker — Vodafone Fakka Premium
 * ────────────────────────────────────────
 * استراتيجية: Cache-First للـ Static Assets، Network-First للـ API
 *
 * يخزّن عند التثبيت:
 * - ملفات JS/CSS (bundle)
 * - الخطوط (fonts)
 * - الأيقونات (icons)
 * - الصور الثابتة
 *
 * لا يخزّن أبداً:
 * - طلبات Supabase API
 * - طلبات Auth
 * - Edge Functions
 */

const CACHE_NAME    = 'vfp-static-v3';
const FONT_CACHE    = 'vfp-fonts-v1';
const IMAGE_CACHE   = 'vfp-images-v1';

// الملفات الأساسية للتخزين عند التثبيت
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.png',
  '/vfp-logo.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// ─── Install: تخزين الملفات الأساسية ─────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(PRECACHE_ASSETS).catch(() => {
        // إذا فشل تحميل بعض الملفات، لا نوقف التثبيت
      })
    ).then(() => self.skipWaiting())
  );
});

// ─── Activate: مسح الكاش القديم ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const validCaches = [CACHE_NAME, FONT_CACHE, IMAGE_CACHE];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => !validCaches.includes(k)).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch: استراتيجية التخزين حسب نوع الطلب ─────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. تجاهل تام: Supabase API, Auth, Edge Functions
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('supabase.in') ||
    url.pathname.includes('/functions/v1/') ||
    url.pathname.includes('/auth/v1/') ||
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/storage/v1/') ||
    url.pathname.includes('/realtime/v1/') ||
    request.method !== 'GET'
  ) {
    return; // تجاهل — يذهب مباشرة للشبكة
  }

  // 2. الخطوط — Cache-First مع TTL طويل
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // 3. الصور الخارجية (CDN, Supabase Storage public URLs) — Cache-First
  if (
    request.destination === 'image' ||
    url.pathname.match(/\.(png|jpg|jpeg|webp|gif|svg|ico)$/)
  ) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response.ok && response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => cached ?? new Response('', { status: 404 }));
        })
      )
    );
    return;
  }

  // 4. Static Assets (JS, CSS, icons local) — Cache-First + Background Update
  if (
    url.pathname.match(/\.(js|css|woff2?|ttf|eot)$/) ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/assets/')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(request).then(cached => {
          const networkFetch = fetch(request).then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          }).catch(() => cached);
          // Stale-While-Revalidate: إعادة الكاش فوراً وتحديث في الخلفية
          return cached ?? networkFetch;
        })
      )
    );
    return;
  }

  // 5. الصفحة الرئيسية و HTML — Network-First مع Fallback للكاش
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) {
          caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
        }
        return response;
      }).catch(() =>
        caches.match('/').then(cached => cached ?? new Response('<h1>Offline</h1>', {
          headers: { 'Content-Type': 'text/html' },
        }))
      )
    );
  }
});
