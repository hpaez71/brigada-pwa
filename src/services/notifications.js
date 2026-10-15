import { getToken, onMessage, deleteToken } from 'firebase/messaging';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, messagingPromise } from '../config/firebase';

const TOKEN_KEY = 'brigadas.fcmToken';

export const pushSupported = () =>
  'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

/**
 * Pide permiso, obtiene el token FCM (usando el SW de la PWA) y lo registra en
 * fcmTokens/{token}. Una Cloud Function lo suscribe a los temas de su sede y rol.
 */
export async function enablePush(user, profile) {
  if (!pushSupported()) {
    throw new Error(
      isIOS() && !isStandalone()
        ? 'En iPhone primero instale la app: Compartir → "Agregar a inicio" (iOS 16.4+).'
        : 'Este navegador no soporta notificaciones push.',
    );
  }
  if (Notification.permission === 'denied') {
    throw new Error(
      'Chrome tiene bloqueadas las notificaciones de este sitio. Toque el ícono a la izquierda de la dirección → ' +
        'Permisos → Notificaciones → Permitir, y vuelva a intentarlo.',
    );
  }
  const permission = await Notification.requestPermission();
  if (permission === 'denied') {
    throw new Error(
      'Permiso denegado. Revise: Chrome → Configuración → Configuración de sitios → Notificaciones ' +
        '(debe estar activado), y Ajustes de Android → Apps → Chrome → Notificaciones.',
    );
  }
  if (permission !== 'granted') {
    throw new Error(
      'No se concedió el permiso (la ventana no apareció o se cerró). Busque una campana 🔔 en la barra de ' +
        'direcciones y toque Permitir; o en Chrome → Configuración → Configuración de sitios → Notificaciones, ' +
        'desactive "Usar mensajes más discretos" y vuelva a intentarlo.',
    );
  }

  const messaging = await messagingPromise;
  if (!messaging) throw new Error('Firebase Messaging no está disponible en este navegador.');

  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(messaging, {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new Error('No fue posible obtener el token de notificaciones.');

  await setDoc(
    doc(db, 'fcmTokens', token),
    {
      uid: user.uid,
      sedeId: profile?.sedeId || null,
      platform: isIOS() ? 'ios' : /android/i.test(navigator.userAgent) ? 'android' : 'web',
      standalone: isStandalone(),
      userAgent: navigator.userAgent.slice(0, 200),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  localStorage.setItem(TOKEN_KEY, token);
  return token;
}

export async function disablePush() {
  const token = localStorage.getItem(TOKEN_KEY);
  const messaging = await messagingPromise;
  if (token) await deleteDoc(doc(db, 'fcmTokens', token)).catch(() => {});
  if (messaging) await deleteToken(messaging).catch(() => {});
  localStorage.removeItem(TOKEN_KEY);
}

export const hasPushToken = () => Boolean(localStorage.getItem(TOKEN_KEY)) && Notification?.permission === 'granted';

/** Mensajes recibidos con la app abierta. */
export async function onForegroundMessage(cb) {
  const messaging = await messagingPromise;
  if (!messaging) return () => {};
  return onMessage(messaging, cb);
}

export async function showLocalNotification(title, body, link) {
  if (Notification?.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.ready;
  reg.showNotification(title, {
    body,
    icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
    badge: `${import.meta.env.BASE_URL}icons/badge-96.png`,
    vibrate: [400, 150, 400],
    data: { link: link || import.meta.env.BASE_URL },
  });
}
