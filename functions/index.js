/**
 * Cloud Functions (2.ª generación) – Plataforma de Brigadas de Emergencia
 *
 *  Disparadores Firestore
 *   - onEmergenciaCreada      fan-out multicanal (push → correo → WhatsApp → SMS) + canal de chat
 *   - onEmergenciaActualizada aviso de cierre
 *   - onRespuestaEscrita      contadores agregados y tiempo de respuesta (servidor)
 *   - onAlertaApoyoCreada     botón de pánico → coordinadores / jefes
 *   - onTokenEscrito          suscripción a temas FCM (todos, sede_x, rol_x)
 *   - onUserWritten           directorio público, bloqueo de cuentas inactivas
 *   - onMensajeCreado         último mensaje del canal + push en mensajes directos
 *  Callables
 *   - crearUsuario, asignarRol
 *  Programadas
 *   - escalarSinRespuesta (cada 2 min), revisarCertificaciones (diaria)
 */
const crypto = require('node:crypto');
const admin = require('firebase-admin');
const { setGlobalOptions, logger } = require('firebase-functions/v2');
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const ch = require('./src/channels');
const { TIPOS, NIVELES, ROLES, RANK, emailEmergencia } = require('./src/labels');

admin.initializeApp();
const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

setGlobalOptions({ region: process.env.FUNCTIONS_REGION || 'us-central1', maxInstances: 30, memory: '512MiB' });

const APP_URL = () => (process.env.APP_URL || '').replace(/\/?$/, '/');
const ORG = () => process.env.ORG_NAME || 'Organización';
const TZ = () => process.env.TIMEZONE || 'America/Bogota';
const enforceAppCheck = process.env.ENFORCE_APP_CHECK === 'true';

/** Idempotencia: los disparadores pueden ejecutarse más de una vez. */
async function once(event) {
  try {
    await db.doc(`_eventos/${event.id}`).create({
      at: FieldValue.serverTimestamp(),
      expireAt: Timestamp.fromMillis(Date.now() + 7 * 86400000), // configurar política TTL sobre expireAt
    });
    return true;
  } catch (e) {
    if (e.code === 6 /* ALREADY_EXISTS */) return false;
    throw e;
  }
}

