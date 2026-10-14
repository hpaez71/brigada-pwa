import { ORG_NAME, EMERGENCIA_TIPOS, NIVELES, ESTADOS_RESPUESTA, BRIGADA_TIPOS, labelOf } from '../config/constants';
import { fmtDateTime, fmtDuration, fmtDate, toDate } from '../utils/format';

/* ---------------- Indicadores ---------------- */

export function indicadoresEmergencias(emergencias) {
  const totalResp = emergencias.reduce((a, e) => a + (e.respuestasConTiempo || 0), 0);
  const sumResp = emergencias.reduce((a, e) => a + (e.sumTiempoRespuestaSeg || 0), 0);
  const cerradas = emergencias.filter((e) => e.closedAt && e.createdAt);
  const conv = emergencias.filter((e) => e.notificaciones?.destinatarios > 0);
  const porTipo = {};
  const porNivel = {};
  emergencias.forEach((e) => {
    porTipo[e.tipo] = (porTipo[e.tipo] || 0) + 1;
    porNivel[e.nivel] = (porNivel[e.nivel] || 0) + 1;
  });
  return {
    total: emergencias.length,
    reales: emergencias.filter((e) => !e.esSimulacro).length,
    simulacros: emergencias.filter((e) => e.esSimulacro).length,
    activas: emergencias.filter((e) => e.estado === 'activa').length,
    tiempoRespuestaPromSeg: totalResp ? sumResp / totalResp : null,
    duracionPromSeg: cerradas.length
      ? cerradas.reduce((a, e) => a + (toDate(e.closedAt) - toDate(e.createdAt)) / 1000, 0) / cerradas.length
      : null,
    participacion: conv.length
      ? conv.reduce((a, e) => a + (e.totalRespuestas || 0) / e.notificaciones.destinatarios, 0) / conv.length
      : null,
    porTipo: EMERGENCIA_TIPOS.map((t) => ({ id: t.id, label: t.label, total: porTipo[t.id] || 0 })),
    porNivel: NIVELES.map((n) => ({ id: n.id, label: n.label, total: porNivel[n.id] || 0 })),
  };
}

