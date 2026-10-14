import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, doc, getDocs, query, where } from 'firebase/firestore';
import {
  Alert, Box, Button, Card, CardContent, CardHeader, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, TableContainer, Tabs, TextField, Typography,
} from '@mui/material';
import ForumIcon from '@mui/icons-material/Forum';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableViewIcon from '@mui/icons-material/TableView';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useDocument, useQuery } from '../hooks/useFirestore';
import { useSedes } from '../hooks/useSedes';
import { ESTADOS_RESPUESTA, colorOf, labelOf } from '../config/constants';
import { fmtDateTime, fmtDuration, timeAgo, toDate } from '../utils/format';
import { formatDistance, haversine, mapsLink } from '../utils/geo';
import { cerrarEmergencia } from '../services/emergencias';
import { actaEmergenciaPDF, exportarExcel } from '../services/reports';
import { NivelChip, TipoChip, EstadoRespuestaChip } from '../components/Chips';
import MapView, { ICON_EMERGENCIA } from '../components/MapView';
import ResponsePanel from '../components/ResponsePanel';
import EvidenceManager from '../components/EvidenceManager';
import Loading from '../components/Loading';

const CANAL_LABEL = { push: 'Push', email: 'Correo', whatsapp: 'WhatsApp', sms: 'SMS' };
const CANAL_COLOR = { sent: 'success', partial: 'warning', error: 'error', skipped: 'default', pending: 'info' };

