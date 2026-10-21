import { useState } from 'react';
import {
  Alert, Avatar, Box, Button, Card, CardContent, CardHeader, FormControlLabel, Stack, Switch, TextField, Typography,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { useGeo } from '../contexts/LocationContext';
import { useSedes } from '../hooks/useSedes';
import { ROLE_LABELS } from '../config/constants';
import { actualizarBrigadista, subirFoto } from '../services/brigadistas';
import { disablePush, enablePush, hasPushToken, isIOS, isStandalone, showLocalNotification } from '../services/notifications';
import { daysUntil, fmtDate } from '../utils/format';
import { BrigadaChips } from '../components/Chips';
import MapView from '../components/MapView';
import { APP_VERSION, actualizarApp } from '../config/version';
import PageHeader from '../components/PageHeader';

export default function Perfil() {
  const { user, profile, role, resetPassword } = useAuth();
  const { sharing, setSharing, position, error: geoError } = useGeo();
  const { sedesMap } = useSedes();
  const [push, setPush] = useState(hasPushToken());
  const [msg, setMsg] = useState(null);
  const [tel, setTel] = useState(profile?.telefono || '');

  const togglePush = async (on) => {
    try {
      if (on) await enablePush(user, profile);
      else await disablePush();
      setPush(on);
      setMsg({ sev: 'success', text: on ? 'Notificaciones activadas en este dispositivo.' : 'Notificaciones desactivadas.' });
    } catch (e) {
      setMsg({ sev: 'warning', text: e.message });
    }
  };

  return (
    <>
      <PageHeader title="Mi perfil" />
      <Alert severity="info" icon={false} sx={{ mb: 2 }}
        action={<Button color="inherit" size="small" onClick={actualizarApp}>Buscar actualización</Button>}>
        Versión de la app: <strong>{APP_VERSION}</strong>
      </Alert>
      {msg && <Alert severity={msg.sev} onClose={() => setMsg(null)} sx={{ mb: 2 }}>{msg.text}</Alert>}
      {isIOS() && !isStandalone() && (
        <Alert severity="info" sx={{ mb: 2 }}>
          En iPhone: toque <strong>Compartir → Agregar a inicio</strong> y abra la app desde el ícono para recibir notificaciones push (iOS 16.4 o superior).
        </Alert>
      )}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <Card>
          <CardContent>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Avatar src={profile?.fotoUrl} sx={{ width: 72, height: 72 }}>{profile?.nombre?.[0]}</Avatar>
              <Box>
                <Typography variant="h6">{profile?.nombre || user.email}</Typography>
                <Typography variant="body2" color="text.secondary">{ROLE_LABELS[role]} · {profile?.cargo}</Typography>
                <Button size="small" component="label">Cambiar foto
                  <input hidden type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && subirFoto(user.uid, e.target.files[0])} />
                </Button>
              </Box>
            </Stack>
            <Typography variant="body2"><strong>Correo:</strong> {user.email}</Typography>
            <Typography variant="body2"><strong>Documento:</strong> {profile?.tipoDocumento} {profile?.documento}</Typography>
            <Typography variant="body2"><strong>Área:</strong> {profile?.area}</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}><strong>Sede:</strong> {sedesMap[profile?.sedeId]?.nombre || '—'}</Typography>
            <BrigadaChips brigadas={profile?.brigadas} />
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              <TextField label="Teléfono" value={tel} onChange={(e) => setTel(e.target.value)} />
              <Button onClick={() => actualizarBrigadista(user.uid, { telefono: tel }).then(() => setMsg({ sev: 'success', text: 'Teléfono actualizado.' }))}>Guardar</Button>
            </Stack>
            <Button sx={{ mt: 2 }} onClick={() => resetPassword(user.email).then(() => setMsg({ sev: 'info', text: 'Le enviamos un enlace para cambiar la contraseña.' }))}>
              Cambiar contraseña
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Este dispositivo" />
          <CardContent sx={{ pt: 0 }}>
            <Stack>
              <FormControlLabel control={<Switch checked={push} onChange={(e) => togglePush(e.target.checked)} />} label="Notificaciones push" />
              {push && <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => showLocalNotification('Prueba de alerta', 'Las notificaciones funcionan correctamente.')}>Enviar prueba local</Button>}
              <FormControlLabel control={<Switch checked={sharing} onChange={(e) => setSharing(e.target.checked)} />} label="Compartir ubicación automáticamente" />
              <FormControlLabel control={<Switch checked={Boolean(profile?.disponible)} onChange={(e) => actualizarBrigadista(user.uid, { disponible: e.target.checked })} />} label="Disponible (en turno)" />
              {geoError && <Alert severity="warning">{geoError}</Alert>}
            </Stack>
            {position && (
              <Box sx={{ mt: 2 }}>
                <MapView markers={[{ id: 'yo', ...position, color: '#1565C0', label: 'Usted' }]} height={220} />
                <Typography variant="caption" color="text.secondary">Precisión ±{Math.round(position.accuracy)} m</Typography>
              </Box>
            )}
          </CardContent>
        </Card>
        <Card sx={{ gridColumn: { md: 'span 2' } }}>
          <CardHeader title="Mis certificaciones" />
          <CardContent sx={{ pt: 0 }}>
            {(profile?.certificaciones || []).map((c) => {
              const d = daysUntil(c.fechaVencimiento);
              return (
                <Stack key={c.nombre} direction="row" spacing={1} sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }}>
                  <Typography sx={{ flex: 1 }}>{c.nombre} <Typography component="span" variant="caption" color="text.secondary">· {c.entidad}</Typography></Typography>
                  <Typography color={d != null && d < 0 ? 'error' : d != null && d <= 30 ? 'warning.main' : 'text.primary'}>
                    Vence {fmtDate(c.fechaVencimiento)}
                  </Typography>
                </Stack>
              );
            })}
            {!(profile?.certificaciones || []).length && <Typography color="text.secondary">Sin certificaciones registradas.</Typography>}
          </CardContent>
        </Card>
      </Box>
    </>
  );
}
