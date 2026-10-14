import { useState } from 'react';
import { doc } from 'firebase/firestore';
import { Box, Button, Typography, Snackbar, Alert } from '@mui/material';
import { db } from '../config/firebase';
import { ESTADOS_RESPUESTA } from '../config/constants';
import { useAuth } from '../contexts/AuthContext';
import { useGeo } from '../contexts/LocationContext';
import { useDocument } from '../hooks/useFirestore';
import { responder } from '../services/emergencias';
import { timeAgo } from '../utils/format';

/** Botonera de estados de respuesta del brigadista para una emergencia. */
export default function ResponsePanel({ emergencia, compact }) {
  const { user, profile } = useAuth();
  const { getCurrent } = useGeo();
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const { data: mine } = useDocument(
    () => (emergencia?.id && user ? doc(db, 'emergencias', emergencia.id, 'respuestas', user.uid) : null),
    [emergencia?.id, user?.uid],
  );

  if (!emergencia || emergencia.estado !== 'activa') return null;

  const send = async (estado) => {
    setBusy(estado);
    try {
      const ubicacion = await getCurrent();
      await responder(emergencia.id, estado, ubicacion, user, profile);
      setMsg({ sev: navigator.onLine ? 'success' : 'info', text: navigator.onLine ? 'Estado reportado' : 'Sin conexión: se enviará al reconectar' });
    } catch (e) {
      setMsg({ sev: 'error', text: e.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Box>
      {!compact && (
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Mi estado {mine?.updatedAt ? `· actualizado ${timeAgo(mine.updatedAt)}` : '· sin reportar'}
        </Typography>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1 }}>
        {ESTADOS_RESPUESTA.map((e) => {
          const active = mine?.estado === e.id;
          return (
            <Button
              key={e.id}
              onClick={() => send(e.id)}
              disabled={Boolean(busy)}
              variant={active ? 'contained' : 'outlined'}
              sx={{
                py: 1.4,
                borderColor: e.color,
                color: active ? '#fff' : e.color,
                bgcolor: active ? e.color : undefined,
                '&:hover': { bgcolor: active ? e.color : undefined, borderColor: e.color },
                fontWeight: 700,
              }}
            >
              {busy === e.id ? 'Enviando…' : e.label}
            </Button>
          );
        })}
      </Box>
      <Snackbar open={Boolean(msg)} autoHideDuration={3000} onClose={() => setMsg(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {msg ? <Alert severity={msg.sev} variant="filled" onClose={() => setMsg(null)}>{msg.text}</Alert> : <span />}
      </Snackbar>
    </Box>
  );
}
