import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { compressImage, safeName, uploadFile } from './storage';
import { enqueue, registerHandler } from './offlineQueue';

async function subirAdjunto(canalId, file) {
  const up = await uploadFile(`chat/${canalId}/${Date.now()}_${safeName(file.name)}`, file);
  return { url: up.url, path: up.path, nombre: file.name, contentType: up.contentType, size: up.size };
}

async function guardarMensaje({ canalId, texto, file, autor, esEvidencia, clientAt }) {
  const adjunto = file ? await subirAdjunto(canalId, file) : null;
  await addDoc(collection(db, 'canales', canalId, 'mensajes'), {
    texto: texto || '',
    adjunto,
    esEvidencia: Boolean(esEvidencia),
    autor,
    clientAt: clientAt || Date.now(),
    createdAt: serverTimestamp(),
  });
}

registerHandler('mensaje', guardarMensaje);

export async function enviarMensaje(canalId, { texto, file, esEvidencia }, user, profile) {
  const payload = {
    canalId,
    texto: texto?.trim(),
    file: file ? await compressImage(file) : null,
    esEvidencia,
    clientAt: Date.now(),
    autor: { uid: user.uid, nombre: profile?.nombre || user.email, fotoUrl: profile?.fotoUrl || null },
  };
  if (payload.file && !navigator.onLine) {
    await enqueue('mensaje', payload);
    return { queued: true };
  }
  await guardarMensaje(payload); // texto sin archivo: Firestore lo encola si no hay red
  return { queued: false };
}

/** Canal directo determinístico entre dos usuarios. */
export async function abrirDirecto(user, profile, otro) {
  const ids = [user.uid, otro.id].sort();
  const id = `dm_${ids[0]}_${ids[1]}`;
  const ref = doc(db, 'canales', id);
  const snap = await getDoc(ref).catch(() => null);
  if (!snap?.exists()) {
    await setDoc(ref, {
      nombre: `${profile?.nombre || user.email} · ${otro.nombre}`,
      tipo: 'directo',
      publico: false,
      miembros: ids,
      nombres: { [user.uid]: profile?.nombre || user.email, [otro.id]: otro.nombre },
      createdAt: serverTimestamp(),
    });
  }
  return id;
}

export async function crearCanal(nombre, tipo = 'grupo', extra = {}) {
  const ref = await addDoc(collection(db, 'canales'), {
    nombre,
    tipo,
    publico: true,
    createdAt: serverTimestamp(),
    ...extra,
  });
  return ref.id;
}
