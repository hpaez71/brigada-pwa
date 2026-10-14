/**
 * Pruebas de reglas de Firestore con el emulador.
 *   npm run test:rules
 * (requiere Java 11+ y firebase-tools)
 */
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

let env;
const as = (uid, role) => env.authenticatedContext(uid, role ? { role } : {}).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const emergencia = (uid) => ({
  tipo: 'incendio',
  nivel: 'alto',
  sedeId: 'sede1',
  estado: 'activa',
  activadaPor: { uid, nombre: 'Jefe' },
  createdAt: serverTimestamp(),
  totalRespuestas: 0,
  stats: {},
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-brigadas',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'emergencias/em1'), { ...emergencia('jefe1'), createdAt: new Date() });
    await setDoc(doc(db, 'emergencias/cerrada'), { ...emergencia('jefe1'), estado: 'cerrada', createdAt: new Date() });
    await setDoc(doc(db, 'users/bri1'), { nombre: 'Brigadista', role: 'brigadista', estado: 'activo', telefono: '1' });
    await setDoc(doc(db, 'evidencias/ev1'), { tipo: 'foto', autor: { uid: 'bri1' }, createdAt: new Date() });
    await setDoc(doc(db, 'auditoria/a1'), { accion: 'x', uid: 'bri1', createdAt: new Date() });
    await setDoc(doc(db, 'sedes/sede1'), { nombre: 'Sede 1' });
  });
});

describe('Acceso general', () => {
  test('sin sesión no puede leer emergencias', async () => {
    await assertFails(getDoc(doc(anon(), 'emergencias/em1')));
  });
  test('usuario sin rol no puede leer sedes', async () => {
    await assertFails(getDoc(doc(as('x'), 'sedes/sede1')));
  });
  test('brigadista puede leer sedes y emergencias', async () => {
    await assertSucceeds(getDoc(doc(as('bri1', 'brigadista'), 'sedes/sede1')));
    await assertSucceeds(getDoc(doc(as('bri1', 'brigadista'), 'emergencias/em1')));
  });
});

describe('Activación de emergencias', () => {
  test('brigadista NO puede activar', async () => {
    await assertFails(addDoc(collection(as('bri1', 'brigadista'), 'emergencias'), emergencia('bri1')));
  });
  test('jefe de brigada puede activar a su nombre', async () => {
    await assertSucceeds(addDoc(collection(as('jefe1', 'jefe_brigada'), 'emergencias'), emergencia('jefe1')));
  });
  test('no puede activar a nombre de otro', async () => {
    await assertFails(addDoc(collection(as('jefe1', 'jefe_brigada'), 'emergencias'), emergencia('otro')));
  });
  test('nadie puede borrar una emergencia', async () => {
    await assertFails(deleteDoc(doc(as('adm', 'admin'), 'emergencias/em1')));
  });
});

describe('Respuestas', () => {
  const r = (uid, extra = {}) => ({ uid, estado: 'recibido', nombre: 'B', updatedAt: serverTimestamp(), ...extra });
  test('brigadista responde por sí mismo', async () => {
    await assertSucceeds(setDoc(doc(as('bri1', 'brigadista'), 'emergencias/em1/respuestas/bri1'), r('bri1')));
  });
  test('no puede responder por otro', async () => {
    await assertFails(setDoc(doc(as('bri1', 'brigadista'), 'emergencias/em1/respuestas/bri2'), r('bri2')));
  });
  test('no puede fijar su tiempo de respuesta', async () => {
    await assertFails(setDoc(doc(as('bri1', 'brigadista'), 'emergencias/em1/respuestas/bri1'), r('bri1', { tiempoRespuestaSeg: 1 })));
  });
  test('no puede responder a una emergencia cerrada', async () => {
    await assertFails(setDoc(doc(as('bri1', 'brigadista'), 'emergencias/cerrada/respuestas/bri1'), r('bri1')));
  });
});

describe('Perfiles y roles', () => {
  test('brigadista actualiza su teléfono', async () => {
    await assertSucceeds(updateDoc(doc(as('bri1', 'brigadista'), 'users/bri1'), { telefono: '2' }));
  });
  test('brigadista NO puede cambiar su rol', async () => {
    await assertFails(updateDoc(doc(as('bri1', 'brigadista'), 'users/bri1'), { role: 'admin' }));
  });
  test('coordinador NO puede cambiar roles desde el cliente', async () => {
    await assertFails(updateDoc(doc(as('c1', 'coordinador'), 'users/bri1'), { role: 'admin' }));
  });
  test('coordinador sí edita datos del perfil', async () => {
    await assertSucceeds(updateDoc(doc(as('c1', 'coordinador'), 'users/bri1'), { cargo: 'Operario' }));
  });
});

describe('Evidencias y auditoría (inmutables)', () => {
  test('evidencia no se puede borrar', async () => {
    await assertFails(deleteDoc(doc(as('bri1', 'brigadista'), 'evidencias/ev1')));
  });
  test('brigadista no modifica evidencias', async () => {
    await assertFails(updateDoc(doc(as('bri1', 'brigadista'), 'evidencias/ev1'), { observaciones: 'x' }));
  });
  test('coordinador no lee auditoría; admin sí', async () => {
    await assertFails(getDoc(doc(as('c1', 'coordinador'), 'auditoria/a1')));
    await assertSucceeds(getDoc(doc(as('adm', 'admin'), 'auditoria/a1')));
  });
  test('auditoría no se puede editar', async () => {
    await assertFails(updateDoc(doc(as('adm', 'admin'), 'auditoria/a1'), { accion: 'y' }));
  });
});
