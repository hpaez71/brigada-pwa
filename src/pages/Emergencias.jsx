import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import {
  Box, Button, Card, CardActionArea, CardContent, MenuItem, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useOps } from '../contexts/OpsContext';
import { useQuery } from '../hooks/useFirestore';
import { useSedes } from '../hooks/useSedes';
import { EMERGENCIA_TIPOS } from '../config/constants';
import { fmtDateTime, fmtDuration, toDate } from '../utils/format';
import { NivelChip, TipoChip } from '../components/Chips';
import PageHeader from '../components/PageHeader';
import ActivationDialog from '../components/ActivationDialog';

function EmergenciaCard({ e, sedesMap }) {
  const dur = e.closedAt ? (toDate(e.closedAt) - toDate(e.createdAt)) / 1000 : null;
  return (
    <Card sx={{ borderLeft: 6, borderLeftColor: e.estado === 'activa' ? 'primary.main' : 'divider' }}>
      <CardActionArea component={RouterLink} to={`/emergencias/${e.id}`}>
        <CardContent>
          <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', gap: 1 }}>
            <TipoChip tipo={e.tipo} />
            <NivelChip nivel={e.nivel} />
            <Typography variant="caption" sx={{ ml: 'auto !important', fontWeight: 700, color: e.estado === 'activa' ? 'primary.main' : 'text.secondary' }}>
              {e.estado === 'activa' ? '● ACTIVA' : 'Cerrada'}
            </Typography>
          </Stack>
          <Typography variant="subtitle1" fontWeight={600}>
            {sedesMap[e.sedeId]?.nombre || e.sedeNombre || 'Todas las sedes'}
          </Typography>
          {e.descripcion && <Typography variant="body2" color="text.secondary" noWrap>{e.descripcion}</Typography>}
          <Typography variant="caption" color="text.secondary">
            {fmtDateTime(e.createdAt)} · {e.activadaPor?.nombre} · {e.totalRespuestas || 0} respuestas
            {dur != null && ` · duración ${fmtDuration(dur)}`}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export default function Emergencias() {
  const { hasRole } = useAuth();
  const { activas } = useOps();
  const { sedesMap } = useSedes();
  const [tab, setTab] = useState(activas.length ? 0 : 1);
  const [max, setMax] = useState(30);
  const [tipo, setTipo] = useState('');
  const [open, setOpen] = useState(false);

  const { data: historial, loading } = useQuery(
    () => (tab === 1 ? query(collection(db, 'emergencias'), orderBy('createdAt', 'desc'), limit(max)) : null),
    [tab, max],
  );
  const list = (tab === 0 ? activas : historial).filter((e) => !tipo || e.tipo === tipo);

  return (
    <>
      <PageHeader
        title="Emergencias"
        subtitle="Activaciones, simulacros e historial"
        actions={
          hasRole('jefe_brigada') && (
            <Button variant="contained" size="large" onClick={() => setOpen(true)} sx={{ fontWeight: 800 }} className="pulse">
              ACTIVAR EMERGENCIA
            </Button>
          )
        }
      />
      <ActivationDialog open={open} onClose={() => setOpen(false)} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }} alignItems={{ sm: 'center' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ flex: 1 }}>
          <Tab label={`Activas (${activas.length})`} />
          <Tab label="Historial" />
        </Tabs>
        <TextField select label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} sx={{ maxWidth: 240 }}>
          <MenuItem value="">Todos</MenuItem>
          {EMERGENCIA_TIPOS.map((t) => <MenuItem key={t.id} value={t.id}>{t.label}</MenuItem>)}
        </TextField>
      </Stack>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: '1fr 1fr 1fr' } }}>
        {list.map((e) => <EmergenciaCard key={e.id} e={e} sedesMap={sedesMap} />)}
      </Box>
      {!loading && list.length === 0 && (
        <Typography color="text.secondary" sx={{ mt: 2 }}>{tab === 0 ? 'No hay emergencias activas.' : 'Sin registros.'}</Typography>
      )}
      {tab === 1 && historial.length >= max && (
        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Button onClick={() => setMax((m) => m + 30)}>Cargar más</Button>
        </Box>
      )}
    </>
  );
}
