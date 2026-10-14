import { Chip } from '@mui/material';
import { NIVELES, ESTADOS_RESPUESTA, EMERGENCIA_TIPOS, BRIGADA_TIPOS, byId } from '../config/constants';
import EmergencyIcon from './EmergencyIcon';

const solid = (color) => ({ bgcolor: color, color: '#fff', fontWeight: 600, '& .MuiChip-icon': { color: '#fff' } });

export function NivelChip({ nivel, size = 'small' }) {
  const n = byId(NIVELES, nivel);
  return <Chip size={size} label={n?.label || nivel} sx={solid(n?.color || '#757575')} />;
}

export function EstadoRespuestaChip({ estado, size = 'small' }) {
  const e = byId(ESTADOS_RESPUESTA, estado);
  if (!e) return <Chip size={size} label="Sin respuesta" variant="outlined" />;
  return <Chip size={size} label={e.label} sx={solid(e.color)} />;
}

export function TipoChip({ tipo, size = 'small' }) {
  const t = byId(EMERGENCIA_TIPOS, tipo);
  return (
    <Chip size={size} icon={<EmergencyIcon tipo={tipo} />} label={t?.label || tipo} sx={solid(t?.color || '#757575')} />
  );
}

export function BrigadaChips({ brigadas = [] }) {
  return brigadas.map((b) => {
    const t = byId(BRIGADA_TIPOS, b);
    return (
      <Chip
        key={b}
        size="small"
        label={t?.label || b}
        variant="outlined"
        sx={{ mr: 0.5, mb: 0.5, borderColor: t?.color, color: t?.color }}
      />
    );
  });
}
