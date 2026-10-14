import { useState } from 'react';
import {
  Alert, Box, Button, Card, CardActions, CardContent, CardHeader, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, List, ListItem, ListItemText, MenuItem, Stack, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useAuth } from '../contexts/AuthContext';
import { useSedes } from '../hooks/useSedes';
import { SEDE_TIPOS, labelOf } from '../config/constants';
import { guardarSede, subirPlano } from '../services/sedes';
import { mapsLink } from '../utils/geo';
import MapView, { ICON_SEDE } from '../components/MapView';
import PageHeader from '../components/PageHeader';

const VACIA = { nombre: '', tipo: 'sede', direccion: '', responsable: '', telefono: '', ubicacion: null, puntosEncuentro: [], rutas: [], planos: [] };

function SedeForm({ initial, onClose }) {
  const [f, setF] = useState(initial);
  const [modo, setModo] = useState('sede'); // qué fija el clic en el mapa
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const upd = (lista, i, k, v) => setF((s) => ({ ...s, [lista]: s[lista].map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
  const del = (lista, i) => setF((s) => ({ ...s, [lista]: s[lista].filter((_, j) => j !== i) }));

  const onMap = (p) => {
    if (modo === 'sede') setF((s) => ({ ...s, ubicacion: p }));
    else setF((s) => ({ ...s, puntosEncuentro: [...s.puntosEncuentro, { nombre: `Punto ${s.puntosEncuentro.length + 1}`, capacidad: '', ...p }] }));
  };

  const plano = async (file) => {
    setBusy(true);
    try {
      const p = await subirPlano(initial.id || `nueva_${Date.now()}`, file);
      setF((s) => ({ ...s, planos: [...s.planos, p] }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!f.nombre.trim()) return setError('El nombre es obligatorio.');
    setBusy(true);
    try {
      await guardarSede(initial.id, f);
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
    return null;
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{initial.id ? 'Editar centro de operación' : 'Nuevo centro de operación'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, pt: 1 }}>
          <Stack spacing={2}>
            <TextField label="Nombre *" value={f.nombre} onChange={set('nombre')} />
            <TextField select label="Tipo" value={f.tipo} onChange={set('tipo')}>
              {SEDE_TIPOS.map((t) => <MenuItem key={t.id} value={t.id}>{t.label}</MenuItem>)}
            </TextField>
            <TextField label="Dirección" value={f.direccion} onChange={set('direccion')} />
            <Stack direction="row" spacing={1}>
              <TextField label="Responsable" value={f.responsable} onChange={set('responsable')} />
              <TextField label="Teléfono" value={f.telefono} onChange={set('telefono')} />
            </Stack>

            <Typography variant="subtitle2">Puntos de encuentro ({f.puntosEncuentro.length})</Typography>
            {f.puntosEncuentro.map((p, i) => (
              <Stack key={i} direction="row" spacing={1} alignItems="center">
                <TextField label="Nombre" value={p.nombre} onChange={(e) => upd('puntosEncuentro', i, 'nombre', e.target.value)} />
                <TextField label="Capacidad" type="number" value={p.capacidad} onChange={(e) => upd('puntosEncuentro', i, 'capacidad', e.target.value)} sx={{ width: 120 }} />
                <IconButton onClick={() => del('puntosEncuentro', i)}><DeleteIcon /></IconButton>
              </Stack>
            ))}

            <Stack direction="row" alignItems="center">
              <Typography variant="subtitle2" sx={{ flex: 1 }}>Rutas de evacuación</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={() => setF((s) => ({ ...s, rutas: [...s.rutas, { nombre: '', descripcion: '' }] }))}>Agregar</Button>
            </Stack>
            {f.rutas.map((r, i) => (
              <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
                <TextField label="Ruta" value={r.nombre} onChange={(e) => upd('rutas', i, 'nombre', e.target.value)} sx={{ maxWidth: 160 }} />
                <TextField label="Recorrido / instrucciones" multiline value={r.descripcion} onChange={(e) => upd('rutas', i, 'descripcion', e.target.value)} />
                <IconButton onClick={() => del('rutas', i)}><DeleteIcon /></IconButton>
              </Stack>
            ))}

            <Stack direction="row" alignItems="center">
              <Typography variant="subtitle2" sx={{ flex: 1 }}>Planos</Typography>
              <Button size="small" component="label" startIcon={<UploadFileIcon />} disabled={busy}>
                Subir
                <input hidden type="file" accept="image/*,application/pdf" onChange={(e) => e.target.files?.[0] && plano(e.target.files[0])} />
              </Button>
            </Stack>
            {f.planos.map((p, i) => (
              <Stack key={p.path || i} direction="row" alignItems="center">
                <Typography component="a" href={p.url} target="_blank" rel="noopener" sx={{ flex: 1 }}>{p.nombre}</Typography>
                <IconButton onClick={() => del('planos', i)}><DeleteIcon /></IconButton>
              </Stack>
            ))}
          </Stack>
          <Box>
            <ToggleButtonGroup exclusive size="small" value={modo} onChange={(_, v) => v && setModo(v)} sx={{ mb: 1 }}>
              <ToggleButton value="sede">Clic fija ubicación de la sede</ToggleButton>
              <ToggleButton value="punto">Clic agrega punto de encuentro</ToggleButton>
            </ToggleButtonGroup>
            <MapView
              height={460}
              onClick={onMap}
              pins={[
                ...(f.ubicacion ? [{ id: 'sede', ...f.ubicacion, icon: ICON_SEDE, label: 'Sede' }] : []),
                ...f.puntosEncuentro.map((p, i) => ({ id: `p${i}`, lat: p.lat, lng: p.lng, label: p.nombre })),
              ]}
            />
          </Box>
        </Box>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={save} disabled={busy}>Guardar</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Sedes() {
  const { hasRole } = useAuth();
  const { sedes } = useSedes();
  const [editing, setEditing] = useState(null);
  const canEdit = hasRole('coordinador');

  return (
    <>
      <PageHeader title="Centros de operación" subtitle="Sedes, edificios, plantas y campus con planos, rutas y puntos de encuentro"
        actions={canEdit && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ ...VACIA })}>Nuevo</Button>} />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        {sedes.map((s) => (
          <Card key={s.id}>
            <CardHeader title={s.nombre} subheader={`${labelOf(SEDE_TIPOS, s.tipo)} · ${s.direccion || 'Sin dirección'}`} />
            <CardContent sx={{ pt: 0 }}>
              <MapView height={220}
                pins={[
                  ...(s.ubicacion ? [{ id: 'sede', ...s.ubicacion, icon: ICON_SEDE, label: s.nombre }] : []),
                  ...(s.puntosEncuentro || []).map((p, i) => ({ id: `p${i}`, lat: p.lat, lng: p.lng, label: `${p.nombre}${p.capacidad ? ` · cap. ${p.capacidad}` : ''}` })),
                ]} />
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
                <Chip size="small" label={`${s.puntosEncuentro?.length || 0} puntos de encuentro`} />
                <Chip size="small" label={`${s.rutas?.length || 0} rutas`} />
                <Chip size="small" label={`${s.planos?.length || 0} planos`} />
              </Stack>
              {(s.rutas || []).length > 0 && (
                <List dense>
                  {s.rutas.map((r, i) => <ListItem key={i} disableGutters><ListItemText primary={r.nombre} secondary={r.descripcion} /></ListItem>)}
                </List>
              )}
              {(s.planos || []).map((p) => (
                <Button key={p.path} size="small" href={p.url} target="_blank" rel="noopener">{p.nombre}</Button>
              ))}
            </CardContent>
            <CardActions>
              {s.ubicacion && <Button size="small" href={mapsLink(s.ubicacion)} target="_blank">Cómo llegar</Button>}
              {canEdit && <Button size="small" onClick={() => setEditing({ ...VACIA, ...s })}>Editar</Button>}
            </CardActions>
          </Card>
        ))}
      </Box>
      {sedes.length === 0 && <Typography color="text.secondary">Aún no hay centros de operación registrados.</Typography>}
      {editing && <SedeForm initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
