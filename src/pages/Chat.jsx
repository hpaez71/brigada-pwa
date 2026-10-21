import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore';
import {
  Alert, Autocomplete, Avatar, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  List, ListItemButton, ListItemText, Stack, TextField, Typography, useMediaQuery, FormControlLabel, Checkbox,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddCommentIcon from '@mui/icons-material/AddComment';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useDocument, useQuery } from '../hooks/useFirestore';
import { abrirDirecto, crearCanal, enviarMensaje } from '../services/chat';
import { fmtTime, fmtDate, toDate } from '../utils/format';

/** Texto seguro para mostrar: evita fallos si un campo llega con un tipo inesperado. */
const txt = (v) => (v == null ? '' : typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

function errorText(err) {
  const code = err?.code || '';
  if (code === 'permission-denied') return 'No tiene permiso para ver este canal o su sesión debe actualizarse. Cierre sesión y vuelva a ingresar.';
  if (code === 'not-found') return 'Este canal no existe o fue eliminado.';
  if (code === 'unavailable') return 'Sin conexión: se mostrarán los mensajes guardados y se sincronizará al volver la red.';
  if (code === 'failed-precondition') return 'Falta un índice en la base de datos. Avise al administrador.';
  return err?.message || 'Error al cargar el chat.';
}

function Conversacion({ canalId, onBack }) {
  const { user, profile } = useAuth();
  const [texto, setTexto] = useState('');
  const [file, setFile] = useState(null);
  const [esEvidencia, setEsEvidencia] = useState(false);
  const [aviso, setAviso] = useState('');
  const bottom = useRef(null);
  const { data: canal, loading: cargandoCanal, error: errCanal } = useDocument(() => doc(db, 'canales', canalId), [canalId]);
  const { data: desc, error: errMsgs } = useQuery(
    () => query(collection(db, 'canales', canalId, 'mensajes'), orderBy('createdAt', 'desc'), limit(150)),
    [canalId],
  );
  const msgs = useMemo(() => [...desc].reverse(), [desc]);

  // Llaves obligatorias: en navegadores recientes scrollIntoView devuelve una promesa, y React
  // la trataría como función de limpieza («... is not a function»).
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length]);

  const send = async (e) => {
    e?.preventDefault();
    if (!texto.trim() && !file) return;
    try {
      const r = await enviarMensaje(canalId, { texto, file, esEvidencia }, user, profile);
      if (r.queued) setAviso('Adjunto en cola: se enviará al recuperar conexión.');
      setTexto('');
      setFile(null);
      setEsEvidencia(false);
    } catch (err) {
      setAviso(`No se pudo enviar el mensaje: ${errorText(err)}`);
    }
  };

  const errVista = errCanal || errMsgs || (!cargandoCanal && !canal ? { code: 'not-found' } : null);

  let lastDay = '';
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        {onBack && <IconButton onClick={onBack}><ArrowBackIcon /></IconButton>}
        <Typography variant="subtitle1" fontWeight={700} noWrap>
          {txt(canal?.tipo === 'directo' ? Object.entries(canal.nombres || {}).find(([k]) => k !== user.uid)?.[1] : canal?.nombre) || 'Conversación'}
        </Typography>
        {canal?.tipo === 'emergencia' && <Chip size="small" color="error" label="Emergencia" />}
      </Stack>
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
        {errVista && <Alert severity="warning" sx={{ mb: 2 }}>{errorText(errVista)}</Alert>}
        {!errVista && msgs.length === 0 && (
          <Typography color="text.secondary" textAlign="center" sx={{ mt: 4 }}>Aún no hay mensajes. Escriba el primero.</Typography>
        )}
        {msgs.map((m) => {
          const mine = m.autor?.uid === user.uid;
          const day = fmtDate(m.createdAt || m.clientAt);
          const sep = day !== lastDay;
          lastDay = day;
          return (
            <Box key={m.id}>
              {sep && <Typography variant="caption" color="text.secondary" display="block" textAlign="center" sx={{ my: 1 }}>{day}</Typography>}
              <Stack direction="row" spacing={1} justifyContent={mine ? 'flex-end' : 'flex-start'} sx={{ mb: 1 }}>
                {!mine && <Avatar src={m.autor?.fotoUrl} sx={{ width: 28, height: 28 }}>{m.autor?.nombre?.[0]}</Avatar>}
                <Box sx={{ maxWidth: '78%', px: 1.5, py: 1, borderRadius: 2, bgcolor: mine ? 'primary.main' : 'action.hover', color: mine ? '#fff' : 'text.primary' }}>
                  {!mine && <Typography variant="caption" fontWeight={700} display="block">{txt(m.autor?.nombre)}</Typography>}
                  {m.adjunto?.contentType?.startsWith('image/') && (
                    <a href={m.adjunto.url} target="_blank" rel="noopener noreferrer">
                      <img src={m.adjunto.url} alt={m.adjunto.nombre} style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8, display: 'block' }} loading="lazy" />
                    </a>
                  )}
                  {m.adjunto && !m.adjunto.contentType?.startsWith('image/') && (
                    <Button size="small" href={m.adjunto.url} target="_blank" sx={{ color: 'inherit' }} startIcon={<AttachFileIcon />}>{m.adjunto.nombre}</Button>
                  )}
                  {m.texto && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{txt(m.texto)}</Typography>}
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>
                    {m.esEvidencia && '📎 evidencia · '}
                    {m.createdAt ? fmtTime(m.createdAt) : 'enviando…'}
                  </Typography>
                </Box>
              </Stack>
            </Box>
          );
        })}
        <div ref={bottom} />
      </Box>
      {aviso && <Alert severity="info" onClose={() => setAviso('')}>{aviso}</Alert>}
      <Box component="form" onSubmit={send} sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}>
        {file && (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Chip label={file.name} onDelete={() => setFile(null)} />
            <FormControlLabel control={<Checkbox size="small" checked={esEvidencia} onChange={(e) => setEsEvidencia(e.target.checked)} />} label="Marcar como evidencia" />
          </Stack>
        )}
        <Stack direction="row" spacing={1} alignItems="flex-end">
          <IconButton component="label" aria-label="Adjuntar">
            <AttachFileIcon />
            <input hidden type="file" accept="image/*,video/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </IconButton>
          <TextField placeholder="Escriba un mensaje…" value={texto} onChange={(e) => setTexto(e.target.value)} multiline maxRows={4}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <IconButton color="primary" type="submit" aria-label="Enviar"><SendIcon /></IconButton>
        </Stack>
      </Box>
    </Box>
  );
}

