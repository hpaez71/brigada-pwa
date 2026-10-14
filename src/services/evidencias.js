import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { compressImage, safeName, sha256, uploadFile } from './storage';
import { enqueue, registerHandler } from './offlineQueue';
import { logAudit } from './audit';

const grupoDe = (m) => m.emergenciaId || (m.simulacroId ? `sim_${m.simulacroId}` : 'general');

async function persistir({ file, meta }, onProgress) {
  let archivo = null;
  if (file) {
    const path = `evidencias/${grupoDe(meta)}/${Date.now()}_${safeName(file.name)}`;
    const up = await uploadFile(path, file, onProgress, { autor: meta.autor.uid, sha256: meta.sha256 || '' });
    archivo = { url: up.url, path: up.path, nombre: file.name, size: up.size, contentType: up.contentType };
  }
  const ref = await addDoc(collection(db, 'evidencias'), {
    ...meta,
    archivo,
    createdAt: serverTimestamp(),
  });
  logAudit('evidencia.crear', { tipo: meta.tipo, sha256: meta.sha256 || null }, { col: 'evidencias', id: ref.id });
  return ref.id;
}

registerHandler('evidencia', (payload) => persistir(payload));

/**
 * Crea una evidencia (foto, video, documento, observación o acta).
 * Sin conexión, el archivo se guarda en IndexedDB y se sube automáticamente después.
 * @returns {{ id?: string, queued?: boolean }}
 */
export async function crearEvidencia(
  { tipo, file, observaciones, emergenciaId, simulacroId, acta, ubicacion },
  user,
  profile,
  onProgress,
) {
  const f = file ? await compressImage(file) : null;
  const meta = {
    tipo,
    observaciones: observaciones?.trim() || '',
    emergenciaId: emergenciaId || null,
    simulacroId: simulacroId || null,
    acta: acta || null,
    ubicacion: ubicacion || null,
    sha256: f ? await sha256(f) : null,
    capturadaAt: Date.now(),
    autor: { uid: user.uid, nombre: profile?.nombre || user.email },
    validada: false,
  };
  if (f && !navigator.onLine) {
    await enqueue('evidencia', { file: f, meta });
    return { queued: true };
  }
  const id = await persistir({ file: f, meta }, onProgress);
  return { id };
}

export async function validarEvidencia(id, validada) {
  await updateDoc(doc(db, 'evidencias', id), {
    validada,
    validadaPor: { uid: auth.currentUser.uid, at: Date.now() },
  });
  logAudit('evidencia.validar', { validada }, { col: 'evidencias', id });
}