export default function EmergenciaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile, hasRole } = useAuth();
  const { sedesMap, puntos } = useSedes();
  const [tab, setTab] = useState(0);
  const [cerrar, setCerrar] = useState(false);
  const [obs, setObs] = useState('');

  const { data: e, loading } = useDocument(() => doc(db, 'emergencias', id), [id]);
  const { data: respuestas } = useQuery(() => collection(db, 'emergencias', id, 'respuestas'), [id]);
  const { data: ubicaciones } = useQuery(
    () => (hasRole('jefe_brigada') && e?.estado === 'activa' ? query(collection(db, 'ubicaciones'), where('activa', '==', true)) : null),
    [e?.estado],
  );

  const sede = sedesMap[e?.sedeId];
  const ref = e?.ubicacion || sede?.ubicacion;
  const respPorUid = useMemo(() => Object.fromEntries(respuestas.map((r) => [r.uid, r])), [respuestas]);

  // Brigadistas más cercanos al punto de la emergencia
  const cercanos = useMemo(() => {
    if (!ref) return [];
    return ubicaciones
      .map((u) => ({ ...u, distancia: haversine(ref, u), respuesta: respPorUid[u.uid] }))
      .filter((u) => Number.isFinite(u.distancia))
      .sort((a, b) => a.distancia - b.distancia)
      .slice(0, 10);
  }, [ubicaciones, ref, respPorUid]);

  if (loading) return <Loading />;
  if (!e) return <Alert severity="warning">La emergencia no existe o no tiene acceso.</Alert>;

  const activa = e.estado === 'activa';
  const dur = ((e.closedAt ? toDate(e.closedAt) : new Date()) - toDate(e.createdAt)) / 1000;
  const prom = e.respuestasConTiempo ? e.sumTiempoRespuestaSeg / e.respuestasConTiempo : null;
  const sorted = [...respuestas].sort((a, b) => (a.tiempoRespuestaSeg ?? 1e9) - (b.tiempoRespuestaSeg ?? 1e9));

  const markers = respuestas
    .filter((r) => r.ubicacion)
    .map((r) => ({ id: r.uid, lat: r.ubicacion.lat, lng: r.ubicacion.lng, color: colorOf(ESTADOS_RESPUESTA, r.estado), label: `${r.nombre} · ${labelOf(ESTADOS_RESPUESTA, r.estado)}` }));
  const pins = [...puntos.filter((p) => !e.sedeId || e.sedeId === 'todas' || p.sedeId === e.sedeId)];
  if (ref) pins.push({ id: 'ref', ...ref, icon: ICON_EMERGENCIA, label: 'Punto de la emergencia' });

  const getEvidencias = async () =>
    (await getDocs(query(collection(db, 'evidencias'), where('emergenciaId', '==', id)))).docs.map((d) => ({ id: d.id, ...d.data() }));

  const excel = () =>
    exportarExcel(
      [
        {
          nombre: 'Respuestas',
          columnas: [
            { header: 'Brigadista', key: 'nombre', width: 28 },
            { header: 'Estado', key: 'estado', width: 24 },
            { header: 'Primera respuesta', key: 'primera', width: 22 },
            { header: 'Tiempo respuesta (s)', key: 'tiempo', width: 18 },
            { header: 'Última actualización', key: 'ultima', width: 22 },
            { header: 'Latitud', key: 'lat', width: 12 },
            { header: 'Longitud', key: 'lng', width: 12 },
          ],
          filas: sorted.map((r) => ({
            nombre: r.nombre,
            estado: labelOf(ESTADOS_RESPUESTA, r.estado),
            primera: fmtDateTime(r.primeraRespuestaAt),
            tiempo: r.tiempoRespuestaSeg ?? '',
            ultima: fmtDateTime(r.updatedAt),
            lat: r.ubicacion?.lat,
            lng: r.ubicacion?.lng,
          })),
        },
        {
          nombre: 'Cronología',
          columnas: [
            { header: 'Hora', key: 'hora', width: 22 },
            { header: 'Brigadista', key: 'nombre', width: 28 },
            { header: 'Estado', key: 'estado', width: 24 },
          ],
          filas: respuestas
            .flatMap((r) => (r.historial || []).map((h) => ({ ...h, nombre: r.nombre })))
            .sort((a, b) => a.at - b.at)
            .map((h) => ({ hora: fmtDateTime(h.at), nombre: h.nombre, estado: labelOf(ESTADOS_RESPUESTA, h.estado) })),
        },
      ],
      `emergencia_${id}.xlsx`,
    );

  return (
    <>
      <Card sx={{ mb: 2, borderColor: activa ? 'primary.main' : 'divider', borderWidth: activa ? 2 : 1 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
            <Box sx={{ flex: 1 }}>
              <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', gap: 1 }}>
                <TipoChip tipo={e.tipo} size="medium" />
                <NivelChip nivel={e.nivel} size="medium" />
                <Chip label={activa ? 'ACTIVA' : 'CERRADA'} color={activa ? 'error' : 'default'} />
              </Stack>
              <Typography variant="h5">{sede?.nombre || e.sedeNombre || 'Todas las sedes'}</Typography>
              {e.descripcion && <Typography sx={{ mt: 0.5 }}>{e.descripcion}</Typography>}
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Activada {fmtDateTime(e.createdAt)} por {e.activadaPor?.nombre} · Duración {fmtDuration(dur)}
                {e.cerradaPor && ` · Cerrada por ${e.cerradaPor.nombre}`}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button startIcon={<ForumIcon />} variant="outlined" onClick={() => navigate(`/chat?canal=emergencia_${id}`)}>Chat</Button>
              <Button startIcon={<PictureAsPdfIcon />} variant="outlined"
                onClick={async () => actaEmergenciaPDF({ ...e, id }, sorted, await getEvidencias(), sede?.nombre)}>Acta PDF</Button>
              <Button startIcon={<TableViewIcon />} variant="outlined" onClick={excel}>Excel</Button>
              {activa && hasRole('jefe_brigada') && <Button variant="contained" color="success" onClick={() => setCerrar(true)}>Cerrar emergencia</Button>}
            </Stack>
          </Stack>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mt: 2 }}>
            <Box><Typography variant="h5">{respuestas.length}</Typography><Typography variant="caption">respuestas / {e.notificaciones?.destinatarios ?? '?'} convocados</Typography></Box>
            <Box><Typography variant="h5">{fmtDuration(prom)}</Typography><Typography variant="caption">tiempo promedio de respuesta</Typography></Box>
            <Box><Typography variant="h5">{respuestas.filter((r) => r.estado === 'en_punto').length}</Typography><Typography variant="caption">en el punto</Typography></Box>
            <Box><Typography variant="h5" color="error">{respuestas.filter((r) => r.estado === 'necesito_apoyo').length}</Typography><Typography variant="caption">necesitan apoyo</Typography></Box>
          </Box>

          {e.notificaciones && (
            <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', gap: 1 }}>
              {Object.entries(CANAL_LABEL).map(([k, label]) =>
                e.notificaciones[k] ? (
                  <Chip key={k} size="small" variant="outlined" color={CANAL_COLOR[e.notificaciones[k].status] || 'default'}
                    label={`${label}: ${e.notificaciones[k].status}${e.notificaciones[k].count != null ? ` (${e.notificaciones[k].count})` : ''}`} />
                ) : null,
              )}
              {e.escalado && <Chip size="small" color="warning" label="Escalado a SMS/WhatsApp por falta de respuesta" />}
            </Stack>
          )}
        </CardContent>
      </Card>

      {activa && (
        <Card sx={{ mb: 2 }}>
          <CardHeader title="Reportar mi estado" />
          <CardContent sx={{ pt: 0 }}><ResponsePanel emergencia={e} /></CardContent>
        </Card>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{ mb: 2 }}>
        <Tab label="Respuestas" />
        <Tab label="Mapa" />
        {hasRole('jefe_brigada') && activa && <Tab label="Más cercanos" />}
        <Tab label="Evidencias" value={9} />
      </Tabs>

      {tab === 0 && (
        <TableContainer component={Card}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Brigadista</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>T. respuesta</TableCell>
                <TableCell>Actualizado</TableCell>
                <TableCell>Distancia</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((r) => (
                <TableRow key={r.uid} sx={r.estado === 'necesito_apoyo' ? { bgcolor: 'rgba(183,28,28,.08)' } : undefined}>
                  <TableCell>
                    {r.nombre}
                    {r.nota && <Typography variant="caption" display="block" color="text.secondary">{r.nota}</Typography>}
                  </TableCell>
                  <TableCell><EstadoRespuestaChip estado={r.estado} /></TableCell>
                  <TableCell>{fmtDuration(r.tiempoRespuestaSeg)}</TableCell>
                  <TableCell>{timeAgo(r.updatedAt)}</TableCell>
                  <TableCell>
                    {r.ubicacion && ref ? (
                      <a href={mapsLink(r.ubicacion)} target="_blank" rel="noreferrer">{formatDistance(haversine(ref, r.ubicacion))}</a>
                    ) : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {sorted.length === 0 && (
                <TableRow><TableCell colSpan={5}>Aún no hay respuestas.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {tab === 1 && <Card><CardContent><MapView markers={markers} pins={pins} height={480} /></CardContent></Card>}

      {tab === 2 && (
        <Card>
          <CardHeader title="Brigadistas más cercanos" subheader={ref ? 'Ordenados por distancia al punto de la emergencia' : 'La emergencia no tiene ubicación'} />
          <CardContent sx={{ pt: 0 }}>
            {cercanos.map((u, i) => (
              <Stack key={u.uid} direction="row" spacing={1} alignItems="center" sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }}>
                <Typography sx={{ width: 24, fontWeight: 700 }}>{i + 1}</Typography>
                <Typography sx={{ flex: 1 }}>{u.nombre}</Typography>
                <EstadoRespuestaChip estado={u.respuesta?.estado} />
                <Typography sx={{ width: 80, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatDistance(u.distancia)}</Typography>
              </Stack>
            ))}
            {cercanos.length === 0 && <Typography color="text.secondary">Sin ubicaciones activas.</Typography>}
          </CardContent>
        </Card>
      )}

      {tab === 9 && <EvidenceManager emergenciaId={id} />}

      <Dialog open={cerrar} onClose={() => setCerrar(false)} fullWidth maxWidth="sm">
        <DialogTitle>Cerrar emergencia</DialogTitle>
        <DialogContent>
          <TextField sx={{ mt: 1 }} label="Observaciones de cierre" multiline minRows={3} value={obs} onChange={(ev) => setObs(ev.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCerrar(false)}>Cancelar</Button>
          <Button variant="contained" color="success"
            onClick={async () => { await cerrarEmergencia(id, obs, user, profile); setCerrar(false); }}>
            Confirmar cierre
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
