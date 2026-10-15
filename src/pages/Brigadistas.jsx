import { useMemo, useState } from 'react';
import { collection, limit, query, where } from 'firebase/firestore';
import {
  Alert, Avatar, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControlLabel, FormGroup, IconButton, InputAdornment, MenuItem, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography, Card, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/PersonAdd';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import WarningIcon from '@mui/icons-material/Warning';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '../hooks/useFirestore';
import { useSedes } from '../hooks/useSedes';
import { BRIGADA_TIPOS, ROLE_LABELS, ROLE_RANK } from '../config/constants';
import { actualizarBrigadista, aprobarUsuario, asignarRol, crearBrigadista, subirFoto } from '../services/brigadistas';
import { daysUntil, fmtDate, fmtDateTime, toInputDate } from '../utils/format';
import { exportarExcel, filaBrigadista, COLS_BRIGADISTA } from '../services/reports';
import { BrigadaChips } from '../components/Chips';
import PageHeader from '../components/PageHeader';

const VACIO = {
  nombre: '', tipoDocumento: 'CC', documento: '', cargo: '', area: '', telefono: '', email: '', brigadas: [],
  sedeId: '', estado: 'activo', role: 'brigadista', certificaciones: [], grupoSanguineo: '', contactoEmergencia: '', disponible: true,
};

function certAlert(certs = []) {
  const dias = certs.map((c) => daysUntil(c.fechaVencimiento)).filter((d) => d != null);
  if (!dias.length) return null;
  const min = Math.min(...dias);
  if (min < 0) return { color: 'error', text: 'Certificación vencida' };
  if (min <= 30) return { color: 'warning', text: `Vence en ${min} días` };
  return null;
}

function BrigadistaForm({ open, initial, onClose }) {
  const { role: myRole } = useAuth();
  const { sedes } = useSedes();
  const [f, setF] = useState(initial);
  const [foto, setFoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const isNew = !initial.id;
  const isAdmin = myRole === 'admin';
  const rolesPermitidos = Object.keys(ROLE_LABELS).filter((r) => isAdmin || ROLE_RANK[r] <= ROLE_RANK.jefe_brigada);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const toggleBrigada = (id) =>
    setF((s) => ({ ...s, brigadas: s.brigadas.includes(id) ? s.brigadas.filter((b) => b !== id) : [...s.brigadas, id] }));
  const setCert = (i, k, v) =>
    setF((s) => ({ ...s, certificaciones: s.certificaciones.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));

  const save = async () => {
    setError('');
    if (!f.nombre.trim() || !f.documento.trim()) return setError('Nombre y documento son obligatorios.');
    if (isNew && !/^\S+@\S+\.\S+$/.test(f.email)) return setError('Correo inválido.');
    setBusy(true);
    try {
      const data = {
        ...f,
        certificaciones: f.certificaciones
          .filter((c) => c.nombre?.trim())
          .map((c) => ({
            ...c,
            fechaExpedicion: c.fechaExpedicion ? new Date(`${toInputDate(c.fechaExpedicion)}T12:00:00`) : null,
            fechaVencimiento: c.fechaVencimiento ? new Date(`${toInputDate(c.fechaVencimiento)}T12:00:00`) : null,
          })),
      };
      let uid = initial.id;
      if (isNew) {
        const r = await crearBrigadista(data);
        uid = r.uid;
        setResult(r);
      } else {
        await actualizarBrigadista(uid, data);
        if (f.role !== initial.role) await asignarRol(uid, f.role);
      }
      if (foto) await subirFoto(uid, foto);
      if (!isNew) onClose(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
    return null;
  };

  if (result) {
    return (
      <Dialog open={open} onClose={() => onClose(true)} maxWidth="sm" fullWidth>
        <DialogTitle>Brigadista creado</DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            {result.emailEnviado ? 'Se envió un correo para que defina su contraseña.' : 'Comparta este enlace para que defina su contraseña:'}
          </Alert>
          {!result.emailEnviado && result.resetLink && (
            <TextField value={result.resetLink} multiline InputProps={{ readOnly: true }} onFocus={(e) => e.target.select()} />
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => onClose(true)}>Listo</Button></DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={() => onClose(false)} maxWidth="md" fullWidth>
      <DialogTitle>{isNew ? 'Nuevo brigadista' : 'Editar brigadista'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar src={foto ? URL.createObjectURL(foto) : f.fotoUrl} sx={{ width: 72, height: 72 }} />
            <Button component="label" variant="outlined">
              Foto
              <input hidden type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] || null)} />
            </Button>
          </Stack>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            <TextField label="Nombre completo *" value={f.nombre} onChange={set('nombre')} />
            <Stack direction="row" spacing={1}>
              <TextField select label="Tipo" value={f.tipoDocumento} onChange={set('tipoDocumento')} sx={{ width: 110 }}>
                {['CC', 'CE', 'TI', 'PA', 'PPT'].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
              <TextField label="Documento *" value={f.documento} onChange={set('documento')} />
            </Stack>
            <TextField label="Cargo" value={f.cargo} onChange={set('cargo')} />
            <TextField label="Área" value={f.area} onChange={set('area')} />
            <TextField label="Teléfono (con indicativo, ej. +57…)" value={f.telefono} onChange={set('telefono')} />
            <TextField label="Correo electrónico *" value={f.email} onChange={set('email')} disabled={!isNew} />
            <TextField select label="Sede asignada" value={f.sedeId} onChange={set('sedeId')}>
              <MenuItem value="">Sin sede</MenuItem>
              {sedes.map((s) => <MenuItem key={s.id} value={s.id}>{s.nombre}</MenuItem>)}
            </TextField>
            <TextField select label="Estado" value={f.estado} onChange={set('estado')}>
              <MenuItem value="activo">Activo</MenuItem>
              <MenuItem value="inactivo">Inactivo (bloquea el acceso)</MenuItem>
            </TextField>
            <TextField select label="Rol" value={f.role} onChange={set('role')} disabled={!isNew && !isAdmin}>
              {rolesPermitidos.map((r) => <MenuItem key={r} value={r}>{ROLE_LABELS[r]}</MenuItem>)}
            </TextField>
            <TextField label="Grupo sanguíneo (RH)" value={f.grupoSanguineo} onChange={set('grupoSanguineo')} />
            <TextField label="Contacto de emergencia" value={f.contactoEmergencia} onChange={set('contactoEmergencia')} sx={{ gridColumn: { sm: 'span 2' } }} />
          </Box>
          <Box>
            <Typography variant="subtitle2">Tipo de brigada</Typography>
            <FormGroup row>
              {BRIGADA_TIPOS.map((b) => (
                <FormControlLabel key={b.id} label={b.label}
                  control={<Checkbox checked={f.brigadas.includes(b.id)} onChange={() => toggleBrigada(b.id)} />} />
              ))}
            </FormGroup>
          </Box>
          <Divider />
          <Stack direction="row" alignItems="center">
            <Typography variant="subtitle2" sx={{ flex: 1 }}>Certificaciones</Typography>
            <Button size="small" startIcon={<AddIcon />}
              onClick={() => setF((s) => ({ ...s, certificaciones: [...s.certificaciones, { nombre: '', entidad: '', fechaExpedicion: '', fechaVencimiento: '' }] }))}>
              Agregar
            </Button>
          </Stack>
          {f.certificaciones.map((c, i) => (
            <Box key={i} sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '2fr 1.5fr 1fr 1fr auto' }, alignItems: 'center' }}>
              <TextField label="Certificación" value={c.nombre} onChange={(e) => setCert(i, 'nombre', e.target.value)} placeholder="Primeros auxilios avanzado" />
              <TextField label="Entidad" value={c.entidad} onChange={(e) => setCert(i, 'entidad', e.target.value)} />
              <TextField type="date" label="Expedición" InputLabelProps={{ shrink: true }} value={toInputDate(c.fechaExpedicion)} onChange={(e) => setCert(i, 'fechaExpedicion', e.target.value)} />
              <TextField type="date" label="Vencimiento" InputLabelProps={{ shrink: true }} value={toInputDate(c.fechaVencimiento)} onChange={(e) => setCert(i, 'fechaVencimiento', e.target.value)} />
              <IconButton onClick={() => setF((s) => ({ ...s, certificaciones: s.certificaciones.filter((_, j) => j !== i) }))}><DeleteIcon /></IconButton>
            </Box>
          ))}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)}>Cancelar</Button>
        <Button variant="contained" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Solicitudes de registro propio esperando aprobación. */
function SolicitudesPendientes() {
  const { role, hasRole } = useAuth();
  const puedeAprobar = hasRole('coordinador');
  const [rolSel, setRolSel] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const { data } = useQuery(() => query(collection(db, 'users'), where('estado', '==', 'pendiente'), limit(200)), []);
  const roles = Object.keys(ROLE_LABELS).filter((r) => role === 'admin' || ROLE_RANK[r] <= ROLE_RANK.jefe_brigada);

  if (!data.length) return null;

  const procesar = async (u, aprobar) => {
    if (!aprobar && !window.confirm(`¿Rechazar la solicitud de ${u.nombre}? La cuenta quedará bloqueada.`)) return;
    setBusy(u.id);
    setError('');
    try {
      await aprobarUsuario(u.id, rolSel[u.id] || 'brigadista', aprobar);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card sx={{ mb: 2, borderColor: 'warning.main', borderWidth: 2 }}>
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Solicitudes de registro pendientes ({data.length})</Typography>
        {!puedeAprobar && <Alert severity="info" sx={{ mb: 1 }}>Solo un coordinador o el administrador puede aprobarlas.</Alert>}
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        {data.map((u) => (
          <Stack key={u.id} direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}
            sx={{ py: 1.5, borderTop: 1, borderColor: 'divider' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography fontWeight={600}>{u.nombre}</Typography>
              <Typography variant="body2" color="text.secondary">
                {u.tipoDocumento} {u.documento} · {u.telefono || 'sin teléfono'} · {u.email}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {[u.cargo, u.area].filter(Boolean).join(' · ')}{u.createdAt ? ` · solicitado ${fmtDateTime(u.createdAt)}` : ''}
              </Typography>
            </Box>
            {puedeAprobar && (
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField select label="Rol" value={rolSel[u.id] || 'brigadista'} sx={{ minWidth: 170 }}
                  onChange={(e) => setRolSel((s) => ({ ...s, [u.id]: e.target.value }))}>
                  {roles.map((r) => <MenuItem key={r} value={r}>{ROLE_LABELS[r]}</MenuItem>)}
                </TextField>
                <Button variant="contained" color="success" disabled={busy === u.id} onClick={() => procesar(u, true)}>Aprobar</Button>
                <Button color="error" disabled={busy === u.id} onClick={() => procesar(u, false)}>Rechazar</Button>
              </Stack>
            )}
          </Stack>
        ))}
      </Box>
    </Card>
  );
}

export default function Brigadistas() {
  const { hasRole } = useAuth();
  const { sedes, sedesMap } = useSedes();
  const [sedeId, setSedeId] = useState('');
  const [brigada, setBrigada] = useState('');
  const [estado, setEstado] = useState('activo');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const canEdit = hasRole('coordinador');

  const { data, loading } = useQuery(() => {
    const c = [];
    if (sedeId) c.push(where('sedeId', '==', sedeId));
    if (estado) c.push(where('estado', '==', estado));
    return query(collection(db, 'users'), ...c, limit(1000));
  }, [sedeId, estado]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data
      .filter((u) => !brigada || u.brigadas?.includes(brigada))
      .filter((u) => !term || [u.nombre, u.documento, u.email, u.cargo, u.area].some((v) => v?.toLowerCase().includes(term)))
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  }, [data, brigada, q]);

  return (
    <>
      <PageHeader
        title="Brigadistas"
        subtitle={`${rows.length} registros`}
        actions={
          <>
            <Button variant="outlined" onClick={() => exportarExcel([{ nombre: 'Brigadistas', columnas: COLS_BRIGADISTA, filas: rows.map((u) => filaBrigadista(u, sedesMap)) }], 'brigadistas.xlsx')}>
              Exportar Excel
            </Button>
            {canEdit && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ ...VACIO })}>Nuevo</Button>}
          </>
        }
      />
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField placeholder="Buscar por nombre, documento, correo…" value={q} onChange={(e) => setQ(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }} />
        <TextField select label="Sede" value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
          <MenuItem value="">Todas</MenuItem>
          {sedes.map((s) => <MenuItem key={s.id} value={s.id}>{s.nombre}</MenuItem>)}
        </TextField>
        <TextField select label="Brigada" value={brigada} onChange={(e) => setBrigada(e.target.value)}>
          <MenuItem value="">Todas</MenuItem>
          {BRIGADA_TIPOS.map((b) => <MenuItem key={b.id} value={b.id}>{b.label}</MenuItem>)}
        </TextField>
        <TextField select label="Estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <MenuItem value="">Todos</MenuItem>
          <MenuItem value="activo">Activo</MenuItem>
          <MenuItem value="inactivo">Inactivo</MenuItem>
          <MenuItem value="pendiente">Pendiente de aprobación</MenuItem>
        </TextField>
      </Stack>
      <SolicitudesPendientes />
      <TableContainer component={Card}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Brigadista</TableCell>
              <TableCell>Cargo / Área</TableCell>
              <TableCell>Brigadas</TableCell>
              <TableCell>Sede</TableCell>
              <TableCell>Rol</TableCell>
              <TableCell>Certificaciones</TableCell>
              <TableCell>Estado</TableCell>
              {canEdit && <TableCell />}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((u) => {
              const alert = certAlert(u.certificaciones);
              return (
                <TableRow key={u.id} hover>
                  <TableCell>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Avatar src={u.fotoUrl} sx={{ width: 36, height: 36 }}>{u.nombre?.[0]}</Avatar>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{u.nombre}</Typography>
                        <Typography variant="caption" color="text.secondary">{u.tipoDocumento} {u.documento} · {u.telefono}</Typography>
                      </Box>
                    </Stack>
                  </TableCell>
                  <TableCell>{u.cargo}<Typography variant="caption" display="block" color="text.secondary">{u.area}</Typography></TableCell>
                  <TableCell><BrigadaChips brigadas={u.brigadas} /></TableCell>
                  <TableCell>{sedesMap[u.sedeId]?.nombre || '—'}</TableCell>
                  <TableCell>{ROLE_LABELS[u.role] || '—'}</TableCell>
                  <TableCell>
                    {(u.certificaciones || []).length} registradas
                    {alert && (
                      <Tooltip title={(u.certificaciones || []).map((c) => `${c.nombre}: ${fmtDate(c.fechaVencimiento)}`).join(' · ')}>
                        <Chip size="small" color={alert.color} icon={<WarningIcon />} label={alert.text} sx={{ ml: 1 }} />
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell><Chip size="small" label={u.estado} color={u.estado === 'activo' ? 'success' : u.estado === 'pendiente' ? 'warning' : 'default'} /></TableCell>
                  {canEdit && (
                    <TableCell>
                      {u.estado !== 'pendiente' && <IconButton size="small" onClick={() => setEditing({ ...VACIO, ...u })}><EditIcon /></IconButton>}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {!loading && rows.length === 0 && <TableRow><TableCell colSpan={8}>Sin resultados.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>
      {editing && <BrigadistaForm open initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
