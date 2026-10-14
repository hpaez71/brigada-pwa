export const ROLES = {
  ADMIN: 'admin',
  COORDINADOR: 'coordinador',
  JEFE: 'jefe_brigada',
  BRIGADISTA: 'brigadista',
};

export const ROLE_LABELS = {
  admin: 'Administrador General',
  coordinador: 'Coordinador de Emergencias',
  jefe_brigada: 'Jefe de Brigada',
  brigadista: 'Brigadista',
};

// Jerarquía: un rol superior hereda los permisos de los inferiores.
export const ROLE_RANK = { brigadista: 1, jefe_brigada: 2, coordinador: 3, admin: 4 };

export const BRIGADA_TIPOS = [
  { id: 'primeros_auxilios', label: 'Primeros auxilios', color: '#2E7D32' },
  { id: 'evacuacion', label: 'Evacuación', color: '#1565C0' },
  { id: 'contra_incendios', label: 'Contra incendios', color: '#C62828' },
  { id: 'rescate', label: 'Rescate', color: '#EF6C00' },
];

export const EMERGENCIA_TIPOS = [
  { id: 'evacuacion_general', label: 'Evacuación general', color: '#1565C0' },
  { id: 'incendio', label: 'Incendio', color: '#C62828' },
  { id: 'sismo', label: 'Sismo', color: '#6D4C41' },
  { id: 'derrame_quimico', label: 'Derrame químico', color: '#7B1FA2' },
  { id: 'amenaza_seguridad', label: 'Amenaza de seguridad', color: '#37474F' },
  { id: 'emergencia_medica', label: 'Emergencia médica', color: '#00838F' },
  { id: 'simulacro', label: 'Simulacro', color: '#558B2F' },
];

export const NIVELES = [
  { id: 'bajo', label: 'Bajo', color: '#2E7D32' },
  { id: 'medio', label: 'Medio', color: '#F9A825' },
  { id: 'alto', label: 'Alto', color: '#EF6C00' },
  { id: 'critico', label: 'Crítico', color: '#B71C1C' },
];

export const ESTADOS_RESPUESTA = [
  { id: 'recibido', label: 'Recibido', color: '#546E7A' },
  { id: 'en_desplazamiento', label: 'En desplazamiento', color: '#1565C0' },
  { id: 'en_punto', label: 'En el punto de emergencia', color: '#6A1B9A' },
  { id: 'zona_evacuada', label: 'Zona evacuada', color: '#00838F' },
  { id: 'controlado', label: 'Incidente controlado', color: '#2E7D32' },
  { id: 'necesito_apoyo', label: 'Necesito apoyo', color: '#B71C1C' },
];

export const SEDE_TIPOS = [
  { id: 'sede', label: 'Sede' },
  { id: 'edificio', label: 'Edificio' },
  { id: 'planta', label: 'Planta' },
  { id: 'campus', label: 'Campus' },
];

export const EVIDENCIA_TIPOS = [
  { id: 'foto', label: 'Fotografía', accept: 'image/*' },
  { id: 'video', label: 'Video', accept: 'video/*' },
  { id: 'documento', label: 'Documento', accept: '.pdf,.doc,.docx,.xls,.xlsx,.txt' },
  { id: 'observacion', label: 'Observación' },
  { id: 'acta', label: 'Acta de atención' },
];

export const TODAS_LAS_SEDES = 'todas';

export const byId = (list, id) => list.find((x) => x.id === id);
export const labelOf = (list, id) => byId(list, id)?.label ?? id ?? '—';
export const colorOf = (list, id) => byId(list, id)?.color ?? '#757575';

export const ORG_NAME = import.meta.env.VITE_ORG_NAME || 'Organización';
export const EMERGENCY_PHONE = import.meta.env.VITE_EMERGENCY_PHONE || '123';
export const COORDINATOR_PHONE = import.meta.env.VITE_COORDINATOR_PHONE || '';
