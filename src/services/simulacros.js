import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { logAudit } from './audit';
import { toDate } from '../utils/format';

export async function guardarSimulacro(id, data, user, profile) {
  const payload = {
    fecha: data.fecha instanceof Date ? data.fecha : new Date(data.fecha),
    tipo: data.tipo,
    sedeId: data.sedeId || null,
    emergenciaId: data.emergenciaId || null,
    escenario: data.escenario || '',
    participantes: data.participantes || [],
    totalParticipantes: Number(data.totalParticipantes) || (data.participantes || []).length,
    personasEvacuadas: Number(data.personasEvacuadas) || 0,
    poblacionEsperada: Number(data.poblacionEsperada) || 0,
    tiempoAlertaSeg: Number(data.tiempoAlertaSeg) || 0,
    tiempoEvacuacionSeg: Number(data.tiempoEvacuacionSeg) || 0,
    tiempoObjetivoSeg: Number(data.tiempoObjetivoSeg) || 0,
    hallazgos: (data.hallazgos || []).filter((h) => h.descripcion?.trim()),
    accionesCorrectivas: (data.accionesCorrectivas || []).filter((a) => a.descripcion?.trim()),
    calificacion: data.calificacion || null,
    updatedAt: serverTimestamp(),
  };
  if (id) {
    await updateDoc(doc(db, 'simulacros', id), payload);
    logAudit('simulacro.actualizar', {}, { col: 'simulacros', id });
    return id;
  }
  const ref = await addDoc(collection(db, 'simulacros'), {
    ...payload,
    creadoPor: { uid: user.uid, nombre: profile?.nombre || user.email },
    createdAt: serverTimestamp(),
  });
  logAudit('simulacro.crear', { tipo: payload.tipo }, { col: 'simulacros', id: ref.id });
  return ref.id;
}

/** Indicadores de gestión de simulacros. */
export function indicadoresSimulacros(simulacros) {
  const n = simulacros.length;
  const conTiempo = simulacros.filter((s) => s.tiempoEvacuacionSeg > 0);
  const acciones = simulacros.flatMap((s) => s.accionesCorrectivas || []);
  const cerradas = acciones.filter((a) => a.estado === 'cerrada').length;
  const conPoblacion = simulacros.filter((s) => s.poblacionEsperada > 0);
  const porMes = {};
  simulacros.forEach((s) => {
    const d = toDate(s.fecha);
    if (!d) return;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    porMes[k] = (porMes[k] || 0) + 1;
  });
  const cumplenObjetivo = conTiempo.filter((s) => s.tiempoObjetivoSeg && s.tiempoEvacuacionSeg <= s.tiempoObjetivoSeg);
  return {
    total: n,
    tiempoPromedioSeg: conTiempo.length ? conTiempo.reduce((a, s) => a + s.tiempoEvacuacionSeg, 0) / conTiempo.length : null,
    mejorTiempoSeg: conTiempo.length ? Math.min(...conTiempo.map((s) => s.tiempoEvacuacionSeg)) : null,
    participacionPromedio: n ? simulacros.reduce((a, s) => a + (s.totalParticipantes || 0), 0) / n : 0,
    coberturaEvacuacion: conPoblacion.length
      ? conPoblacion.reduce((a, s) => a + s.personasEvacuadas / s.poblacionEsperada, 0) / conPoblacion.length
      : null,
    hallazgos: simulacros.reduce((a, s) => a + (s.hallazgos?.length || 0), 0),
    acciones: acciones.length,
    accionesCerradas: cerradas,
    cumplimientoAcciones: acciones.length ? cerradas / acciones.length : null,
    cumplimientoObjetivo: conTiempo.length ? cumplenObjetivo.length / conTiempo.length : null,
    porMes: Object.entries(porMes).sort(([a], [b]) => a.localeCompare(b)).map(([mes, total]) => ({ mes, total })),
  };
}
