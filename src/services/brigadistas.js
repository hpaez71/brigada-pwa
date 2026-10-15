import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { callable, db } from '../config/firebase';
import { compressImage, uploadFile } from './storage';
import { logAudit } from './audit';

// Campos editables desde el cliente (el rol y el email se cambian vía Cloud Functions).
const EDITABLES = [
  'nombre', 'documento', 'tipoDocumento', 'cargo', 'area', 'telefono', 'brigadas',
  'sedeId', 'estado', 'certificaciones', 'fotoUrl', 'disponible', 'grupoSanguineo', 'contactoEmergencia',
];

const pick = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => EDITABLES.includes(k)));

/** Crea cuenta de Auth + perfil + rol en el servidor (callable `crearUsuario`). */
export async function crearBrigadista(data) {
  // Los callables serializan JSON: las fechas viajan como milisegundos.
  const certificaciones = (data.certificaciones || []).map((c) => ({
    ...c,
    fechaExpedicion: c.fechaExpedicion ? new Date(c.fechaExpedicion).getTime() : null,
    fechaVencimiento: c.fechaVencimiento ? new Date(c.fechaVencimiento).getTime() : null,
  }));
  const res = await callable('crearUsuario')({
    ...pick(data),
    certificaciones,
    email: data.email,
    role: data.role || 'brigadista',
  });
  return res.data; // { uid, resetLink, emailEnviado }
}

export async function actualizarBrigadista(uid, data) {
  await updateDoc(doc(db, 'users', uid), { ...pick(data), updatedAt: serverTimestamp() });
  logAudit('brigadista.actualizar', { campos: Object.keys(pick(data)) }, { col: 'users', id: uid });
}

export async function asignarRol(uid, role) {
  await callable('asignarRol')({ uid, role });
}

export async function subirFoto(uid, file) {
  const f = await compressImage(file, 600, 0.85);
  const { url } = await uploadFile(`usuarios/${uid}/foto_${Date.now()}.jpg`, f);
  await updateDoc(doc(db, 'users', uid), { fotoUrl: url, updatedAt: serverTimestamp() });
  return url;
}

/** Aprueba (con rol) o rechaza una solicitud de registro propio. */
export async function aprobarUsuario(uid, role, aprobar = true) {
  await callable('aprobarUsuario')({ uid, role, aprobar });
}
