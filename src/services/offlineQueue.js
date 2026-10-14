/**
 * Cola offline para archivos (evidencias y adjuntos de chat).
 * Firestore ya encola sus escrituras; Storage no, por eso los binarios se guardan
 * en IndexedDB y se suben al recuperar la conexión.
 */
import { get, set, del, keys, createStore } from 'idb-keyval';

const store = createStore('brigadas-offline', 'uploads');
const handlers = new Map();
const listeners = new Set();
let processing = false;

export function registerHandler(kind, fn) {
  handlers.set(kind, fn);
}

export async function enqueue(kind, payload) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await set(id, { id, kind, payload, createdAt: Date.now(), attempts: 0 }, store);
  notify();
  return id;
}

export async function pendingCount() {
  return (await keys(store)).length;
}

export function onQueueChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function notify() {
  const n = await pendingCount();
  listeners.forEach((fn) => fn(n));
}

export async function processQueue() {
  if (processing || !navigator.onLine) return;
  processing = true;
  try {
    for (const key of await keys(store)) {
      const item = await get(key, store);
      const fn = item && handlers.get(item.kind);
      if (!fn) continue;
      try {
        await fn(item.payload);
        await del(key, store);
      } catch (e) {
        console.warn('Cola offline: reintento pendiente', e);
        await set(key, { ...item, attempts: item.attempts + 1, lastError: String(e?.message || e) }, store);
      }
    }
  } finally {
    processing = false;
    notify();
  }
}

window.addEventListener('online', () => processQueue());
