import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Dialog, DialogContent, Typography, Stack } from '@mui/material';
import { useOps } from '../contexts/OpsContext';
import { useAuth } from '../contexts/AuthContext';
import { useGeo } from '../contexts/LocationContext';
import { EMERGENCIA_TIPOS, NIVELES, labelOf, colorOf } from '../config/constants';
import { responder } from '../services/emergencias';
import { playSiren, stopSiren } from '../utils/alarm';
import { fmtDateTime, toDate } from '../utils/format';
import EmergencyIcon from './EmergencyIcon';

const ACK_KEY = 'brigadas.ackEmergencias';
const readAcks = () => {
  try {
    return JSON.parse(localStorage.getItem(ACK_KEY) || '[]');
  } catch {
    return [];
  }
};

/**
 * Alerta a pantalla completa cuando se activa una emergencia.
 * Funciona aunque falle el push: se basa en el listener en tiempo real de Firestore.
 */
export default function EmergencyWatcher() {
  const { activas } = useOps();
  const { user, profile } = useAuth();
  const { getCurrent } = useGeo();
  const navigate = useNavigate();
  const [acks, setAcks] = useState(readAcks);

  const pendiente = useMemo(
    () =>
      activas.find((e) => {
        const created = toDate(e.createdAt)?.getTime() ?? e.clientCreatedAt;
        const reciente = !created || Date.now() - created < 6 * 3600 * 1000;
        const aplica = !e.sedeId || e.sedeId === 'todas' || !profile?.sedeId || e.sedeId === profile.sedeId;
        return reciente && aplica && !acks.includes(e.id) && e.activadaPor?.uid !== user?.uid;
      }),
    [activas, acks, profile?.sedeId, user?.uid],
  );

  useEffect(() => {
    if (pendiente) playSiren(pendiente.nivel === 'critico' ? 15000 : 8000);
    return () => stopSiren();
  }, [pendiente?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ack = (id) => {
    const next = [...acks, id].slice(-50);
    localStorage.setItem(ACK_KEY, JSON.stringify(next));
    setAcks(next);
    stopSiren();
  };

  if (!pendiente) return null;
  const color = colorOf(NIVELES, pendiente.nivel);

  return (
    <Dialog open fullScreen PaperProps={{ className: 'flash', sx: { color: '#fff' } }}>
      <DialogContent sx={{ display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <Stack spacing={3} alignItems="center" sx={{ maxWidth: 520 }}>
          <EmergencyIcon tipo={pendiente.tipo} sx={{ fontSize: 96 }} />
          <Typography variant="overline" sx={{ fontSize: 16, letterSpacing: 4 }}>
            {pendiente.esSimulacro ? 'SIMULACRO' : 'EMERGENCIA ACTIVADA'}
          </Typography>
          <Typography variant="h3" sx={{ fontWeight: 900 }}>{labelOf(EMERGENCIA_TIPOS, pendiente.tipo)}</Typography>
          <Box sx={{ bgcolor: '#fff', color, px: 2, py: 0.5, borderRadius: 2, fontWeight: 800 }}>
            NIVEL {labelOf(NIVELES, pendiente.nivel).toUpperCase()}
          </Box>
          <Typography>{pendiente.sedeNombre || ''} · {fmtDateTime(pendiente.createdAt)}</Typography>
          {pendiente.descripcion && <Typography variant="h6">{pendiente.descripcion}</Typography>}
          <Typography variant="body2">Activada por {pendiente.activadaPor?.nombre}</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ width: '100%' }}>
            <Button
              fullWidth
              size="large"
              variant="contained"
              sx={{ bgcolor: '#fff', color: '#B71C1C', fontWeight: 800, py: 2, '&:hover': { bgcolor: '#eee' } }}
              onClick={async () => {
                ack(pendiente.id);
                const ubicacion = await getCurrent();
                responder(pendiente.id, 'recibido', ubicacion, user, profile).catch(console.error);
                navigate(`/emergencias/${pendiente.id}`);
              }}
            >
              RECIBIDO — RESPONDER
            </Button>
            <Button fullWidth size="large" variant="outlined" sx={{ color: '#fff', borderColor: '#fff', py: 2 }} onClick={() => ack(pendiente.id)}>
              Silenciar
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
