import { useState } from 'react';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import {
  Alert, Box, Button, Card, CardActions, CardContent, CardMedia, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, LinearProgress, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import AddAPhotoIcon from '@mui/icons-material/AddAPhoto';
import DescriptionIcon from '@mui/icons-material/Description';
import VerifiedIcon from '@mui/icons-material/Verified';
import { db } from '../config/firebase';
import { EVIDENCIA_TIPOS, labelOf } from '../config/constants';
import { useAuth } from '../contexts/AuthContext';
import { useGeo } from '../contexts/LocationContext';
import { useQuery } from '../hooks/useFirestore';
import { crearEvidencia, validarEvidencia } from '../services/evidencias';
import { actaAtencionPDF } from '../services/reports';
import { fmtDateTime, toInputDateTime } from '../utils/format';

const ACTA_VACIA = { fechaHora: '', lugar: '', personaAtendida: '', documentoAtendido: '', situacion: '', atencion: '', remision: '', responsable: '' };

function NuevaEvidencia({ open, onClose, emergenciaId, simulacroId }) {
  const { user, profile } = useAuth();
  const { getCurrent } = useGeo();
  const [tipo, setTipo] = useState('foto');
  const [file, setFile] = useState(null);
  const [obs, setObs] = useState('');
  const [acta, setActa] = useState({ ...ACTA_VACIA, fechaHora: toInputDateTime(new Date()), responsable: profile?.nombre || '' });
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const def = EVIDENCIA_TIPOS.find((t) => t.id === tipo);
  const needsFile = ['foto', 'video', 'documento'].includes(tipo);

  const save = async () => {
    setError('');
    if (needsFile && !file) return setError('Seleccione un archivo.');
    if (!needsFile && tipo === 'observacion' && !obs.trim()) return setError('Escriba la observación.');
    try {
      setProgress(0);
      const ubicacion = await getCurrent();
      const r = await crearEvidencia(
        {
          tipo,
          file: needsFile ? file : null,
          observaciones: obs,
          emergenciaId,
          simulacroId,
          acta: tipo === 'acta' ? { ...acta, fechaHora: acta.fechaHora ? new Date(acta.fechaHora).getTime() : Date.now() } : null,
          ubicacion: ubicacion && { lat: ubicacion.lat, lng: ubicacion.lng },
        },
        user,
        profile,
        setProgress,
      );
      setProgress(null);
      setFile(null);
      setObs('');
      onClose(r.queued ? 'Sin conexión: la evidencia se subirá automáticamente al reconectar.' : 'Evidencia registrada.');
    } catch (e) {
      setProgress(null);
      setError(e.message);
    }
    return null;
  };

  const a = (k) => (e) => setActa((s) => ({ ...s, [k]: e.target.value }));

  return (
    <Dialog open={open} onClose={() => onClose()} fullWidth maxWidth="sm">
      <DialogTitle>Registrar evidencia</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label="Tipo" value={tipo} onChange={(e) => { setTipo(e.target.value); setFile(null); }}>
            {EVIDENCIA_TIPOS.map((t) => <MenuItem key={t.id} value={t.id}>{t.label}</MenuItem>)}
          </TextField>
          {needsFile && (
            <Button variant="outlined" component="label" startIcon={<AddAPhotoIcon />} sx={{ py: 2 }}>
              {file ? file.name : tipo === 'foto' ? 'Tomar o elegir foto' : tipo === 'video' ? 'Grabar o elegir video' : 'Elegir documento'}
              <input hidden type="file" accept={def.accept} capture={tipo !== 'documento' ? 'environment' : undefined}
                onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </Button>
          )}
          {tipo === 'acta' && (
            <>
              <TextField type="datetime-local" label="Fecha y hora" InputLabelProps={{ shrink: true }} value={acta.fechaHora} onChange={a('fechaHora')} />
              <TextField label="Lugar" value={acta.lugar} onChange={a('lugar')} />
              <Stack direction="row" spacing={1}>
                <TextField label="Persona atendida" value={acta.personaAtendida} onChange={a('personaAtendida')} />
                <TextField label="Documento" value={acta.documentoAtendido} onChange={a('documentoAtendido')} />
              </Stack>
              <TextField label="Descripción de la situación" multiline minRows={2} value={acta.situacion} onChange={a('situacion')} />
              <TextField label="Atención brindada" multiline minRows={2} value={acta.atencion} onChange={a('atencion')} />
              <TextField label="Remisión (EPS, ARL, ambulancia…)" value={acta.remision} onChange={a('remision')} />
              <TextField label="Responsable" value={acta.responsable} onChange={a('responsable')} />
            </>
          )}
          <TextField label="Observaciones" multiline minRows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          {progress != null && <LinearProgress variant={progress ? 'determinate' : 'indeterminate'} value={progress} />}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()}>Cancelar</Button>
        <Button variant="contained" onClick={save} disabled={progress != null}>Guardar</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function EvidenceManager({ emergenciaId, simulacroId, max = 100 }) {
  const { hasRole } = useAuth();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const campo = emergenciaId ? 'emergenciaId' : simulacroId ? 'simulacroId' : null;
  const valor = emergenciaId || simulacroId;

  const { data } = useQuery(
    () =>
      campo
        ? query(collection(db, 'evidencias'), where(campo, '==', valor), orderBy('createdAt', 'desc'), limit(max))
        : query(collection(db, 'evidencias'), orderBy('createdAt', 'desc'), limit(max)),
    [campo, valor, max],
  );

  return (
    <Box>
      <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="subtitle1" sx={{ flex: 1 }}>{data.length} evidencia(s)</Typography>
        <Button variant="contained" startIcon={<AddAPhotoIcon />} onClick={() => setOpen(true)}>Agregar</Button>
      </Stack>
      {msg && <Alert severity="info" onClose={() => setMsg('')} sx={{ mb: 2 }}>{msg}</Alert>}
      <NuevaEvidencia open={open} emergenciaId={emergenciaId} simulacroId={simulacroId}
        onClose={(m) => { setOpen(false); if (m) setMsg(m); }} />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' } }}>
        {data.map((ev) => (
          <Card key={ev.id}>
            {ev.archivo?.contentType?.startsWith('image/') && (
              <CardMedia component="img" height="180" image={ev.archivo.url} alt={ev.archivo.nombre} loading="lazy" />
            )}
            {ev.archivo?.contentType?.startsWith('video/') && (
              <CardMedia component="video" height="180" src={ev.archivo.url} controls preload="metadata" />
            )}
            <CardContent>
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <Chip size="small" label={labelOf(EVIDENCIA_TIPOS, ev.tipo)} />
                {ev.validada && <Chip size="small" color="success" icon={<VerifiedIcon />} label="Validada" />}
              </Stack>
              {ev.acta && <Typography variant="body2"><strong>Atendido:</strong> {ev.acta.personaAtendida || '—'} · {ev.acta.lugar}</Typography>}
              {ev.observaciones && <Typography variant="body2">{ev.observaciones}</Typography>}
              <Typography variant="caption" color="text.secondary" display="block">
                {ev.autor?.nombre} · {fmtDateTime(ev.createdAt)}
              </Typography>
              {ev.sha256 && (
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  SHA-256 {ev.sha256.slice(0, 24)}…
                </Typography>
              )}
            </CardContent>
            <CardActions>
              {ev.archivo && !ev.archivo.contentType?.startsWith('image/') && (
                <Button size="small" startIcon={<DescriptionIcon />} href={ev.archivo.url} target="_blank" rel="noopener">Abrir</Button>
              )}
              {ev.archivo?.contentType?.startsWith('image/') && (
                <Button size="small" href={ev.archivo.url} target="_blank" rel="noopener">Ver original</Button>
              )}
              {ev.tipo === 'acta' && <Button size="small" onClick={() => actaAtencionPDF(ev)}>Acta PDF</Button>}
              {hasRole('jefe_brigada') && (
                <Button size="small" onClick={() => validarEvidencia(ev.id, !ev.validada)}>{ev.validada ? 'Quitar validación' : 'Validar'}</Button>
              )}
            </CardActions>
          </Card>
        ))}
      </Box>
    </Box>
  );
}
