import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, query, where, Timestamp, limit } from 'firebase/firestore';
import {
  Box, Card, CardContent, CardHeader, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography, Chip,
} from '@mui/material';
import { db } from '../config/firebase';
import { useQuery } from '../hooks/useFirestore';
import { useSedes } from '../hooks/useSedes';
import { useOps } from '../contexts/OpsContext';
import { BRIGADA_TIPOS, EMERGENCIA_TIPOS, labelOf } from '../config/constants';
import { formatDistance, nearest } from '../utils/geo';
import { timeAgo, toDate } from '../utils/format';
import MapView, { ICON_EMERGENCIA, ICON_SEDE } from '../components/MapView';
import PageHeader from '../components/PageHeader';
import { BrigadaChips } from '../components/Chips';

const L = (lat, lng) => (lat && lng ? { lat: Number(lat), lng: Number(lng) } : null);

export default function Mapa() {
  const [params] = useSearchParams();
  const { sedes, puntos } = useSedes();
  const { activas, apoyos } = useOps();
  const [sedeId, setSedeId] = useState('');
  const [brigada, setBrigada] = useState('');
  const [minutos, setMinutos] = useState(60);
  const [verPuntos, setVerPuntos] = useState(true);
  const [ref, setRef] = useState(() => L(params.get('lat'), params.get('lng')));

  const since = useMemo(() => Timestamp.fromMillis(Date.now() - minutos * 60_000), [minutos]);
  const { data } = useQuery(
    () =>
      sedeId
        ? query(collection(db, 'ubicaciones'), where('sedeId', '==', sedeId), where('updatedAt', '>=', since), limit(2000))
        : query(collection(db, 'ubicaciones'), where('updatedAt', '>=', since), limit(2000)),
    [sedeId, since],
  );

  const ubic = data.filter((u) => u.activa !== false && (!brigada || u.brigadas?.includes(brigada)));
  const top = ref ? nearest(ubic, ref, 10) : [];
  const staleMs = 10 * 60_000;

  const markers = [
    ...ubic.map((u) => {
      const age = Date.now() - (toDate(u.updatedAt)?.getTime() || 0);
      return {
        id: u.id, lat: u.lat, lng: u.lng, accuracy: u.accuracy,
        color: age > staleMs ? '#9E9E9E' : '#1565C0',
        label: `${u.nombre} · ${timeAgo(u.updatedAt)}`,
      };
    }),
    ...apoyos.filter((a) => a.ubicacion).map((a) => ({ id: `sos-${a.id}`, ...a.ubicacion, color: '#B71C1C', radius: 14, label: `SOS: ${a.nombre}` })),
  ];
  const pins = [
    ...(verPuntos ? puntos : []),
    ...sedes.filter((s) => s.ubicacion).map((s) => ({ id: `sede-${s.id}`, ...s.ubicacion, icon: ICON_SEDE, label: s.nombre })),
    ...activas.filter((e) => e.ubicacion).map((e) => ({ id: `em-${e.id}`, ...e.ubicacion, icon: ICON_EMERGENCIA, label: labelOf(EMERGENCIA_TIPOS, e.tipo) })),
  ];
  if (ref) pins.push({ id: 'ref', ...ref, icon: ICON_EMERGENCIA, label: 'Punto de referencia' });

  return (
    <>
      <PageHeader title="Mapa operativo" subtitle="Toque el mapa para fijar un punto y ver los brigadistas más cercanos" />
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField select label="Sede" value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
          <MenuItem value="">Todas</MenuItem>
          {sedes.map((s) => <MenuItem key={s.id} value={s.id}>{s.nombre}</MenuItem>)}
        </TextField>
        <TextField select label="Brigada" value={brigada} onChange={(e) => setBrigada(e.target.value)}>
          <MenuItem value="">Todas</MenuItem>
          {BRIGADA_TIPOS.map((b) => <MenuItem key={b.id} value={b.id}>{b.label}</MenuItem>)}
        </TextField>
        <TextField select label="Ubicaciones de los últimos" value={minutos} onChange={(e) => setMinutos(e.target.value)}>
          {[15, 60, 240, 1440].map((m) => <MenuItem key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</MenuItem>)}
        </TextField>
        <FormControlLabel control={<Switch checked={verPuntos} onChange={(e) => setVerPuntos(e.target.checked)} />} label="Puntos de encuentro" sx={{ whiteSpace: 'nowrap' }} />
      </Stack>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' } }}>
        <Card><CardContent><MapView markers={markers} pins={pins} height={560} onClick={setRef} recenter={ref} /></CardContent></Card>
        <Card>
          <CardHeader title="Más cercanos" subheader={ref ? `${ref.lat.toFixed(5)}, ${ref.lng.toFixed(5)}` : 'Fije un punto en el mapa'}
            action={<Chip label={`${ubic.length} activos`} />} />
          <CardContent sx={{ pt: 0 }}>
            {top.map((u, i) => (
              <Box key={u.id} sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }}>
                <Stack direction="row" spacing={1}>
                  <Typography fontWeight={700}>{i + 1}.</Typography>
                  <Typography sx={{ flex: 1 }}>{u.nombre}</Typography>
                  <Typography fontWeight={700}>{formatDistance(u.distancia)}</Typography>
                </Stack>
                <BrigadaChips brigadas={u.brigadas} />
                <Typography variant="caption" color="text.secondary">{timeAgo(u.updatedAt)} · precisión {u.accuracy} m</Typography>
              </Box>
            ))}
            {ref && top.length === 0 && <Typography color="text.secondary">Sin brigadistas con ubicación.</Typography>}
          </CardContent>
        </Card>
      </Box>
    </>
  );
}
