import { useState } from 'react';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import {
  Card, InputAdornment, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Button, Stack,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { db } from '../config/firebase';
import { useQuery } from '../hooks/useFirestore';
import { fmtDateTime } from '../utils/format';
import { exportarExcel } from '../services/reports';
import PageHeader from '../components/PageHeader';

const FUENTES = [
  { col: 'auditoria', label: 'Registro de auditoría' },
  { col: 'accesos', label: 'Historial de accesos' },
  { col: 'notificacionesLog', label: 'Envíos de notificaciones' },
];

const resumen = (r, col) => {
  if (col === 'auditoria') return JSON.stringify(r.detalle || {}).slice(0, 160);
  if (col === 'accesos') return `${r.standalone ? 'App instalada' : 'Navegador'} · ${r.userAgent?.slice(0, 90)}`;
  return `${r.canal}: ${r.status} ${r.count != null ? `(${r.count})` : ''} ${r.error || ''}`;
};

export default function Auditoria() {
  const [tab, setTab] = useState(0);
  const [max, setMax] = useState(200);
  const [q, setQ] = useState('');
  const { col } = FUENTES[tab];
  const { data } = useQuery(() => query(collection(db, col), orderBy('createdAt', 'desc'), limit(max)), [col, max]);
  const term = q.toLowerCase();
  const rows = data.filter((r) => !term || JSON.stringify(r).toLowerCase().includes(term));

  return (
    <>
      <PageHeader title="Auditoría" subtitle="Registros inmutables: no pueden editarse ni eliminarse"
        actions={
          <Button variant="outlined" onClick={() => exportarExcel([{
            nombre: FUENTES[tab].label,
            columnas: [
              { header: 'Fecha', key: 'fecha', width: 22 }, { header: 'Usuario', key: 'email', width: 30 },
              { header: 'Acción', key: 'accion', width: 26 }, { header: 'Detalle', key: 'detalle', width: 80 },
            ],
            filas: rows.map((r) => ({ fecha: fmtDateTime(r.createdAt), email: r.email || r.uid, accion: r.accion || r.tipo || r.canal, detalle: resumen(r, col) })),
          }], `${col}.xlsx`)}>Exportar</Button>
        } />
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{ flex: 1 }}>
          {FUENTES.map((f) => <Tab key={f.col} label={f.label} />)}
        </Tabs>
        <TextField placeholder="Filtrar…" value={q} onChange={(e) => setQ(e.target.value)} sx={{ maxWidth: 300 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }} />
      </Stack>
      <TableContainer component={Card}>
        <Table size="small">
          <TableHead>
            <TableRow><TableCell>Fecha</TableCell><TableCell>Usuario</TableCell><TableCell>Acción</TableCell><TableCell>Detalle</TableCell></TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.createdAt)}</TableCell>
                <TableCell>{r.email || r.uid || 'sistema'}</TableCell>
                <TableCell>{r.accion || r.tipo || r.canal}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{resumen(r, col)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {data.length >= max && <Button sx={{ mt: 2 }} onClick={() => setMax((m) => m + 200)}>Cargar más</Button>}
    </>
  );
}
