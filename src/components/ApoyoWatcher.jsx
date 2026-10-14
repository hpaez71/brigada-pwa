import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Typography, Stack } from '@mui/material';
import SosIcon from '@mui/icons-material/Sos';
import { useOps } from '../contexts/OpsContext';
import { useAuth } from '../contexts/AuthContext';
import { atenderApoyo } from '../services/emergencias';
import { playSiren } from '../utils/alarm';
import { mapsLink } from '../utils/geo';
import { timeAgo } from '../utils/format';

/** Banner intermitente para jefes/coordinadores con las solicitudes de apoyo abiertas. */
export default function ApoyoWatcher() {
  const { apoyos } = useOps();
  const { user, profile, hasRole } = useAuth();
  const navigate = useNavigate();
  const seen = useRef(new Set());

  useEffect(() => {
    const nuevos = apoyos.filter((a) => !seen.current.has(a.id));
    if (nuevos.some((a) => a.uid !== user?.uid)) playSiren(6000);
    apoyos.forEach((a) => seen.current.add(a.id));
  }, [apoyos, user?.uid]);

  if (!hasRole('jefe_brigada') || apoyos.length === 0) return null;

  return (
    <Box className="flash" sx={{ color: '#fff', px: 2, py: 1 }} role="alert">
      {apoyos.slice(0, 3).map((a) => (
        <Stack key={a.id} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ py: 0.5 }}>
          <SosIcon />
          <Typography sx={{ flex: 1, fontWeight: 700 }}>
            {a.nombre} solicita apoyo {a.mensaje ? `— “${a.mensaje}”` : ''} · {timeAgo(a.createdAt)}
          </Typography>
          <Stack direction="row" spacing={1}>
            {a.ubicacion && (
              <Button size="small" variant="contained" sx={{ bgcolor: '#fff', color: '#B71C1C' }}
                onClick={() => navigate(`/mapa?lat=${a.ubicacion.lat}&lng=${a.ubicacion.lng}`)}>
                Ver en mapa
              </Button>
            )}
            {a.ubicacion && (
              <Button size="small" variant="outlined" sx={{ color: '#fff', borderColor: '#fff' }} href={mapsLink(a.ubicacion)} target="_blank">
                Navegar
              </Button>
            )}
            {a.telefono && (
              <Button size="small" variant="outlined" sx={{ color: '#fff', borderColor: '#fff' }} href={`tel:${a.telefono}`}>
                Llamar
              </Button>
            )}
            <Button size="small" variant="outlined" sx={{ color: '#fff', borderColor: '#fff' }} onClick={() => atenderApoyo(a.id, user, profile)}>
              Atendida
            </Button>
          </Stack>
        </Stack>
      ))}
      {apoyos.length > 3 && <Typography variant="caption">+{apoyos.length - 3} solicitudes más</Typography>}
    </Box>
  );
}
