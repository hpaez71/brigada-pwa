import { useState } from 'react';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import { MenuItem, TextField } from '@mui/material';
import { db } from '../config/firebase';
import { useQuery } from '../hooks/useFirestore';
import { EMERGENCIA_TIPOS, labelOf } from '../config/constants';
import { fmtDateTime } from '../utils/format';
import EvidenceManager from '../components/EvidenceManager';
import PageHeader from '../components/PageHeader';

export default function Evidencias() {
  const [emergenciaId, setEmergenciaId] = useState('');
  const { data: emergencias } = useQuery(() => query(collection(db, 'emergencias'), orderBy('createdAt', 'desc'), limit(50)), []);

  return (
    <>
      <PageHeader title="Evidencias de incidentes" subtitle="Fotografías, videos, documentos, observaciones y actas de atención con huella SHA-256" />
      <TextField select label="Emergencia / simulacro" value={emergenciaId} onChange={(e) => setEmergenciaId(e.target.value)} sx={{ mb: 2, maxWidth: 520 }}>
        <MenuItem value="">Todas las evidencias recientes</MenuItem>
        {emergencias.map((e) => (
          <MenuItem key={e.id} value={e.id}>
            {fmtDateTime(e.createdAt)} · {labelOf(EMERGENCIA_TIPOS, e.tipo)} · {e.sedeNombre || ''}
          </MenuItem>
        ))}
      </TextField>
      <EvidenceManager key={emergenciaId || 'all'} emergenciaId={emergenciaId || undefined} />
    </>
  );
}
