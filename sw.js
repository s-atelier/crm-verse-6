// ─────────────────────────────────────────────────────────────
// sw.js — Pivo CRM
// Mỗi lần deploy: đổi CACHE_VERSION (copy y chang vào APP_VERSION trong index.html)
// ─────────────────────────────────────────────────────────────
const CACHE_VERSION = 'pivo-20260609-0854';
const CACHE_STATIC  = CACHE_VERSION + '-static';

// Chỉ cache CDN assets (JS/CSS libraries) — KHÔNG cache index.html
const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/flatpickr/4.6.13/flatpickr.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/flatpickr/4.6.13/flatpickr.min.js'
];

// ── Install: chỉ cache CDN, KHÔNG cache index.html ──
self.addEventListener('install', event => {
  self.skipWaiting(); // Kích hoạt SW mới ngay, không chờ tab đóng
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      return Promise.allSettled(CDN_ASSETS.map(url => cache.add(url)));
    })
  );
});

// ── Activate: xóa cache cũ → claim tất cả tab → báo reload ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(k => k !== CACHE_STATIC)
            .map(k => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
      .then(() =>
        // Báo tất cả tab/PWA đang mở → tự reload lấy HTML mới
        self.clients
          .matchAll({ type: 'window', includeUncontrolled: true })
          .then(clients =>
            clients.forEach(c =>
              c.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION })
            )
          )
      )
  );
});

// ── Fetch strategy ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. index.html — LUÔN network, không bao giờ cache
  //    Nếu offline → trả thẳng từ cache (fallback)
  const isHTML =
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html') ||
    event.request.mode === 'navigate';

  if (isHTML) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() =>
          // Offline fallback: trả bản cache cuối cùng nếu có
          caches.match('./index.html').then(cached => {
            if (cached) return cached;
            return new Response(
              '<h2 style="font-family:sans-serif;padding:2rem">Bạn đang offline. Vui lòng kết nối mạng để dùng Pivo.</h2>',
              { headers: { 'Content-Type': 'text/html' } }
            );
          })
        )
    );
    return;
  }

  // 2. API / Google / Telegram — luôn network, bỏ qua SW
  const alwaysLive = [
    'googleapis.com', 'accounts.google.com', 'api.telegram.org',
    'script.google.com'
  ];
  if (alwaysLive.some(d => url.hostname.includes(d))) {
    return; // browser tự fetch
  }

  // 3. CDN assets — cache-first (thư viện JS/CSS ít thay đổi)
  if (url.hostname.includes('cdnjs.cloudflare.com') ||
      url.hostname.includes('cdn.tailwindcss.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
    return;
  }

  // 4. Mọi thứ còn lại — network-first
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// ── Message handler ──
self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data.type === 'GET_VERSION') {
    event.source.postMessage({ type: 'SW_VERSION', version: CACHE_VERSION });
  }
});

// ── Firebase Cloud Messaging (background push) ──
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

try {
  firebase.initializeApp({
    apiKey: "AIzaSyCbX1EryC_4pmRpQ-F6sXUkSG6iLoUqFvM",
    authDomain: "pivo-crm.firebaseapp.com",
    projectId: "pivo-crm",
    storageBucket: "pivo-crm.firebasestorage.app",
    messagingSenderId: "626098511075",
    appId: "1:626098511075:web:26f91253d17c95f44d79d6"
  });
} catch(e) {}

const messaging = firebase.messaging();

// Nhận push khi app đang đóng hoặc background
messaging.onBackgroundMessage(payload => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || 'Pivo CRM', {
    body: body || '',
    icon: icon || './icon-192.png',
    badge: './icon-192.png',
    data: payload.data || {}
  });
});

// Bấm vào thông báo → mở app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('./');
    })
  );
});
