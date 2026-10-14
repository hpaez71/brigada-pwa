import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { safeName, uploadFile } from './storage';
import { logAudit } from './audit';

export async function guardarSede(id, data) {
  const payload = {
    nombre: data.nombre.trim(),
    tipo: data.tipo,
    direccion: data.direccion || '',
    responsable: data.responsable || '',
    telefono: data.telefono || '',
    ubicacion: data.ubicacion || null,
    puntosEncuentro: data.puntosEncuentro || [],
    rutas: data.rutas || [],
    planos: data.planos || [],
    activa: data.activa !== false,
    updatedAt: serverTimestamp(),
  };
  if (id) {
    await updateDoc(doc(db, 'sedes', id), payload);
    logAudit('sede.actualizar', { nombre: payload.nombre }, { col: 'sedes', id });
    return id;
  }
  const ref = await addDoc(collection(db, 'sedes'), { ...payload, createdAt: serverTimestamp() });
  logAudit('sede.crear', { nombre: payload.nombre }, { col: 'sedes', id: ref.id });
  return ref.id;
}

export async function subirPlano(sedeKey, file) {
  const up = await uploadFile(`sedes/${sedeKey}/${Date.now()}_${safeName(file.name)}`, file);
  return { nombre: file.name, url: up.url, path: up.path, contentType: up.contentType };
}