async function logEnvio(ref, resultados) {
  const batch = db.batch();
  resultados.forEach((r) => {
    batch.set(db.collection('notificacionesLog').doc(), {
      ...r,
      canal: r.channel,
      ref,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
}

function audit(accion, uid, detalle, entidad) {
  return db.collection('auditoria').add({
    accion,
    uid: uid || 'sistema',
    email: 'cloud-function',
    detalle,
    entidad,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/** Brigadistas activos convocados a una emergencia. */
async function destinatarios(sedeId) {
  let q = db.collection('users').where('estado', '==', 'activo');
  if (sedeId && sedeId !== 'todas') q = q.where('sedeId', '==', sedeId);
  const snap = await q.select('nombre', 'email', 'telefono', 'sedeId', 'role').get();
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

const condicionTemas = (sedeId) =>
  !sedeId || sedeId === 'todas'
    ? { topic: 'todos' }
    : { condition: `'sede_${sedeId}' in topics || 'rol_coordinador' in topics || 'rol_admin' in topics` };

/* =================================================================== */
/*  1. Activación de emergencia: fan-out multicanal                     */
/* =================================================================== */
exports.onEmergenciaCreada = onDocumentCreated({ document: 'emergencias/{id}', timeoutSeconds: 300 }, async (event) => {
  if (!(await once(event))) return;
  const e = event.data.data();
  const id = event.params.id;
  const ref = event.data.ref;
  const link = `${APP_URL()}#/emergencias/${id}`;
  const titulo = `${e.esSimulacro ? '🟢 SIMULACRO' : '🚨 EMERGENCIA'}: ${TIPOS[e.tipo] || e.tipo}`;
  const cuerpo = `Nivel ${NIVELES[e.nivel] || e.nivel} · ${e.sedeNombre || 'Todas las sedes'}. ${e.descripcion || 'Reporte su estado.'}`.slice(0, 230);
  const critical = ['alto', 'critico'].includes(e.nivel);

  // Canal de chat de la emergencia (no bloquea el envío)
  const canal = db.doc(`canales/emergencia_${id}`).set({
    nombre: `${TIPOS[e.tipo] || e.tipo} · ${e.sedeNombre || 'Todas'}`,
    tipo: 'emergencia',
    publico: true,
    activo: true,
    emergenciaId: id,
    createdAt: FieldValue.serverTimestamp(),
  });

  // 1) Push primero: es el canal más rápido
  const push = await ch.pushTopic({
    ...condicionTemas(e.sedeId),
    title: titulo,
    body: cuerpo,
    link,
    critical,
    tag: `emergencia-${id}`,
    data: { tipo: 'emergencia', emergenciaId: id, path: `/emergencias/${id}`, priority: critical ? 'critical' : 'high' },
  });
  await ref.update({ 'notificaciones.push': push, 'notificaciones.inicio': FieldValue.serverTimestamp() });

  // 2) Resto de canales en paralelo
  const users = await destinatarios(e.sedeId);
  const telefonos = users.map((u) => u.telefono).filter(Boolean);
  const smsInmediato = (process.env.SMS_NIVELES_INMEDIATOS || 'critico').split(',').includes(e.nivel);
  const [email, whatsapp, sms] = await Promise.all([
    ch.sendEmail(users.map((u) => u.email), titulo, emailEmergencia(e, link, ORG()), `${titulo}\n${cuerpo}\n${link}`),
    ch.sendWhatsApp(telefonos, [TIPOS[e.tipo] || e.tipo, NIVELES[e.nivel] || e.nivel, e.sedeNombre || 'Todas', link]),
    smsInmediato ? ch.sendSMS(telefonos, `${titulo}. ${cuerpo} ${link}`) : Promise.resolve({ channel: 'sms', status: 'pending', count: 0 }),
  ]);

  await Promise.all([
    ref.update({
      'notificaciones.destinatarios': users.length,
      'notificaciones.email': email,
      'notificaciones.whatsapp': whatsapp,
      'notificaciones.sms': sms,
      'notificaciones.fin': FieldValue.serverTimestamp(),
    }),
    logEnvio({ col: 'emergencias', id }, [push, email, whatsapp, sms]),
    canal,
  ]);
  logger.info(`Emergencia ${id}: ${users.length} destinatarios`, { push, email, whatsapp, sms });
});

/* =================================================================== */
/*  2. Cierre de emergencia                                             */
/* =================================================================== */
exports.onEmergenciaActualizada = onDocumentUpdated('emergencias/{id}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (before.estado !== 'activa' || after.estado !== 'cerrada') return;
  if (!(await once(event))) return;
  const id = event.params.id;
  await Promise.all([
    db.doc(`canales/emergencia_${id}`).set({ activo: false }, { merge: true }),
    ch.pushTopic({
      ...condicionTemas(after.sedeId),
      title: `✅ ${after.esSimulacro ? 'Simulacro finalizado' : 'Emergencia controlada'}`,
      body: `${TIPOS[after.tipo] || after.tipo} · ${after.sedeNombre || ''}. ${after.observacionesCierre || ''}`.slice(0, 230),
      link: `${APP_URL()}#/emergencias/${id}`,
      tag: `emergencia-${id}`,
      data: { tipo: 'cierre', emergenciaId: id, path: `/emergencias/${id}` },
    }),
  ]);
});

/* =================================================================== */
/*  3. Respuestas: agregados en el documento de la emergencia           */
/* =================================================================== */
exports.onRespuestaEscrita = onDocumentWritten('emergencias/{emId}/respuestas/{uid}', async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  if (!after) return;
  if (before && before.estado === after.estado) return; // sin cambio de estado (o escritura del propio servidor)
  if (!(await once(event))) return;

  const emRef = db.doc(`emergencias/${event.params.emId}`);
  const upd = { [`stats.${after.estado}`]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() };
  if (before?.estado) upd[`stats.${before.estado}`] = FieldValue.increment(-1);

  if (!before) {
    const em = (await emRef.get()).data() || {};
    const t0 = em.createdAt?.toMillis?.();
    const tServer = after.primeraRespuestaAt?.toMillis?.() ?? Date.now();
    // Si respondió sin conexión, la sincronización tardía no debe penalizar:
    // se usa la hora del dispositivo solo si es posterior a la activación y anterior a la del servidor.
    const tClient = after.primeraRespuestaClientAt;
    const t = tClient && t0 && tClient > t0 && tClient < tServer ? tClient : tServer;
    upd.totalRespuestas = FieldValue.increment(1);
    if (t0) {
      const seg = Math.max(0, Math.round((t - t0) / 1000));
      upd.respuestasConTiempo = FieldValue.increment(1);
      upd.sumTiempoRespuestaSeg = FieldValue.increment(seg);
      await event.data.after.ref.update({ tiempoRespuestaSeg: seg });
    }
  }
  await emRef.update(upd);

  if (after.estado === 'necesito_apoyo') {
    await ch.pushTopic({
      condition: "'rol_coordinador' in topics || 'rol_admin' in topics || 'rol_jefe_brigada' in topics",
      title: `🆘 ${after.nombre} necesita apoyo`,
      body: after.nota || 'Reportado desde la emergencia activa',
      link: `${APP_URL()}#/emergencias/${event.params.emId}`,
      critical: true,
      tag: `apoyo-${event.params.uid}`,
      data: { tipo: 'apoyo', path: `/emergencias/${event.params.emId}`, priority: 'critical' },
    });
  }
});

/* =================================================================== */
/*  4. Botón de pánico                                                  */
/* =================================================================== */
exports.onAlertaApoyoCreada = onDocumentCreated('alertasApoyo/{id}', async (event) => {
  if (!(await once(event))) return;
  const a = event.data.data();
  const maps = a.ubicacion ? `https://www.google.com/maps?q=${a.ubicacion.lat},${a.ubicacion.lng}` : '';
  const link = a.ubicacion ? `${APP_URL()}#/mapa?lat=${a.ubicacion.lat}&lng=${a.ubicacion.lng}` : `${APP_URL()}#/`;
  const titulo = `🆘 SOS: ${a.nombre} solicita apoyo`;
  const cuerpo = `${a.mensaje || 'Solicitud de apoyo urgente'}${maps ? ` · ${maps}` : ''}`;

  const coords = (await db.collection('users').where('role', 'in', ['coordinador', 'admin']).where('estado', '==', 'activo')
    .select('email', 'telefono', 'sedeId').get()).docs.map((d) => d.data())
    .filter((u) => !a.sedeId || !u.sedeId || u.sedeId === a.sedeId);

  const resultados = await Promise.all([
    ch.pushTopic({
      condition: "'rol_coordinador' in topics || 'rol_admin' in topics || 'rol_jefe_brigada' in topics",
      title: titulo, body: cuerpo, link, critical: true, tag: `sos-${event.params.id}`,
      data: { tipo: 'sos', path: '/mapa', priority: 'critical' },
    }),
    ch.sendEmail(coords.map((u) => u.email), titulo, `<p><strong>${titulo}</strong></p><p>${cuerpo}</p><p><a href="${link}">Abrir en la plataforma</a></p>`, `${titulo}\n${cuerpo}\n${link}`),
    ch.sendSMS(coords.map((u) => u.telefono), `${titulo}. ${cuerpo}`),
  ]);
  await Promise.all([
    event.data.ref.update({ notificaciones: Object.fromEntries(resultados.map((r) => [r.channel, r])) }),
    logEnvio({ col: 'alertasApoyo', id: event.params.id }, resultados),
  ]);
});

/* =================================================================== */
/*  5. Tokens FCM → temas                                               */
/* =================================================================== */
exports.onTokenEscrito = onDocumentWritten('fcmTokens/{token}', async (event) => {
  const token = event.params.token;
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  const m = admin.messaging();

  if (!after) {
    await Promise.all((before?.topics || []).map((t) => m.unsubscribeFromTopic([token], t).catch(() => {})));
    return;
  }
  let role = 'brigadista';
  let sedeId = after.sedeId;
  try {
    role = (await admin.auth().getUser(after.uid)).customClaims?.role || 'brigadista'; // nunca confiar en el cliente
    sedeId = (await db.doc(`users/${after.uid}`).get()).get('sedeId') || null;
  } catch {
    /* usuario inexistente */
  }
  const desired = ['todos', `rol_${role}`, ...(sedeId ? [`sede_${sedeId}`] : [])].sort();
  const current = [...(after.topics || [])].sort();
  if (JSON.stringify(desired) === JSON.stringify(current)) return;

  const add = desired.filter((t) => !current.includes(t));
  const rem = current.filter((t) => !desired.includes(t));
  await Promise.all([
    ...add.map((t) => m.subscribeToTopic([token], t)),
    ...rem.map((t) => m.unsubscribeFromTopic([token], t)),
  ]);
  await event.data.after.ref.update({ topics: desired, sedeId: sedeId || null });
});

/* =================================================================== */
/*  6. Usuarios: directorio, bloqueo y cambios de sede                  */
/* =================================================================== */
exports.onUserWritten = onDocumentWritten('users/{uid}', async (event) => {
  const uid = event.params.uid;
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  const dir = db.doc(`directorio/${uid}`);

  if (!after) {
    await dir.delete();
    return;
  }
  await dir.set({
    nombre: after.nombre || '',
    cargo: after.cargo || '',
    area: after.area || '',
    brigadas: after.brigadas || [],
    sedeId: after.sedeId || null,
    fotoUrl: after.fotoUrl || null,
    role: after.role || 'brigadista',
    estado: after.estado || 'activo',
  });

  if (before && before.estado !== after.estado) {
    const disabled = after.estado === 'inactivo';
    await admin.auth().updateUser(uid, { disabled }).catch((e) => logger.warn('updateUser', e.message));
    if (disabled) await admin.auth().revokeRefreshTokens(uid).catch(() => {});
    await audit(disabled ? 'usuario.desactivar' : 'usuario.activar', null, { uid }, { col: 'users', id: uid });
  }
  if (before && (before.sedeId !== after.sedeId || before.role !== after.role)) {
    // Fuerza la re-suscripción de temas en onTokenEscrito
    const tokens = await db.collection('fcmTokens').where('uid', '==', uid).get();
    await Promise.all(tokens.docs.map((d) => d.ref.update({ sedeId: after.sedeId || null, refreshedAt: FieldValue.serverTimestamp() })));
  }
});

/* =================================================================== */
/*  7. Chat                                                             */
/* =================================================================== */
exports.onMensajeCreado = onDocumentCreated('canales/{canalId}/mensajes/{msgId}', async (event) => {
  const msg = event.data.data();
  const canalRef = db.doc(`canales/${event.params.canalId}`);
  const preview = `${msg.autor?.nombre || ''}: ${msg.texto || (msg.adjunto ? '📎 adjunto' : '')}`.slice(0, 120);
  await canalRef.update({ ultimoMensaje: preview, ultimoMensajeAt: FieldValue.serverTimestamp() }).catch(() => {});
  const canal = (await canalRef.get()).data();
  if (canal?.tipo === 'directo') {
    const otros = (canal.miembros || []).filter((u) => u !== msg.autor?.uid);
    await ch.pushUsers(otros, {
      title: `Mensaje de ${msg.autor?.nombre}`,
      body: msg.texto?.slice(0, 160) || 'Adjunto',
      link: `${APP_URL()}#/chat?canal=${event.params.canalId}`,
      tag: `chat-${event.params.canalId}`,
      data: { tipo: 'chat', path: `/chat?canal=${event.params.canalId}` },
    });
  }
});

/* =================================================================== */
/*  8. Callables de administración                                      */
/* =================================================================== */
const PERFIL = ['nombre', 'tipoDocumento', 'documento', 'cargo', 'area', 'telefono', 'brigadas', 'sedeId', 'estado',
  'grupoSanguineo', 'contactoEmergencia', 'disponible'];

function toTs(v) {
  if (v == null || v === '') return null;
  const d = new Date(typeof v === 'number' ? v : String(v));
  return Number.isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
}

exports.crearUsuario = onCall({ enforceAppCheck }, async (req) => {
  const callerRole = req.auth?.token?.role;
  if (!['admin', 'coordinador'].includes(callerRole)) throw new HttpsError('permission-denied', 'Requiere rol coordinador o administrador.');
  const d = req.data || {};
  const email = String(d.email || '').trim().toLowerCase();
  const role = d.role || 'brigadista';
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpsError('invalid-argument', 'Correo inválido.');
  if (!String(d.nombre || '').trim()) throw new HttpsError('invalid-argument', 'El nombre es obligatorio.');
  if (!ROLES.includes(role)) throw new HttpsError('invalid-argument', 'Rol inválido.');
  if (callerRole !== 'admin' && RANK[role] > RANK.jefe_brigada) {
    throw new HttpsError('permission-denied', 'Solo el administrador puede crear coordinadores o administradores.');
  }

  let user;
  try {
    user = await admin.auth().createUser({
      email,
      displayName: String(d.nombre).trim(),
      password: crypto.randomBytes(24).toString('base64url'), // el usuario define la suya con el enlace
      disabled: d.estado === 'inactivo',
    });
  } catch (e) {
    if (e.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'Ya existe una cuenta con ese correo.');
    throw new HttpsError('internal', e.message);
  }

  await admin.auth().setCustomUserClaims(user.uid, { role });
  const perfil = Object.fromEntries(PERFIL.filter((k) => d[k] !== undefined).map((k) => [k, d[k]]));
  await db.doc(`users/${user.uid}`).set({
    ...perfil,
    estado: d.estado || 'activo',
    disponible: d.disponible !== false,
    brigadas: Array.isArray(d.brigadas) ? d.brigadas : [],
    certificaciones: (Array.isArray(d.certificaciones) ? d.certificaciones : []).map((c) => ({
      nombre: String(c.nombre || ''),
      entidad: String(c.entidad || ''),
      fechaExpedicion: toTs(c.fechaExpedicion),
      fechaVencimiento: toTs(c.fechaVencimiento),
    })),
    email,
    role,
    creadoPor: req.auth.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    claimsUpdatedAt: FieldValue.serverTimestamp(),
  });

  let resetLink = null;
  try {
    resetLink = await admin.auth().generatePasswordResetLink(email, APP_URL() !== '/' ? { url: APP_URL() } : undefined);
  } catch {
    resetLink = await admin.auth().generatePasswordResetLink(email);
  }
  const mail = await ch.sendEmail(
    [email],
    `Bienvenido(a) a la plataforma de brigadas – ${ORG()}`,
    `<p>Hola ${d.nombre},</p><p>Fue registrado(a) como integrante de la brigada de emergencias de ${ORG()}.</p>
     <p><a href="${resetLink}">Defina su contraseña aquí</a> y luego instale la aplicación desde ${APP_URL()}</p>`,
  );
  await audit('usuario.crear', req.auth.uid, { email, role }, { col: 'users', id: user.uid });
  const emailEnviado = mail.status === 'sent';
  return { uid: user.uid, emailEnviado, resetLink: emailEnviado ? null : resetLink };
});

exports.asignarRol = onCall({ enforceAppCheck }, async (req) => {
  if (req.auth?.token?.role !== 'admin') throw new HttpsError('permission-denied', 'Solo el Administrador General asigna roles.');
  const { uid, role } = req.data || {};
  if (!uid || !ROLES.includes(role)) throw new HttpsError('invalid-argument', 'Datos inválidos.');
  if (uid === req.auth.uid && role !== 'admin') throw new HttpsError('failed-precondition', 'No puede quitarse su propio rol de administrador.');
  await admin.auth().setCustomUserClaims(uid, { role });
  await db.doc(`users/${uid}`).set({ role, claimsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await audit('usuario.rol', req.auth.uid, { uid, role }, { col: 'users', id: uid });
  return { ok: true };
});

/* =================================================================== */
/*  9. Escalamiento: sin respuesta → SMS + WhatsApp                     */
/* =================================================================== */
exports.escalarSinRespuesta = onSchedule({ schedule: 'every 2 minutes', timeZone: 'UTC', timeoutSeconds: 300 }, async () => {
  const minutos = Number(process.env.ESCALAR_MINUTOS || 3);
  const limite = Date.now() - minutos * 60_000;
  const activas = await db.collection('emergencias').where('estado', '==', 'activa').get();

  for (const doc of activas.docs) {
    const e = doc.data();
    if (e.escalado || !['alto', 'critico'].includes(e.nivel)) continue;
    if ((e.createdAt?.toMillis?.() || Date.now()) > limite) continue;

    // Marca primero (transacción) para que dos ejecuciones no escalen dos veces
    const tomado = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      if (fresh.get('escalado')) return false;
      tx.update(doc.ref, { escalado: true, escaladoAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (!tomado) continue;

    const respondieron = new Set((await doc.ref.collection('respuestas').select().get()).docs.map((d) => d.id));
    const pendientes = (await destinatarios(e.sedeId)).filter((u) => !respondieron.has(u.uid));
    const tel = pendientes.map((u) => u.telefono).filter(Boolean);
    const link = `${APP_URL()}#/emergencias/${doc.id}`;
    const texto = `URGENTE sin respuesta: ${TIPOS[e.tipo] || e.tipo} nivel ${NIVELES[e.nivel]} en ${e.sedeNombre || 'su sede'}. Reporte su estado: ${link}`;
    const [sms, wa, push] = await Promise.all([
      ch.sendSMS(tel, texto),
      ch.sendWhatsApp(tel, [TIPOS[e.tipo] || e.tipo, NIVELES[e.nivel] || e.nivel, e.sedeNombre || 'Todas', link]),
      ch.pushUsers(pendientes.map((u) => u.uid), { title: '⏰ Aún no ha respondido', body: texto, link, critical: true, tag: `emergencia-${doc.id}` }),
    ]);
    await doc.ref.update({ 'notificaciones.escalamiento': { pendientes: pendientes.length, sms, whatsapp: wa, push } });
    await logEnvio({ col: 'emergencias', id: doc.id, escalamiento: true }, [sms, wa, push]);
  }
});

/* =================================================================== */
/* 10. Vencimiento de certificaciones (diario 07:00)                    */
/* =================================================================== */
exports.revisarCertificaciones = onSchedule({ schedule: '0 7 * * *', timeZone: TZ() }, async () => {
  const hoy = Date.now();
  const en30 = hoy + 30 * 86400000;
  const snap = await db.collection('users').where('estado', '==', 'activo').get();
  const alertas = [];
  snap.forEach((d) => {
    (d.get('certificaciones') || []).forEach((c) => {
      const v = c.fechaVencimiento?.toMillis?.();
      if (v && v <= en30) alertas.push({ uid: d.id, nombre: d.get('nombre'), cert: c.nombre, vence: new Date(v), vencida: v < hoy });
    });
  });
  if (!alertas.length) return;

  const fmt = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: TZ() });
  for (const a of alertas) {
    await ch.pushUsers([a.uid], {
      title: a.vencida ? 'Certificación vencida' : 'Certificación por vencer',
      body: `${a.cert}: ${fmt.format(a.vence)}`,
      link: `${APP_URL()}#/perfil`,
      tag: `cert-${a.uid}`,
    });
  }
  const coords = (await db.collection('users').where('role', 'in', ['coordinador', 'admin']).where('estado', '==', 'activo').select('email').get())
    .docs.map((d) => d.get('email'));
  const filas = alertas.map((a) => `<tr><td>${a.nombre}</td><td>${a.cert}</td><td>${fmt.format(a.vence)}</td><td>${a.vencida ? 'VENCIDA' : 'Por vencer'}</td></tr>`).join('');
  await ch.sendEmail(coords, `Certificaciones de brigadistas: ${alertas.length} alerta(s)`,
    `<table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Brigadista</th><th>Certificación</th><th>Vencimiento</th><th>Estado</th></tr>${filas}</table>`);
  logger.info(`Certificaciones: ${alertas.length} alertas`);
});