export default function Chat() {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const { user, profile, hasRole } = useAuth();
  const [params, setParams] = useSearchParams();
  const canalId = params.get('canal');
  const [nuevo, setNuevo] = useState(false);
  const [destino, setDestino] = useState(null);
  const [nombreGrupo, setNombreGrupo] = useState('');
  const [errNuevo, setErrNuevo] = useState('');

  const { data: publicos, error: errPub } = useQuery(() => query(collection(db, 'canales'), where('publico', '==', true), limit(100)), []);
  const { data: directos, error: errDir } = useQuery(() => query(collection(db, 'canales'), where('miembros', 'array-contains', user.uid), limit(100)), [user.uid]);
  const { data: directorio } = useQuery(() => (nuevo ? query(collection(db, 'directorio'), limit(1000)) : null), [nuevo]);

  const canales = useMemo(
    () => [...new Map([...publicos, ...directos].map((c) => [c.id, c])).values()].sort((a, b) => (toDate(b.ultimoMensajeAt || b.createdAt) || 0) - (toDate(a.ultimoMensajeAt || a.createdAt) || 0)),
    [publicos, directos],
  );
  const open = (id) => setParams(id ? { canal: id } : {});

  const lista = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" alignItems="center" sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>Canales</Typography>
        <IconButton onClick={() => setNuevo(true)} aria-label="Nuevo"><AddCommentIcon /></IconButton>
      </Stack>
      {(errPub || errDir) && <Alert severity="warning" sx={{ m: 1 }}>{errorText(errPub || errDir)}</Alert>}
      <List sx={{ flex: 1, overflowY: 'auto' }}>
        {canales.map((c) => (
          <ListItemButton key={c.id} selected={c.id === canalId} onClick={() => open(c.id)}>
            <ListItemText
              primary={txt(c.tipo === 'directo' ? Object.entries(c.nombres || {}).find(([k]) => k !== user.uid)?.[1] : c.nombre) || 'Canal'}
              secondary={txt(c.ultimoMensaje) || { general: 'Canal general', sede: 'Sede', emergencia: 'Emergencia', directo: 'Mensaje directo', grupo: 'Grupo' }[c.tipo]}
              secondaryTypographyProps={{ noWrap: true }}
            />
            {c.tipo === 'emergencia' && c.activo !== false && <Chip size="small" color="error" label="●" />}
          </ListItemButton>
        ))}
        {canales.length === 0 && !errPub && !errDir && <Typography sx={{ p: 2 }} color="text.secondary">Sin canales.</Typography>}
      </List>
    </Box>
  );

  return (
    <>
      <Card sx={{ height: 'calc(100vh - 170px)', minHeight: 420, display: 'grid', gridTemplateColumns: desktop ? '300px 1fr' : '1fr' }}>
        {(desktop || !canalId) && <Box sx={{ borderRight: desktop ? 1 : 0, borderColor: 'divider', minHeight: 0 }}>{lista}</Box>}
        {canalId ? (
          <Box sx={{ minHeight: 0 }}><Conversacion canalId={canalId} onBack={desktop ? null : () => open(null)} /></Box>
        ) : desktop && (
          <Box sx={{ display: 'grid', placeItems: 'center' }}><Typography color="text.secondary">Seleccione un canal</Typography></Box>
        )}
      </Card>

      <Dialog open={nuevo} onClose={() => setNuevo(false)} fullWidth maxWidth="xs">
        <DialogTitle>Nueva conversación</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {errNuevo && <Alert severity="error" onClose={() => setErrNuevo('')}>{errNuevo}</Alert>}
            <Autocomplete
              options={directorio.filter((d) => d.id !== user.uid)}
              getOptionLabel={(o) => `${txt(o.nombre) || 'Sin nombre'}${o.cargo ? ` · ${txt(o.cargo)}` : ''}`}
              value={destino}
              onChange={(_, v) => setDestino(v)}
              renderInput={(p) => <TextField {...p} label="Mensaje directo a…" />}
            />
            {hasRole('coordinador') && (
              <TextField label="…o crear grupo (nombre)" value={nombreGrupo} onChange={(e) => setNombreGrupo(e.target.value)} />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNuevo(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!destino && !nombreGrupo.trim()}
            onClick={async () => {
              try {
                const id = destino ? await abrirDirecto(user, profile, destino) : await crearCanal(nombreGrupo.trim(), 'grupo');
                setNuevo(false);
                setDestino(null);
                setNombreGrupo('');
                open(id);
              } catch (err) {
                setErrNuevo(errorText(err));
              }
            }}
          >
            Abrir
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
