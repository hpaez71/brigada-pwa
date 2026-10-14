const TIPOS = {
  evacuacion_general: 'Evacuación general',
  incendio: 'Incendio',
  sismo: 'Sismo',
  derrame_quimico: 'Derrame químico',
  amenaza_seguridad: 'Amenaza de seguridad',
  emergencia_medica: 'Emergencia médica',
  simulacro: 'Simulacro',
};
const NIVELES = { bajo: 'Bajo', medio: 'Medio', alto: 'Alto', critico: 'Crítico' };
const ROLES = ['admin', 'coordinador', 'jefe_brigada', 'brigadista'];
const RANK = { brigadista: 1, jefe_brigada: 2, coordinador: 3, admin: 4 };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function emailEmergencia(e, link, org) {
  const color = { bajo: '#2E7D32', medio: '#F9A825', alto: '#EF6C00', critico: '#B71C1C' }[e.nivel] || '#B71C1C';
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:20px">
  <table width="100%" style="max-width:560px;margin:auto;background:#fff;border-radius:10px;overflow:hidden">
    <tr><td style="background:${color};color:#fff;padding:20px">
      <div style="font-size:12px;letter-spacing:2px">${e.esSimulacro ? 'SIMULACRO' : 'ALERTA DE EMERGENCIA'}</div>
      <div style="font-size:24px;font-weight:bold">${esc(TIPOS[e.tipo] || e.tipo)}</div>
      <div>Nivel ${esc(NIVELES[e.nivel] || e.nivel)} · ${esc(e.sedeNombre || 'Todas las sedes')}</div>
    </td></tr>
    <tr><td style="padding:20px;color:#222">
      <p>${esc(e.descripcion || 'Diríjase a su punto de reunión y reporte su estado en la aplicación.')}</p>
      <p style="color:#666;font-size:13px">Activada por ${esc(e.activadaPor?.nombre)}</p>
      <p><a href="${esc(link)}" style="display:inline-block;background:#B71C1C;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">RESPONDER EN LA APP</a></p>
    </td></tr>
    <tr><td style="padding:12px 20px;color:#999;font-size:11px">${esc(org)} · Mensaje automático de la plataforma de brigadas</td></tr>
  </table></body></html>`;
}

module.exports = { TIPOS, NIVELES, ROLES, RANK, esc, emailEmergencia };
