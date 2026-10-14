export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v === 'number' || typeof v === 'string') return new Date(v);
  if (v.seconds != null) return new Date(v.seconds * 1000);
  return null;
}

const dtf = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
const df = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' });
const tf = new Intl.DateTimeFormat('es-CO', { timeStyle: 'medium' });

export const fmtDateTime = (v) => (toDate(v) ? dtf.format(toDate(v)) : '—');
export const fmtDate = (v) => (toDate(v) ? df.format(toDate(v)) : '—');
export const fmtTime = (v) => (toDate(v) ? tf.format(toDate(v)) : '—');

export function fmtDuration(sec) {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min ${r} s`;
  return `${r} s`;
}

export function timeAgo(v) {
  const d = toDate(v);
  if (!d) return '—';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `hace ${Math.max(s, 0)} s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return fmtDate(d);
}

/** yyyy-mm-dd para inputs type="date" */
export const toInputDate = (v) => {
  const d = toDate(v);
  if (!d) return '';
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
};

export const toInputDateTime = (v) => {
  const d = toDate(v);
  if (!d) return '';
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
};

export const daysUntil = (v) => {
  const d = toDate(v);
  return d ? Math.ceil((d.getTime() - Date.now()) / 86400000) : null;
};
