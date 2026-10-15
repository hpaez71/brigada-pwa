import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  collection, getCountFromServer, limit, orderBy, query, Timestamp, where,
} from 'firebase/firestore';
import {
  Alert, Box, Button, Card, CardContent, CardHeader, FormControlLabel, Stack, Switch, Typography,
} from '@mui/material';
import GroupsIcon from '@mui/icons-material/Groups';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import WifiIcon from '@mui/icons-material/Wifi';
import DirectionsRunIcon from '@mui/icons-material/DirectionsRun';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import TimerIcon from '@mui/icons-material/Timer';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useGeo } from '../contexts/LocationContext';
import { useOps } from '../contexts/OpsContext';
import { useQuery } from '../hooks/useFirestore';
import { useSedes } from '../hooks/useSedes';
import { ESTADOS_RESPUESTA, EMERGENCIA_TIPOS, colorOf, labelOf } from '../config/constants';
import { fmtDuration, fmtDateTime, daysUntil, fmtDate } from '../utils/format';
import { indicadoresEmergencias } from '../services/reports';
import { actualizarBrigadista } from '../services/brigadistas';
import { enablePush, hasPushToken } from '../services/notifications';
import StatCard from '../components/StatCard';
import MapView, { ICON_EMERGENCIA } from '../components/MapView';
import ResponsePanel from '../components/ResponsePanel';
import { NivelChip, TipoChip } from '../components/Chips';
import PageHeader from '../components/PageHeader';
import ActivationDialog from '../components/ActivationDialog';

