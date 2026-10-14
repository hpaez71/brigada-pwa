import { useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import {
  Alert, Autocomplete, Box, Button, Card, CardContent, CardHeader, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, MenuItem, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tabs, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '../hooks/useFirestore';
import { useSedes } from '../hooks/useSedes';
import { EMERGENCIA_TIPOS, labelOf } from '../config/constants';
import { guardarSimulacro, indicadoresSimulacros } from '../services/simulacros';
import { exportarExcel, exportarPDF, pct } from '../services/reports';
import { fmtDate, fmtDateTime, fmtDuration, toDate, toInputDate, toInputDateTime } from '../utils/format';
import StatCard from '../components/StatCard';
import PageHeader from '../components/PageHeader';
import EvidenceManager from '../components/EvidenceManager';

const TIPOS_SIM = EMERGENCIA_TIPOS.filter((t) => t.id !== 'simulacro');
const HALLAZGO_TIPOS = [
  { id: 'fortaleza', label: 'Fortaleza' },
  { id: 'oportunidad', label: 'Oportunidad de mejora' },
  { id: 'no_conformidad', label: 'No conformidad' },
];
const ACCION_ESTADOS = [
  { id: 'abierta', label: 'Abierta' },
  { id: 'en_curso', label: 'En curso' },
  { id: 'cerrada', label: 'Cerrada' },
];

const VACIO = {
  fecha: toInputDateTime(new Date()), tipo: 'evacuacion_general', sedeId: '', emergenciaId: '', escenario: '',
  participantes: [], totalParticipantes: '', poblacionEsperada: '', personasEvacuadas: '',
  tiempoAlertaSeg: '', tiempoEvacuacionSeg: '', tiempoObjetivoSeg: '', hallazgos: [], accionesCorrectivas: [], calificacion: '',
};

function DuracionInput({ label, value, onChange }) {
  const v = Number(value) || 0;
  const m = Math.floor(v / 60);
  const s = v % 60;
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <TextField label={`${label} (min)`} type="number" value={m || ''} onChange={(e) => onChange((Number(e.target.value) || 0) * 60 + s)} />
      <TextField label="seg" type="number" value={s || ''} onChange={(e) => onChange(m * 60 + (Number(e.target.value) || 0))} sx={{ width: 100 }} />
    </Stack>
  );
}

function SimulacroForm({ initial, onClose }) {
  const { user, profile } = useAuth();
  const { sedes } = useSedes();
  const [tab, setTab] = useState(0);
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const { data: directorio } = useQuery(
    () => (f.sedeId ? query(collection(db, 'directorio'), where('sedeId', '==', f.sedeId), limit(1000)) : query(collection(db, 'directorio'), limit(1000))),
    [f.sedeId],
  );
  const { data: simEmerg } = useQuery(
    () => query(collection(db, 'emergencias'), where('esSimulacro', '==', true), orderBy('createdAt', 'desc'), limit(20)),
    [],
  );

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const updList = (k, i, campo, v) => setF((s) => ({ ...s, [k]: s[k].map((x, j) => (j === i ? { ...x, [campo]: v } : x)) }));
  const delList = (k, i) => setF((s) => ({ ...s, [k]: s[k].filter((_, j) => j !== i) }));

  // Prefija participantes y tiempos desde la activación del simulacro en la plataforma
  const importar = async () => {
    const e = simEmerg.find((x) => x.id === f.emergenciaId);
    if (!e) return;
    const resp = (await getDocs(collection(db, 'emergencias', e.id, 'respuestas'))).docs.map((d) => d.data());
    const dur = e.closedAt ? Math.round((toDate(e.closedAt) - toDate(e.createdAt)) / 1000) : '';
    setF((s) => ({
      ...s,
      fecha: toInputDateTime(e.createdAt),
      sedeId: e.sedeId !== 'todas' ? e.sedeId : s.sedeId,
      participantes: resp.map((r) => ({ uid: r.uid, nombre: r.nombre })),
      totalParticipantes: resp.length,
      tiempoAlertaSeg: e.respuestasConTiempo ? Math.round(e.sumTiempoRespuestaSeg / e.respuestasConTiempo) : s.tiempoAlertaSeg,
      tiempoEvacuacionSeg: dur || s.tiempoEvacuacionSeg,
    }));
    setInfo(`Se importaron ${resp.length} participantes y los tiempos registrados.`);
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const id = await guardarSimulacro(initial.id, {
        ...f,
        accionesCorrectivas: f.accionesCorrectivas.map((a) => ({ ...a, fechaLimite: a.fechaLimite ? new Date(`${toInputDate(a.fechaLimite)}T12:00:00`) : null })),
      }, user, profile);
      if (!initial.id) {
        setF((s) => ({ ...s, id }));
        initial.id = id; // permite pasar a evidencias sin cerrar
        setInfo('Simulacro guardado. Ya puede adjuntar evidencias.');
      } else onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{initial.id ? 'Simulacro' : 'Nuevo simulacro'}</DialogTitle>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 3 }}>
        <Tab label="Datos" /><Tab label="Hallazgos y acciones" /><Tab label="Evidencias" disabled={!initial.id} />
      </Tabs>
      <DialogContent>
        {info && <Alert severity="info" sx={{ mb: 2 }} onClose={() => setInfo('')}>{info}</Alert>}
        {tab === 0 && (
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, pt: 1 }}>
            <TextField type="datetime-local" label="Fecha y hora" InputLabelProps={{ shrink: true }} value={toInputDateTime(f.fecha) || f.fecha} onChange={set('fecha')} />
            <TextField select label="Tipo de escenario" value={f.tipo} onChange={set('tipo')}>
              {TIPOS_SIM.map((t) => <MenuItem key={t.id} value={t.id}>{t.label}</MenuItem>)}
            </TextField>
            <TextField select label="Sede" value={f.sedeId} onChange={set('sedeId')}>
              <MenuItem value="">—</MenuItem>
              {sedes.map((s) => <MenuItem key={s.id} value={s.id}>{s.nombre}</MenuItem>)}
            </TextField>
            <Stack direction="row" spacing={1}>
              <TextField select label="Activación en plataforma" value={f.emergenciaId} onChange={set('emergenciaId')}>
                <MenuItem value="">Ninguna</MenuItem>
                {simEmerg.map((e) => <MenuItem key={e.id} value={e.id}>{fmtDateTime(e.createdAt)} · {e.sedeNombre}</MenuItem>)}
              </TextField>
              <Button onClick={importar} disabled={!f.emergenciaId}>Importar</Button>
            </Stack>
            <TextField label="Escenario / hipótesis" multiline minRows={2} value={f.escenario} onChange={set('escenario')} sx={{ gridColumn: { sm: 'span 2' } }} />
            <Autocomplete
              multiple
              sx={{ gridColumn: { sm: 'span 2' } }}
              options={directorio.map((d) => ({ uid: d.id, nombre: d.nombre }))}
              value={f.participantes}
              getOptionLabel={(o) => o.nombre || ''}
              isOptionEqualToValue={(a, b) => a.uid === b.uid}
              onChange={(_, v) => setF((s) => ({ ...s, participantes: v, totalParticipantes: Math.max(v.length, Number(s.totalParticipantes) || 0) }))}
              renderInput={(p) => <TextField {...p} label="Brigadistas participantes" />}
            />
            <TextField type="number" label="Total participantes (incl. no brigadistas)" value={f.totalParticipantes} onChange={set('totalParticipantes')} />
            <TextField type="number" label="Población esperada" value={f.poblacionEsperada} onChange={set('poblacionEsperada')} />
            <TextField type="number" label="Personas evacuadas" value={f.personasEvacuadas} onChange={set('personasEvacuadas')} />
            <TextField select label="Calificación general" value={f.calificacion} onChange={set('calificacion')}>
              {['Excelente', 'Bueno', 'Aceptable', 'Deficiente'].map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
            <DuracionInput label="Tiempo de alerta" value={f.tiempoAlertaSeg} onChange={set('tiempoAlertaSeg')} />
            <DuracionInput label="Tiempo de evacuación" value={f.tiempoEvacuacionSeg} onChange={set('tiempoEvacuacionSeg')} />
            <DuracionInput label="Tiempo objetivo" value={f.tiempoObjetivoSeg} onChange={set('tiempoObjetivoSeg')} />
          </Box>
        )}
        {tab === 1 && (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack direction="row" alignItems="center">
              <Typography variant="subtitle1" sx={{ flex: 1 }}>Hallazgos</Typography>
              <Button startIcon={<AddIcon />} onClick={() => setF((s) => ({ ...s, hallazgos: [...s.hallazgos, { tipo: 'oportunidad', descripcion: '' }] }))}>Agregar</Button>
            </Stack>
            {f.hallazgos.map((h, i) => (
              <Stack key={i} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField select label="Tipo" value={h.tipo} onChange={(e) => updList('hallazgos', i, 'tipo', e.target.value)} sx={{ minWidth: 200 }}>
                  {HALLAZGO_TIPOS.map((t) => <MenuItem key={t.id} value={t.id}>{t.label}</MenuItem>)}
                </TextField>
                <TextField label="Descripción" multiline value={h.descripcion} onChange={(e) => updList('hallazgos', i, 'descripcion', e.target.value)} />
                <IconButton onClick={() => delList('hallazgos', i)}><DeleteIcon /></IconButton>
              </Stack>
            ))}
            <Stack direction="row" alignItems="center">
              <Typography variant="subtitle1" sx={{ flex: 1 }}>Acciones correctivas</Typography>
              <Button startIcon={<AddIcon />} onClick={() => setF((s) => ({ ...s, accionesCorrectivas: [...s.accionesCorrectivas, { descripcion: '', responsable: '', fechaLimite: '', estado: 'abierta' }] }))}>Agregar</Button>
            </Stack>
            {f.accionesCorrectivas.map((a, i) => (
              <Box key={i} sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr 1fr 1fr auto' } }}>
                <TextField label="Acción" multiline value={a.descripcion} onChange={(e) => updList('accionesCorrectivas', i, 'descripcion', e.target.value)} />
                <TextField label="Responsable" value={a.responsable} onChange={(e) => updList('accionesCorrectivas', i, 'responsable', e.target.value)} />
                <TextField type="date" label="Fecha límite" InputLabelProps={{ shrink: true }} value={toInputDate(a.fechaLimite)} onChange={(e) => updList('accionesCorrectivas', i, 'fechaLimite', e.target.value)} />
                <TextField select label="Estado" value={a.estado} onChange={(e) => updList('accionesCorrectivas', i, 'estado', e.target.value)}>
                  {ACCION_ESTADOS.map((t) => <MenuItem key={t.id} value={t.id}>{t.label}</MenuItem>)}
                </TextField>
                <IconButton onClick={() => delList('accionesCorrectivas', i)}><DeleteIcon /></IconButton>
              </Box>
            ))}
          </Stack>
        )}
        {tab === 2 && initial.id && <EvidenceManager simulacroId={initial.id} />}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
        <Button variant="contained" onClick={save} disabled={busy}>Guardar</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Simulacros() {
  const { sedesMap } = useSedes();
  const [editing, setEditing] = useState(null);
  const { data } = useQuery(() => query(collection(db, 'simulacros'), orderBy('fecha', 'desc'), limit(300)), []);
  const ind = useMemo(() => indicadoresSimulacros(data), [data]);

  const filas = data.map((s) => ({
    fecha: fmtDateTime(s.fecha),
    tipo: labelOf(EMERGENCIA_TIPOS, s.tipo),
    sede: sedesMap[s.sedeId]?.nombre || '',
    participantes: s.totalParticipantes,
    evacuados: s.personasEvacuadas,
    tiempo: fmtDuration(s.tiempoEvacuacionSeg),
    objetivo: fmtDuration(s.tiempoObjetivoSeg),
    hallazgos: s.hallazgos?.length || 0,
    acciones: `${(s.accionesCorrectivas || []).filter((a) => a.estado === 'cerrada').length}/${s.accionesCorrectivas?.length || 0}`,
    calificacion: s.calificacion || '',
  }));
  const cols = [
    { header: 'Fecha', key: 'fecha', width: 22 }, { header: 'Tipo', key: 'tipo', width: 22 }, { header: 'Sede', key: 'sede', width: 20 },
    { header: 'Participantes', key: 'participantes', width: 14 }, { header: 'Evacuados', key: 'evacuados', width: 12 },
    { header: 'T. evacuación', key: 'tiempo', width: 14 }, { header: 'T. objetivo', key: 'objetivo', width: 14 },
    { header: 'Hallazgos', key: 'hallazgos', width: 10 }, { header: 'Acciones cerradas', key: 'acciones', width: 16 },
    { header: 'Calificación', key: 'calificacion', width: 14 },
  ];
  const kpis = [
    ['Simulacros registrados', String(ind.total)],
    ['Tiempo promedio de evacuación', fmtDuration(ind.tiempoPromedioSeg)],
    ['Mejor tiempo', fmtDuration(ind.mejorTiempoSeg)],
    ['Participación promedio', ind.participacionPromedio.toFixed(1)],
    ['Cobertura de evacuación', pct(ind.coberturaEvacuacion)],
    ['Cumplimiento del tiempo objetivo', pct(ind.cumplimientoObjetivo)],
    ['Hallazgos', String(ind.hallazgos)],
    ['Cumplimiento de acciones correctivas', `${pct(ind.cumplimientoAcciones)} (${ind.accionesCerradas}/${ind.acciones})`],
  ];

  return (
    <>
      <PageHeader title="Gestión de simulacros" subtitle="Registro, indicadores y plan de acción"
        actions={
          <>
            <Button variant="outlined" onClick={() => exportarPDF({ titulo: 'Informe de simulacros', kpis, tablas: [{ titulo: 'Simulacros', columnas: cols.map((c) => c.header), filas: filas.map((f) => cols.map((c) => f[c.key])) }] })}>PDF</Button>
            <Button variant="outlined" onClick={() => exportarExcel([{ nombre: 'Simulacros', columnas: cols, filas }], 'simulacros.xlsx')}>Excel</Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ ...VACIO })}>Nuevo</Button>
          </>
        } />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, mb: 2 }}>
        <StatCard label="Simulacros" value={ind.total} />
        <StatCard label="T. promedio evacuación" value={fmtDuration(ind.tiempoPromedioSeg)} />
        <StatCard label="Cobertura evacuación" value={pct(ind.coberturaEvacuacion)} />
        <StatCard label="Acciones cerradas" value={pct(ind.cumplimientoAcciones)} hint={`${ind.accionesCerradas} de ${ind.acciones}`} />
      </Box>
      <Card sx={{ mb: 2 }}>
        <CardHeader title="Frecuencia de simulacros por mes" />
        <CardContent sx={{ height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={ind.porMes}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mes" /><YAxis allowDecimals={false} /><Tooltip />
              <Bar dataKey="total" fill="#558B2F" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <TableContainer component={Card}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Fecha</TableCell><TableCell>Tipo</TableCell><TableCell>Sede</TableCell><TableCell>Participantes</TableCell>
              <TableCell>T. evacuación</TableCell><TableCell>Hallazgos</TableCell><TableCell>Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((s) => {
              const abiertas = (s.accionesCorrectivas || []).filter((a) => a.estado !== 'cerrada');
              const vencidas = abiertas.filter((a) => a.fechaLimite && toDate(a.fechaLimite) < new Date());
              return (
                <TableRow key={s.id} hover sx={{ cursor: 'pointer' }} onClick={() => setEditing({ ...VACIO, ...s, fecha: toInputDateTime(s.fecha) })}>
                  <TableCell>{fmtDate(s.fecha)}</TableCell>
                  <TableCell>{labelOf(EMERGENCIA_TIPOS, s.tipo)}</TableCell>
                  <TableCell>{sedesMap[s.sedeId]?.nombre || '—'}</TableCell>
                  <TableCell>{s.totalParticipantes}</TableCell>
                  <TableCell>
                    {fmtDuration(s.tiempoEvacuacionSeg)}
                    {s.tiempoObjetivoSeg > 0 && (
                      <Chip size="small" sx={{ ml: 1 }} color={s.tiempoEvacuacionSeg <= s.tiempoObjetivoSeg ? 'success' : 'error'}
                        label={s.tiempoEvacuacionSeg <= s.tiempoObjetivoSeg ? 'Cumple' : 'Excede'} />
                    )}
                  </TableCell>
                  <TableCell>{s.hallazgos?.length || 0}</TableCell>
                  <TableCell>
                    {abiertas.length} abiertas
                    {vencidas.length > 0 && <Chip size="small" color="error" label={`${vencidas.length} vencidas`} sx={{ ml: 1 }} />}
                  </TableCell>
                </TableRow>
              );
            })}
            {data.length === 0 && <TableRow><TableCell colSpan={7}>Sin simulacros registrados.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>
      {editing && <SimulacroForm initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
