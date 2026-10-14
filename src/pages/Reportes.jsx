import { useState } from 'react';
import { collection, getDocs, orderBy, query, Timestamp, where } from 'firebase/firestore';
import {
  Alert, Box, Button, Card, CardContent, CardHeader, LinearProgress, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableViewIcon from '@mui/icons-material/TableView';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { db } from '../config/firebase';
import { useSedes } from '../hooks/useSedes';
import { logAudit } from '../services/audit';
import {
  indicadoresEmergencias, exportarPDF, exportarExcel, filaEmergencia, COLS_EMERGENCIA, filaBrigadista, COLS_BRIGADISTA, pct,
} from '../services/reports';
import { indicadoresSimulacros } from '../services/simulacros';
import { BRIGADA_TIPOS, EMERGENCIA_TIPOS, labelOf } from '../config/constants';
import { fmtDate, fmtDateTime, fmtDuration, toInputDate } from '../utils/format';
import StatCard from '../components/StatCard';
import PageHeader from '../components/PageHeader';

const hace = (dias) => new Date(Date.now() - dias * 86400000);

export default function Reportes() {
  const { sedes, sedesMap } = useSedes();
  const [desde, setDesde] = useState(toInputDate(hace(90)));
  const [hasta, setHasta] = useState(toInputDate(new Date()));
  const [sedeId, setSedeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const cargar = async () => {
    setBusy(true);
    setError('');
    try {
      const d0 = Timestamp.fromDate(new Date(`${desde}T00:00:00`));
      const d1 = Timestamp.fromDate(new Date(`${hasta}T23:59:59`));
      const [em, si, us] = await Promise.all([
        getDocs(query(collection(db, 'emergencias'), where('createdAt', '>=', d0), where('createdAt', '<=', d1), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'simulacros'), where('fecha', '>=', d0), where('fecha', '<=', d1), orderBy('fecha', 'desc'))),
        getDocs(query(collection(db, 'users'), where('estado', '==', 'activo'))),
      ]);
      const filtro = (x) => !sedeId || x.sedeId === sedeId;
      const emergencias = em.docs.map((x) => ({ id: x.id, ...x.data() })).filter(filtro);
      const simulacros = si.docs.map((x) => ({ id: x.id, ...x.data() })).filter(filtro);
      const brigadistas = us.docs.map((x) => ({ id: x.id, ...x.data() })).filter(filtro);
      setData({ emergencias, simulacros, brigadistas, ie: indicadoresEmergencias(emergencias), is: indicadoresSimulacros(simulacros) });
      logAudit('reporte.consultar', { desde, hasta, sedeId });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const periodo = `Periodo ${fmtDate(new Date(`${desde}T12:00:00`))} – ${fmtDate(new Date(`${hasta}T12:00:00`))}${sedeId ? ` · ${sedesMap[sedeId]?.nombre}` : ' · Todas las sedes'}`;

  const kpis = data && [
    ['Emergencias / activaciones', String(data.ie.total)],
    ['Emergencias reales', String(data.ie.reales)],
    ['Activaciones de simulacro', String(data.ie.simulacros)],
    ['Tiempo promedio de respuesta', fmtDuration(data.ie.tiempoRespuestaPromSeg)],
    ['Duración promedio de la atención', fmtDuration(data.ie.duracionPromSeg)],
    ['Participación (respuestas / convocados)', pct(data.ie.participacion)],
    ['Simulacros registrados', String(data.is.total)],
    ['Tiempo promedio de evacuación (simulacros)', fmtDuration(data.is.tiempoPromedioSeg)],
    ['Cumplimiento de acciones correctivas', pct(data.is.cumplimientoAcciones)],
    ['Brigadistas activos', String(data.brigadistas.length)],
    ...BRIGADA_TIPOS.map((b) => [`  · Brigada ${b.label}`, String(data.brigadistas.filter((u) => u.brigadas?.includes(b.id)).length)]),
  ];

  const pdf = () =>
    exportarPDF(
      {
        titulo: 'Informe de gestión de emergencias',
        subtitulo: periodo,
        kpis,
        tablas: [
          { titulo: 'Emergencias por tipo', columnas: ['Tipo', 'Total'], filas: data.ie.porTipo.map((t) => [t.label, t.total]) },
          { titulo: 'Historial de emergencias', columnas: COLS_EMERGENCIA.map((c) => c.header), filas: data.emergencias.map((e) => Object.values(filaEmergencia(e, sedesMap))) },
          {
            titulo: 'Simulacros',
            columnas: ['Fecha', 'Tipo', 'Sede', 'Participantes', 'T. evacuación', 'Hallazgos'],
            filas: data.simulacros.map((s) => [fmtDateTime(s.fecha), labelOf(EMERGENCIA_TIPOS, s.tipo), sedesMap[s.sedeId]?.nombre || '', s.totalParticipantes, fmtDuration(s.tiempoEvacuacionSeg), s.hallazgos?.length || 0]),
          },
          {
            titulo: 'Brigadistas activos',
            columnas: ['Nombre', 'Cargo', 'Sede', 'Brigadas'],
            filas: data.brigadistas.map((u) => { const f = filaBrigadista(u, sedesMap); return [f.nombre, f.cargo, f.sede, f.brigadas]; }),
          },
        ],
      },
      `informe_emergencias_${desde}_${hasta}.pdf`,
    ).then(() => logAudit('reporte.pdf', { desde, hasta }));

  const excel = () =>
    exportarExcel(
      [
        { nombre: 'Indicadores', columnas: [{ header: 'Indicador', key: 'k', width: 48 }, { header: 'Valor', key: 'v', width: 20 }], filas: kpis.map(([k, v]) => ({ k, v })) },
        { nombre: 'Emergencias', columnas: COLS_EMERGENCIA, filas: data.emergencias.map((e) => filaEmergencia(e, sedesMap)) },
        {
          nombre: 'Simulacros',
          columnas: [
            { header: 'Fecha', key: 'fecha', width: 22 }, { header: 'Tipo', key: 'tipo', width: 22 }, { header: 'Sede', key: 'sede', width: 20 },
            { header: 'Participantes', key: 'p', width: 14 }, { header: 'Evacuados', key: 'ev', width: 12 }, { header: 'T. evacuación (s)', key: 't', width: 16 },
            { header: 'Hallazgos', key: 'h', width: 50 }, { header: 'Acciones correctivas', key: 'a', width: 60 },
          ],
          filas: data.simulacros.map((s) => ({
            fecha: fmtDateTime(s.fecha), tipo: labelOf(EMERGENCIA_TIPOS, s.tipo), sede: sedesMap[s.sedeId]?.nombre || '',
            p: s.totalParticipantes, ev: s.personasEvacuadas, t: s.tiempoEvacuacionSeg,
            h: (s.hallazgos || []).map((x) => x.descripcion).join(' | '),
            a: (s.accionesCorrectivas || []).map((x) => `${x.descripcion} [${x.estado}]`).join(' | '),
          })),
        },
        { nombre: 'Brigadistas', columnas: COLS_BRIGADISTA, filas: data.brigadistas.map((u) => filaBrigadista(u, sedesMap)) },
      ],
      `informe_emergencias_${desde}_${hasta}.xlsx`,
    ).then(() => logAudit('reporte.excel', { desde, hasta }));

  return (
    <>
      <PageHeader title="Reportes e indicadores" subtitle="Informes en PDF y Excel para auditorías del SG-SST" />
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
            <TextField type="date" label="Desde" InputLabelProps={{ shrink: true }} value={desde} onChange={(e) => setDesde(e.target.value)} />
            <TextField type="date" label="Hasta" InputLabelProps={{ shrink: true }} value={hasta} onChange={(e) => setHasta(e.target.value)} />
            <TextField select label="Sede" value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
              <MenuItem value="">Todas</MenuItem>
              {sedes.map((s) => <MenuItem key={s.id} value={s.id}>{s.nombre}</MenuItem>)}
            </TextField>
            <Button variant="contained" onClick={cargar} disabled={busy} sx={{ minWidth: 140 }}>Generar</Button>
          </Stack>
          {busy && <LinearProgress sx={{ mt: 2 }} />}
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </CardContent>
      </Card>

      {data && (
        <>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Button variant="contained" startIcon={<PictureAsPdfIcon />} onClick={pdf}>Descargar PDF</Button>
            <Button variant="outlined" startIcon={<TableViewIcon />} onClick={excel}>Descargar Excel</Button>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{periodo}</Typography>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, mb: 2 }}>
            <StatCard label="Tiempo de respuesta" value={fmtDuration(data.ie.tiempoRespuestaPromSeg)} />
            <StatCard label="Participación" value={pct(data.ie.participacion)} />
            <StatCard label="Simulacros" value={data.is.total} />
            <StatCard label="Emergencias reales" value={data.ie.reales} />
            <StatCard label="Brigadistas activos" value={data.brigadistas.length} />
          </Box>
          <Card>
            <CardHeader title="Historial por tipo de emergencia" />
            <CardContent sx={{ height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={data.ie.porTipo}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis allowDecimals={false} /><Tooltip />
                  <Bar dataKey="total" fill="#B71C1C" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
