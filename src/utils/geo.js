const R = 6371e3;
const toRad = (d) => (d * Math.PI) / 180;

/** Distancia en metros entre dos puntos {lat, lng}. */
export function haversine(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return Infinity;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m) {
  if (!Number.isFinite(m)) return '—';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/** Ordena elementos con {lat,lng} por cercanía a un punto. */
export function nearest(items, point, n = 10) {
  return items
    .filter((i) => i.lat != null && i.lng != null)
    .map((i) => ({ ...i, distancia: haversine(point, i) }))
    .sort((a, b) => a.distancia - b.distancia)
    .slice(0, n);
}

export const mapsLink = (p) => (p ? `https://www.google.com/maps?q=${p.lat},${p.lng}` : '');

export const DEFAULT_CENTER = { lat: 4.711, lng: -74.0721 }; // Bogotá
