import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, ButtonBase, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { EMERGENCIA_TIPOS, NIVELES, TODAS_LAS_SEDES, labelOf, colorOf } from '../config/constants';
import { useAuth } from '../contexts/AuthContext';
import { useGeo } from '../contexts/LocationContext';
import { useSedes } from '../hooks/useSedes';
import { activarEmergencia } from '../services/emergencias';
import EmergencyIcon from './EmergencyIcon';

const INICIAL = { tipo: '', nivel: 'alto', sedeId: '', descripcion: '', usarUbicacion: true };

/** Activación en dos pasos: datos → confirmación explícita. */
export default function ActivationDialog({ open, onClose, defaultTipo }) {
  const { user, profile } = useAuth();
  const { getCurrent } = useGeo();
  const { sedes, sedesMap } = useSedes();
  const navigate = useNavigate();
  const [f, setF] = useState({ ...INICIAL, tipo: defaultTipo || '', sedeId: profile?.sedeId || TODAS_LAS_SEDES });
  const [step, setStep] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));
  const close = () => {
    setStep(0);
    setConfirm(false);
    setError('');
    setF({ ...INICIAL, sedeId: profile?.sedeId || TODAS_LAS_SEDES });
    onClose();
  };

  const activar = async () => {
    setBusy(true);
    setError('');
    try {
      const sede = sedesMap[f.sedeId];
      const ubicacion = f.usarUbicacion ? (await getCurrent()) || sede?.ubicacion || null : sede?.ubicacion || null;
      const id = await activarEmergencia(
        { ...f, sedeNombre: sede?.nombre || 'Todas las sedes', ubicacion: ubicacion && { lat: ubicacion.lat, lng: ubicacion.lng } },
        user,
        profile,
      );
      close();
      navigate(`/emergencias/${id}`);
    } catch (e) {
      setError(e.code === 'permission-denied' ? 'No tiene permisos para activar emergencias.' : e.message);
    } finally {
      setBusy(false);
    }
  };

  const esSimulacro = f.tipo === 'simulacro';

  return (
    <Dialog open={open} onClose={busy ? undefined : close} fullWidth maxWidth="md">
      <DialogTitle sx={{ bgcolor: 'primary.main', color: '#fff' }}>
        {step === 0 ? 'Activar emergencia' : 'Confirmar activación'}
      </DialogTitle>
      <DialogContent sx={{ pt: '20px !important' }}>
        {step === 0 && (
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="subtitle2" gutterBottom>Tipo de emergencia</Typography>
              <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' } }}>
                {EMERGENCIA_TIPOS.map((t) => {
                  const sel = f.tipo === t.id;
                  return (
                    <ButtonBase
                      key={t.id}
                      onClick={() => set('tipo')(t.id)}
                      sx={{
                        p: 2, borderRadius: 2, border: 2, flexDirection: 'column', gap: 1,
                        borderColor: sel ? t.color : 'divider', bgcolor: sel ? t.color : 'transparent', color: sel ? '#fff' : 'text.primary',
                      }}
                    >
                      <EmergencyIcon tipo={t.id} sx={{ fontSize: 34, color: sel ? '#fff' : t.color }} />
                      <Typography variant="body2" fontWeight={700}>{t.label}</Typography>
                    </ButtonBase>
                  );
                })}
              </Box>
            </Box>
            <Box>
              <Typography variant="subtitle2" gutterBottom>Nivel de emergencia</Typography>
              <ToggleButtonGroup exclusive fullWidth value={f.nivel} onChange={(_, v) => v && set('nivel')(v)}>
                {NIVELES.map((n) => (
                  <ToggleButton key={n.id} value={n.id}
                    sx={{ fontWeight: 700, '&.Mui-selected, &.Mui-selected:hover': { bgcolor: n.color, color: '#fff' } }}>
                    {n.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
            <TextField select label="Sede / centro de operación" value={f.sedeId} onChange={set('sedeId')}>
              <MenuItem value={TODAS_LAS_SEDES}>Todas las sedes</MenuItem>
              {sedes.map((s) => <MenuItem key={s.id} value={s.id}>{s.nombre}</MenuItem>)}
            </TextField>
            <TextField label="Descripción / instrucciones" multiline minRows={2} value={f.descripcion} onChange={set('descripcion')}
              placeholder="Ej.: Conato de incendio en bodega 2. Evacuar por ruta norte." />
            <FormControlLabel control={<Checkbox checked={f.usarUbicacion} onChange={(e) => set('usarUbicacion')(e.target.checked)} />}
              label="Usar mi ubicación GPS como punto de la emergencia (si no, la de la sede)" />
          </Stack>
        )}

        {step === 1 && (
          <Stack spacing={2}>
            <Alert severity={esSimulacro ? 'info' : 'error'} variant="filled">
              {esSimulacro
                ? 'Se notificará un SIMULACRO a los brigadistas.'
                : 'Se notificará una EMERGENCIA REAL por push, correo, WhatsApp y SMS a todos los brigadistas de la sede.'}
            </Alert>
            <Box sx={{ display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 1 }}>
              <Typography color="text.secondary">Tipo</Typography><Typography fontWeight={700}>{labelOf(EMERGENCIA_TIPOS, f.tipo)}</Typography>
              <Typography color="text.secondary">Nivel</Typography>
              <Typography fontWeight={700} sx={{ color: colorOf(NIVELES, f.nivel) }}>{labelOf(NIVELES, f.nivel)}</Typography>
              <Typography color="text.secondary">Sede</Typography><Typography>{sedesMap[f.sedeId]?.nombre || 'Todas las sedes'}</Typography>
              <Typography color="text.secondary">Responsable</Typography><Typography>{profile?.nombre || user?.email}</Typography>
              <Typography color="text.secondary">Fecha y hora</Typography><Typography>Se registra automáticamente (hora del servidor)</Typography>
              <Typography color="text.secondary">Descripción</Typography><Typography>{f.descripcion || '—'}</Typography>
            </Box>
            <FormControlLabel control={<Checkbox checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />}
              label={<strong>Confirmo que deseo activar esta {esSimulacro ? 'alerta de simulacro' : 'emergencia'}</strong>} />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={step === 0 ? close : () => setStep(0)} disabled={busy}>{step === 0 ? 'Cancelar' : 'Atrás'}</Button>
        {step === 0 ? (
          <Button variant="contained" disabled={!f.tipo} onClick={() => setStep(1)}>Continuar</Button>
        ) : (
          <Button variant="contained" color="primary" size="large" disabled={!confirm || busy} onClick={activar} sx={{ fontWeight: 800 }}>
            {busy ? 'Activando…' : 'ACTIVAR AHORA'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
