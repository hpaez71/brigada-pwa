/* global __APP_VERSION__ */
/** Versión de la compilación (la define vite.config.js). */
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'desarrollo';

/** Busca una versión nueva y recarga la app para aplicarla. */
export async function actualizarApp() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {
    /* sin Service Worker: basta con recargar */
  }
  window.location.reload();
}
