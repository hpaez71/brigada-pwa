import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { logAudit } from './audit';

const autor = (user, profile) => ({ uid: user.uid, nombre: profile?.nombre || user.email });

/**
 * Activa una emergencia. La Cloud Function `onEmergenciaCreada` hace el
 * fan-out multicanal (push, correo, WhatsApp, SMS) y crea el canal de chat.
 */
export async function activarEmergencia(data, user, profile) {
  const payload = {
    tipo: data.tipo,
    nivel: data.nivel,
    sedeId: data.sedeId,
    sedeNombre: data.sedeNombre || null,
    descripcion: data.descripcion?.trim() || '',
    ubicacion: data.ubicacion || null,
    esSimulacro: data.tipo === 'simulacro',
    estado: 'activa',
    activadaPor: autor(user, profile),
    createdAt: serverTimestamp(),
    clientCreatedAt: Date.now(),
    totalRespuestas: 0,
    stats: {},
  };
  const ref = await addDoc(collection(db, 'emergencias'), payload);
  logAudit('emergencia.activar', { tipo: data.tipo, nivel: data.nivel, sedeId: data.sedeId }, { col: 'emergencias', id: ref.id });
  return ref.id;
}

export async function cerrarEmergencia(id, observaciones, user, profile) {
  await updateDoc(doc(db, 'emergencias', id), {
    estado: 'cerrada',
    closedAt: serverTimestamp(),
    cerradaPor: autor(user, profile),
    observacionesCierre: observaciones || '',
    updatedAt: serverTimestamp(),
  });
  logAudit('emergencia.cerrar', { observaciones }, { col: 'emergencias', id });
}

/** El brigadista reporta su estado. El documento usa su uid como id. */
export async function responder(emergenciaId, estado, ubicacion, user, profile, nota = '') {
  const ref = doc(db, 'emergencias', emergenciaId, 'respuestas', user.uid);
  let existe = false;
  try {
    existe = (await getDoc(ref)).exists();
  } catch {
    /* offline sin caché: se tratará como merge */
  }
  const data = {
    uid: user.uid,
    nombre: profile?.nombre || user.email,
    brigadas: profile?.brigadas || [],
    telefono: profile?.telefono || null,
    estado,
    nota: nota || null,
    ubicacion: ubicacion || null,
    updatedAt: serverTimestamp(),
    clientAt: Date.now(),
    historial: arrayUnion({ estado, at: Date.now(), ...(ubicacion ? { lat: ubicacion.lat, lng: ubicacion.lng } : {}) }),
  };
  if (!existe) {
    data.primeraRespuestaAt = serverTimestamp();
    data.primeraRespuestaClientAt = Date.now();
  }
  await setDoc(ref, data, { merge: true });
  logAudit('emergencia.responder', { estado }, { col: 'emergencias', id: emergenciaId });
}

/** Botón de pánico: evento prioritario con ubicación. */
export async function solicitarApoyo({ ubicacion, emergenciaId, mensaje }, user, profile) {
  const ref = await addDoc(collection(db, 'alertasApoyo'), {
    uid: user.uid,
    nombre: profile?.nombre || user.email,
    telefono: profile?.telefono || null,
    sedeId: profile?.sedeId || null,
    emergenciaId: emergenciaId || null,
    mensaje: mensaje || '',
    ubicacion: ubicacion || null,
    estado: 'abierta',
    prioridad: 'critica',
    createdAt: serverTimestamp(),
    clientCreatedAt: Date.now(),
  });
  if (emergenciaId) {
    responder(emergenciaId, 'necesito_apoyo', ubicacion, user, profile, mensaje).catch(() => {});
  }
  logAudit('apoyo.solicitar', { emergenciaId, ubicacion }, { col: 'alertasApoyo', id: ref.id });
  return ref.id;
}

export async function atenderApoyo(id, user, profile) {
  await updateDoc(doc(db, 'alertasApoyo', id), {
    estado: 'atendida',
    atendidaPor: autor(user, profile),
    atendidaAt: serverTimestamp(),
  });
  logAudit('apoyo.atender', {}, { col: 'alertasApoyo', id });
}