function useCounts() {
  const [c, setC] = useState({});
  useEffect(() => {
    const load = async () => {
      try {
        const u = collection(db, 'users');
        const [total, disp, con] = await Promise.all([
          getCountFromServer(query(u, where('estado', '==', 'activo'))),
          getCountFromServer(query(u, where('estado', '==', 'activo'), where('disponible', '==', true))),
          getCountFromServer(
            query(collection(db, 'presencia'), where('lastSeen', '>=', Timestamp.fromMillis(Date.now() - 5 * 60_000))),
          ),
        ]);
        setC({ total: total.data().count, disponibles: disp.data().count, conectados: con.data().count });
      } catch {
        /* offline: se mantienen los últimos valores */
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);
  return c;
}

function CoordinatorDashboard() {
  const { activas, apoyos } = useOps();
  const { sedesMap, puntos } = useSedes();
  const counts = useCounts();
  const { data: pendientes } = useQuery(
    () => query(collection(db, 'users'), where('estado', '==', 'pendiente'), limit(50)),
    [],
  );
  const [since] = useState(() => Timestamp.fromMillis(Date.now() - 60 * 60_000));
  const [openAct, setOpenAct] = useState(false);

  const { data: recientes } = useQuery(
    () => query(collection(db, 'emergencias'), orderBy('createdAt', 'desc'), limit(100)),
    [],
  );
  const { data: ubicaciones } = useQuery(
    () => query(collection(db, 'ubicaciones'), where('updatedAt', '>=', since), limit(1000)),
    [since],
  );
  const principal = activas[0];
  const { data: respuestas } = useQuery(
    () => (principal ? collection(db, 'emergencias', principal.id, 'respuestas') : null),
    [principal?.id],
  );

  const ind = useMemo(() => indicadoresEmergencias(recientes), [recientes]);
  const enEmergencia = activas.reduce((a, e) => a + Math.max(0, (e.totalRespuestas || 0) - (e.stats?.controlado || 0)), 0);
  const respPorUid = useMemo(() => Object.fromEntries(respuestas.map((r) => [r.uid, r])), [respuestas]);

  const chart = ESTADOS_RESPUESTA.map((e) => ({
    name: e.label,
    total: principal ? respuestas.filter((r) => r.estado === e.id).length : 0,
    color: e.color,
  }));

  const markers = ubicaciones
    .filter((u) => u.activa !== false)
    .map((u) => {
      const r = respPorUid[u.uid];
      return {
        id: u.id,
        lat: u.lat,
        lng: u.lng,
        accuracy: u.accuracy,
        color: r ? colorOf(ESTADOS_RESPUESTA, r.estado) : '#1565C0',
        label: `${u.nombre}${r ? ` · ${labelOf(ESTADOS_RESPUESTA, r.estado)}` : ''}`,
      };
    });
  const pins = [
    ...puntos,
    ...activas.filter((e) => e.ubicacion).map((e) => ({ id: `em-${e.id}`, ...e.ubicacion, icon: ICON_EMERGENCIA, label: labelOf(EMERGENCIA_TIPOS, e.tipo) })),
  ];

  return (
    <>
      <PageHeader
        title="Panel de control"
        subtitle={`Actualizado en tiempo real · ${fmtDateTime(new Date())}`}
        actions={
          <Button variant="contained" color="primary" size="large" className="pulse" onClick={() => setOpenAct(true)} sx={{ fontWeight: 800 }}>
            ACTIVAR EMERGENCIA
          </Button>
        }
      />
      <ActivationDialog open={openAct} onClose={() => setOpenAct(false)} />
      {pendientes.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}
          action={<Button color="inherit" size="small" component={RouterLink} to="/brigadistas">Revisar</Button>}>
          {pendientes.length === 1 ? '1 solicitud de registro espera' : `${pendientes.length} solicitudes de registro esperan`} aprobación.
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(6, 1fr)' }, mb: 2 }}>
        <StatCard label="Total brigadistas" value={counts.total} icon={<GroupsIcon />} color="#263238" />
        <StatCard label="Disponibles" value={counts.disponibles} icon={<EventAvailableIcon />} color="#2E7D32" />
        <StatCard label="Conectados" value={counts.conectados} icon={<WifiIcon />} color="#1565C0" hint="últimos 5 min" />
        <StatCard label="En emergencia" value={enEmergencia} icon={<DirectionsRunIcon />} color="#6A1B9A" />
        <StatCard label="Alertas activas" value={activas.length + apoyos.length} icon={<NotificationsActiveIcon />} color="#B71C1C"
          hint={`${activas.length} emerg. · ${apoyos.length} SOS`} />
        <StatCard label="T. promedio respuesta" value={fmtDuration(ind.tiempoRespuestaPromSeg)} icon={<TimerIcon />} color="#EF6C00" hint="últimas 100 activaciones" />
      </Box>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1.4fr 1fr' } }}>
        <Card>
          <CardHeader title="Mapa operativo" subheader={`${markers.length} brigadistas con ubicación reciente`}
            action={<Button component={RouterLink} to="/mapa">Abrir</Button>} />
          <CardContent sx={{ pt: 0 }}>
            <MapView markers={markers} pins={pins} height={380} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Estados en tiempo real"
            subheader={principal ? `${labelOf(EMERGENCIA_TIPOS, principal.tipo)} · ${fmtDateTime(principal.createdAt)}` : 'Sin emergencias activas'}
            action={principal && <Button component={RouterLink} to={`/emergencias/${principal.id}`}>Detalle</Button>}
          />
          <CardContent sx={{ pt: 0 }}>
            {principal ? (
              <>
                <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                  <TipoChip tipo={principal.tipo} />
                  <NivelChip nivel={principal.nivel} />
                  <Typography variant="body2" sx={{ ml: 'auto !important' }}>
                    {respuestas.length}/{principal.notificaciones?.destinatarios ?? '?'} respondieron
                  </Typography>
                </Stack>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chart} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                    <RTooltip />
                    <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                      {chart.map((c) => <Cell key={c.name} fill={c.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </>
            ) : (
              <Alert severity="success">Operación normal. No hay emergencias activas.</Alert>
            )}
          </CardContent>
        </Card>
      </Box>

      <Card sx={{ mt: 2 }}>
        <CardHeader title="Actividad reciente" />
        <CardContent sx={{ pt: 0 }}>
          {recientes.slice(0, 6).map((e) => (
            <Stack key={e.id} direction="row" spacing={1} alignItems="center" component={RouterLink} to={`/emergencias/${e.id}`}
              sx={{ py: 1, borderBottom: 1, borderColor: 'divider', color: 'inherit', textDecoration: 'none', flexWrap: 'wrap' }}>
              <TipoChip tipo={e.tipo} />
              <NivelChip nivel={e.nivel} />
              <Typography variant="body2" sx={{ flex: 1 }}>{sedesMap[e.sedeId]?.nombre || e.sedeNombre || 'Todas las sedes'}</Typography>
              <Typography variant="caption" color="text.secondary">{fmtDateTime(e.createdAt)} · {e.estado}</Typography>
            </Stack>
          ))}
          {recientes.length === 0 && <Typography color="text.secondary">Sin registros.</Typography>}
        </CardContent>
      </Card>
    </>
  );
}

function BrigadistaHome() {
  const { user, profile } = useAuth();
  const { activas } = useOps();
  const { sharing, setSharing, position, error } = useGeo();
  const { puntos } = useSedes();
  const [push, setPush] = useState(hasPushToken());
  const [pushErr, setPushErr] = useState('');

  const certs = (profile?.certificaciones || []).filter((c) => (daysUntil(c.fechaVencimiento) ?? 999) <= 30);
  const misPuntos = puntos.filter((p) => !profile?.sedeId || p.sedeId === profile.sedeId);

  return (
    <>
      <PageHeader title={`Hola, ${profile?.nombre?.split(' ')[0] || ''}`} subtitle="Su panel de brigadista" />

      {activas.map((e) => (
        <Card key={e.id} sx={{ mb: 2, borderColor: 'primary.main', borderWidth: 2 }}>
          <CardHeader
            title={<Stack direction="row" spacing={1}><TipoChip tipo={e.tipo} /><NivelChip nivel={e.nivel} /></Stack>}
            subheader={`${e.sedeNombre || ''} · ${fmtDateTime(e.createdAt)}`}
            action={<Button component={RouterLink} to={`/emergencias/${e.id}`}>Detalle</Button>}
          />
          <CardContent sx={{ pt: 0 }}>
            {e.descripcion && <Typography sx={{ mb: 2 }}>{e.descripcion}</Typography>}
            <ResponsePanel emergencia={e} />
          </CardContent>
        </Card>
      ))}
      {activas.length === 0 && <Alert severity="success" sx={{ mb: 2 }}>No hay emergencias activas.</Alert>}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <Card>
          <CardHeader title="Preparación" />
          <CardContent sx={{ pt: 0 }}>
            <Stack spacing={1}>
              <FormControlLabel control={<Switch checked={sharing} onChange={(e) => setSharing(e.target.checked)} />} label="Compartir mi ubicación GPS" />
              {error && <Alert severity="warning">{error}</Alert>}
              <FormControlLabel
                control={<Switch checked={Boolean(profile?.disponible)} onChange={(e) => actualizarBrigadista(user.uid, { disponible: e.target.checked })} />}
                label="Estoy disponible (en turno)"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={push}
                    onChange={async () => {
                      try {
                        setPushErr('');
                        await enablePush(user, profile);
                        setPush(true);
                      } catch (e) {
                        setPushErr(e.message);
                      }
                    }}
                  />
                }
                label="Notificaciones push"
              />
              {pushErr && <Alert severity="warning">{pushErr}</Alert>}
              {certs.map((c) => (
                <Alert key={c.nombre} severity={daysUntil(c.fechaVencimiento) < 0 ? 'error' : 'warning'}>
                  Certificación «{c.nombre}» {daysUntil(c.fechaVencimiento) < 0 ? 'vencida' : 'vence'} el {fmtDate(c.fechaVencimiento)}
                </Alert>
              ))}
            </Stack>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Mi ubicación y puntos de encuentro" />
          <CardContent sx={{ pt: 0 }}>
            <MapView
              markers={position ? [{ id: 'yo', ...position, color: '#1565C0', label: 'Usted está aquí' }] : []}
              pins={misPuntos}
              height={300}
            />
          </CardContent>
        </Card>
      </Box>
    </>
  );
}

export default function Dashboard() {
  const { hasRole } = useAuth();
  return hasRole('jefe_brigada') ? <CoordinatorDashboard /> : <BrigadistaHome />;
}

