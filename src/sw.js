/* Service Worker unificado: precache + caché inteligente + Firebase Cloud Messaging */
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { clientsClaim } from 'workbox-core';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';
import { firebaseConfig } from './config/firebaseConfig';

self.skipWaiting();
clientsClaim();

// 1) Precache del "app shell" (lista inyectada en build)
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// 2) Navegación SPA: siempre responde con index.html (funciona offline)
registerRoute(new NavigationRoute(createHandlerBoundToURL(`${import.meta.env.BASE_URL}index.html`)));

// 3) Teselas de mapa: CacheFirst con límite para no saturar el dispositivo
registerRoute(
  ({ url }) => /tile\.openstreetmap\.org$/.test(url.hostname) || url.hostname.endsWith('basemaps.cartocdn.com'),
  new CacheFirst({
    cacheName: 'map-tiles',
    plugins: [new ExpirationPlugin({ maxEntries: 1500, maxAgeSeconds: 30 * 24 * 3600, purgeOnQuotaError: true })],
  }),
);

// 4) Archivos de Firebase Storage (fotos, planos): StaleWhileRevalidate
registerRoute(
  ({ url }) => url.hostname === 'firebasestorage.googleapis.com' || url.hostname.endsWith('.firebasestorage.app'),
  new StaleWhileRevalidate({
    cacheName: 'storage-files',
    plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 14 * 24 * 3600, purgeOnQuotaError: true })],
  }),
);

// 5) Fuentes
registerRoute(
  ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
  new StaleWhileRevalidate({ cacheName: 'fonts' }),
);

// 6) Otras peticiones GET del mismo origen
registerRoute(
  ({ request, url }) => request.method === 'GET' && url.origin === self.location.origin,
  new NetworkFirst({ cacheName: 'runtime', networkTimeoutSeconds: 4 }),
);

// ---------- Firebase Cloud Messaging (segundo plano) ----------
// Protegido con try/catch: una configuración incompleta nunca debe impedir que
// el Service Worker se instale (rompería el modo offline).
try {
  if (!firebaseConfig.apiKey || !firebaseConfig.appId || !firebaseConfig.messagingSenderId) throw new Error('FCM sin configurar');
  const app = initializeApp(firebaseConfig);
  const messaging = getMessaging(app);

  // Mensajes de solo datos: se muestran aquí. Los que traen "notification"
  // los muestra el SDK automáticamente.
  onBackgroundMessage(messaging, (payload) => {
    if (payload.notification) return;
    const d = payload.data || {};
    self.registration.showNotification(d.title || 'Alerta de emergencia', {
      body: d.body || '',
      icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
      badge: `${import.meta.env.BASE_URL}icons/badge-96.png`,
      tag: d.tag || 'brigadas',
      renotify: true,
      requireInteraction: d.priority === 'critical' || d.priority === 'high',
      vibrate: [500, 200, 500, 200, 800],
      data: { link: d.link || import.meta.env.BASE_URL },
    });
  });
} catch (e) {
  console.warn('[SW] Push deshabilitado:', e.message);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link =
    event.notification.data?.link ||
    event.notification.data?.FCM_MSG?.notification?.click_action ||
    event.notification.data?.FCM_MSG?.data?.link ||
    import.meta.env.BASE_URL;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          w.navigate?.(link);
          return w.focus();
        }
      }
      return self.clients.openWindow(link);
    }),
  );
});
