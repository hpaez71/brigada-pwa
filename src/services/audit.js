import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

const device = () => ({
  userAgent: navigator.userAgent.slice(0, 300),
  online: navigator.onLine,
  standalone: window.matchMedia?.('(display-mode: standalone)').matches || false,
});

/** Registro de auditoría inmutable (las reglas impiden editar o borrar). */
export function logAudit(accion, detalle = {}, entidad = null) {
  const u = auth.currentUser;
  if (!u) return Promise.resolve();
  return addDoc(collection(db, 'auditoria'), {
    accion,
    detalle,
    entidad,
    uid: u.uid,
    email: u.email,
    createdAt: serverTimestamp(),
    ...device(),
  }).catch((e) => console.warn('auditoría', e));
}

/** Historial de accesos (login / logout). */
export function logAcceso(tipo, user) {
  return addDoc(collection(db, 'accesos'), {
    tipo,
    uid: user.uid,
    email: user.email,
    createdAt: serverTimestamp(),
    ...device(),
  }).catch((e) => console.warn('accesos', e));
}