export const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)} %`);

/* ---------------- PDF (jsPDF + autotable) ---------------- */

/**
 * @param {{titulo:string, subtitulo?:string, kpis?:[string,string][], tablas?:{titulo:string, columnas:string[], filas:any[][]}[], parrafos?:string[]}} def
 */
export async function exportarPDF(def, nombreArchivo) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();

  pdf.setFillColor(183, 28, 28);
  pdf.rect(0, 0, W, 64, 'F');
  pdf.setTextColor(255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text(def.titulo, 40, 30);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(`${ORG_NAME} · Generado: ${fmtDateTime(new Date())}`, 40, 48);
  pdf.setTextColor(30);

  let y = 88;
  if (def.subtitulo) {
    pdf.setFontSize(11);
    pdf.text(pdf.splitTextToSize(def.subtitulo, W - 80), 40, y);
    y += 24;
  }

  if (def.kpis?.length) {
    autoTable(pdf, {
      startY: y,
      head: [['Indicador', 'Valor']],
      body: def.kpis,
      theme: 'grid',
      headStyles: { fillColor: [38, 50, 56] },
      styles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 260 } },
      margin: { left: 40, right: 40 },
    });
    y = pdf.lastAutoTable.finalY + 20;
  }

  (def.parrafos || []).forEach((p) => {
    const lines = pdf.splitTextToSize(p, W - 80);
    if (y + lines.length * 12 > 780) {
      pdf.addPage();
      y = 50;
    }
    pdf.setFontSize(10);
    pdf.text(lines, 40, y);
    y += lines.length * 12 + 8;
  });

  (def.tablas || []).forEach((t) => {
    if (y > 720) {
      pdf.addPage();
      y = 50;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text(t.titulo, 40, y);
    pdf.setFont('helvetica', 'normal');
    autoTable(pdf, {
      startY: y + 8,
      head: [t.columnas],
      body: t.filas.length ? t.filas : [[{ content: 'Sin registros', colSpan: t.columnas.length }]],
      theme: 'striped',
      headStyles: { fillColor: [183, 28, 28] },
      styles: { fontSize: 8, cellPadding: 4 },
      margin: { left: 40, right: 40 },
    });
    y = pdf.lastAutoTable.finalY + 24;
  });

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(120);
    pdf.text(`Página ${i} de ${pages} · Documento generado por la plataforma de brigadas`, 40, 820);
  }
  pdf.save(nombreArchivo || `${def.titulo.replace(/\s+/g, '_')}.pdf`);
}

/* ---------------- Excel (ExcelJS) ---------------- */

/**
 * @param {{nombre:string, columnas:{header:string,key:string,width?:number}[], filas:object[]}[]} hojas
 */
export async function exportarExcel(hojas, nombreArchivo) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = ORG_NAME;
  wb.created = new Date();
  hojas.forEach((h) => {
    const ws = wb.addWorksheet(h.nombre.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = h.columnas.map((c) => ({ header: c.header, key: c.key, width: c.width || 18 }));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB71C1C' } };
    h.filas.forEach((f) => ws.addRow(f));
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: h.columnas.length } };
  });
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombreArchivo || 'reporte.xlsx';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------------- Mapeos de filas reutilizables ---------------- */

export const filaEmergencia = (e, sedes = {}) => ({
  fecha: fmtDateTime(e.createdAt),
  tipo: labelOf(EMERGENCIA_TIPOS, e.tipo),
  nivel: labelOf(NIVELES, e.nivel),
  sede: sedes[e.sedeId]?.nombre || e.sedeNombre || (e.sedeId === 'todas' ? 'Todas' : e.sedeId),
  estado: e.estado,
  activadaPor: e.activadaPor?.nombre,
  respuestas: e.totalRespuestas || 0,
  convocados: e.notificaciones?.destinatarios ?? '',
  tiempoResp: e.respuestasConTiempo ? fmtDuration(e.sumTiempoRespuestaSeg / e.respuestasConTiempo) : '—',
  duracion: e.closedAt ? fmtDuration((toDate(e.closedAt) - toDate(e.createdAt)) / 1000) : 'En curso',
});

export const COLS_EMERGENCIA = [
  { header: 'Fecha', key: 'fecha', width: 22 },
  { header: 'Tipo', key: 'tipo', width: 22 },
  { header: 'Nivel', key: 'nivel', width: 10 },
  { header: 'Sede', key: 'sede', width: 22 },
  { header: 'Estado', key: 'estado', width: 10 },
  { header: 'Activada por', key: 'activadaPor', width: 24 },
  { header: 'Respuestas', key: 'respuestas', width: 12 },
  { header: 'Convocados', key: 'convocados', width: 12 },
  { header: 'T. resp. prom.', key: 'tiempoResp', width: 14 },
  { header: 'Duración', key: 'duracion', width: 14 },
];

export const filaBrigadista = (u, sedes = {}) => ({
  nombre: u.nombre,
  documento: u.documento,
  cargo: u.cargo,
  area: u.area,
  telefono: u.telefono,
  email: u.email,
  sede: sedes[u.sedeId]?.nombre || '',
  brigadas: (u.brigadas || []).map((b) => labelOf(BRIGADA_TIPOS, b)).join(', '),
  estado: u.estado,
  certificaciones: (u.certificaciones || []).map((c) => `${c.nombre} (vence ${fmtDate(c.fechaVencimiento)})`).join('; '),
});

export const COLS_BRIGADISTA = [
  { header: 'Nombre', key: 'nombre', width: 28 },
  { header: 'Documento', key: 'documento', width: 14 },
  { header: 'Cargo', key: 'cargo', width: 20 },
  { header: 'Área', key: 'area', width: 16 },
  { header: 'Teléfono', key: 'telefono', width: 16 },
  { header: 'Correo', key: 'email', width: 28 },
  { header: 'Sede', key: 'sede', width: 18 },
  { header: 'Brigadas', key: 'brigadas', width: 30 },
  { header: 'Estado', key: 'estado', width: 10 },
  { header: 'Certificaciones', key: 'certificaciones', width: 50 },
];

/** Acta de la emergencia: cronología, respuestas y evidencias. */
export async function actaEmergenciaPDF(e, respuestas, evidencias, sedeNombre) {
  await exportarPDF(
    {
      titulo: `Acta de ${e.esSimulacro ? 'simulacro' : 'emergencia'}`,
      subtitulo: `${labelOf(EMERGENCIA_TIPOS, e.tipo)} · Nivel ${labelOf(NIVELES, e.nivel)} · ${sedeNombre || ''}`,
      kpis: [
        ['Activada', fmtDateTime(e.createdAt)],
        ['Activada por', e.activadaPor?.nombre || '—'],
        ['Cerrada', e.closedAt ? fmtDateTime(e.closedAt) : 'En curso'],
        ['Cerrada por', e.cerradaPor?.nombre || '—'],
        ['Duración', e.closedAt ? fmtDuration((toDate(e.closedAt) - toDate(e.createdAt)) / 1000) : '—'],
        ['Brigadistas convocados', String(e.notificaciones?.destinatarios ?? '—')],
        ['Respuestas recibidas', String(e.totalRespuestas || respuestas.length)],
        ['Tiempo promedio de respuesta', e.respuestasConTiempo ? fmtDuration(e.sumTiempoRespuestaSeg / e.respuestasConTiempo) : '—'],
      ],
      parrafos: [
        `Descripción: ${e.descripcion || 'Sin descripción'}`,
        e.observacionesCierre ? `Observaciones de cierre: ${e.observacionesCierre}` : '',
      ].filter(Boolean),
      tablas: [
        {
          titulo: 'Respuestas de brigadistas',
          columnas: ['Brigadista', 'Estado final', 'Primera respuesta', 'T. respuesta', 'Última actualización'],
          filas: respuestas.map((r) => [
            r.nombre,
            labelOf(ESTADOS_RESPUESTA, r.estado),
            fmtDateTime(r.primeraRespuestaAt),
            fmtDuration(r.tiempoRespuestaSeg),
            fmtDateTime(r.updatedAt),
          ]),
        },
        {
          titulo: 'Cronología',
          columnas: ['Hora', 'Brigadista', 'Estado'],
          filas: respuestas
            .flatMap((r) => (r.historial || []).map((h) => ({ ...h, nombre: r.nombre })))
            .sort((a, b) => a.at - b.at)
            .map((h) => [fmtDateTime(h.at), h.nombre, labelOf(ESTADOS_RESPUESTA, h.estado)]),
        },
        {
          titulo: 'Evidencias registradas',
          columnas: ['Fecha', 'Tipo', 'Autor', 'Observaciones', 'SHA-256'],
          filas: evidencias.map((v) => [
            fmtDateTime(v.createdAt),
            v.tipo,
            v.autor?.nombre,
            v.observaciones || v.archivo?.nombre || '',
            v.sha256 ? `${v.sha256.slice(0, 16)}…` : '—',
          ]),
        },
      ],
    },
    `acta_${e.id}.pdf`,
  );
}

/** Acta de atención individual (evidencia tipo "acta"). */
export async function actaAtencionPDF(ev) {
  const a = ev.acta || {};
  await exportarPDF(
    {
      titulo: 'Acta de atención',
      kpis: [
        ['Fecha y hora', fmtDateTime(a.fechaHora || ev.createdAt)],
        ['Lugar', a.lugar || '—'],
        ['Persona atendida', a.personaAtendida || '—'],
        ['Documento', a.documentoAtendido || '—'],
        ['Responsable de la atención', a.responsable || ev.autor?.nombre || '—'],
        ['Remisión', a.remision || '—'],
      ],
      parrafos: [
        `Descripción de la situación: ${a.situacion || '—'}`,
        `Atención brindada: ${a.atencion || '—'}`,
        `Observaciones: ${ev.observaciones || '—'}`,
        '',
        'Firma responsable: ______________________________          Firma atendido / testigo: ______________________________',
      ],
    },
    `acta_atencion_${ev.id}.pdf`,
  );
}
