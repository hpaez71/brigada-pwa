import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Fab, Stack, TextField, Typography,
} from '@mui/material';
import SosIcon from '@mui/icons-material/Sos';
import PhoneIcon from '@mui/icons-material/Phone';
import SmsIcon from '@mui/icons-material/Sms';
import { useAuth } from '../contexts/AuthContext';
import { useGeo } from '../contexts/LocationContext';
import { useOps } from '../contexts/OpsContext';
import { solicitarApoyo } from '../services/emergencias';
import { COORDINATOR_PHONE, EMERGENCY_PHONE } from '../config/constants';
import { mapsLink } from '../utils/geo';
import { unlockAudio } from '../utils/alarm';

/** Botón de pánico "Solicitar apoyo" siempre visible. */
export default function PanicButton() {
  const { user, profile } = useAuth();
  const { getCurrent, position } = useGeo();
  const { activas } = useOps();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState('');
  const [ubic, setUbic] = useState(null);

  // Acceso directo desde el ícono de la app (manifest shortcut ?panico=1)
  useEffect(() => {
    if (params.get('panico') === '1') {
      setOpen(true);
      params.delete('panico');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const enviar = async () => {
    setState('sending');
    try {
      const u = await getCurrent();
      setUbic(u);
      await solicitarApoyo({ ubicacion: u, emergenciaId: activas[0]?.id, mensaje }, user, profile);
      setState('sent');
      navigator.vibrate?.([200, 100, 200]);
    } catch (e) {
      setError(e.message);
      setState('error');
    }
  };

  const close = () => {
    setOpen(false);
    setState('idle');
    setMensaje('');
  };

  const loc = ubic || position;
  const smsBody = encodeURIComponent(
    `SOS ${profile?.nombre || ''}: necesito apoyo. ${loc ? `Ubicación: ${mapsLink(loc)}` : ''} ${mensaje}`.trim(),
  );

  return (
    <>
      <Fab
        variant="extended"
        color="primary"
        className="pulse"
        onClick={() => {
          unlockAudio();
          setOpen(true);
        }}
        sx={{ position: 'fixed', right: 16, bottom: 'calc(16px + env(safe-area-inset-bottom))', zIndex: 1300, fontWeight: 800 }}
        aria-label="Solicitar apoyo"
      >
        <SosIcon sx={{ mr: 1 }} /> Solicitar apoyo
      </Fab>

      <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle sx={{ bgcolor: 'primary.main', color: '#fff' }}>Solicitar apoyo urgente</DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          {state === 'sent' ? (
            <Alert severity={navigator.onLine ? 'success' : 'warning'}>
              {navigator.onLine
                ? 'Solicitud enviada. Los coordinadores y jefes de brigada fueron notificados con su ubicación.'
                : 'Sin conexión: la solicitud quedó en cola y se enviará al reconectar. Use también la llamada o el SMS.'}
            </Alert>
          ) : (
            <Stack spacing={2}>
              <Typography variant="body2">
                Se enviará su ubicación GPS y se generará un evento prioritario.
                {activas[0] ? ' Se asociará a la emergencia activa.' : ''}
              </Typography>
              <TextField
                label="Mensaje (opcional)"
                placeholder="Ej.: persona atrapada, piso 3"
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                multiline
                minRows={2}
              />
              {state === 'error' && <Alert severity="error">{error}</Alert>}
              <Button
                size="large"
                variant="contained"
                color="primary"
                onClick={enviar}
                disabled={state === 'sending'}
                sx={{ py: 2, fontSize: 18, fontWeight: 800 }}
              >
                {state === 'sending' ? 'Enviando…' : 'ENVIAR SOS'}
              </Button>
            </Stack>
          )}
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2 }}>
            Respaldo sin Internet:
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button fullWidth variant="outlined" startIcon={<PhoneIcon />} href={`tel:${EMERGENCY_PHONE}`}>
              Llamar {EMERGENCY_PHONE}
            </Button>
            {COORDINATOR_PHONE && (
              <Button fullWidth variant="outlined" startIcon={<SmsIcon />} href={`sms:${COORDINATOR_PHONE}?&body=${smsBody}`}>
                SMS coordinador
              </Button>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
