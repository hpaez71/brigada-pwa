import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Marker, Tooltip, Popup, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { DEFAULT_CENTER } from '../utils/geo';

// Íconos HTML (divIcon): no dependen de imágenes, funcionan offline.
const pinIcon = (color, emoji) =>
  L.divIcon({
    className: '',
    html: `<div style="background:${color};color:#fff;width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:grid;place-items:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)"><span style="transform:rotate(45deg);font-size:15px">${emoji}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  });

export const ICON_PUNTO = pinIcon('#2E7D32', '⚑');
export const ICON_EMERGENCIA = pinIcon('#B71C1C', '!');
export const ICON_SEDE = pinIcon('#263238', '■');

function ClickHandler({ onClick }) {
  useMapEvents({ click: (e) => onClick?.({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function FitBounds({ points }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || points.length === 0) return;
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 16);
    else map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 17 });
    done.current = true;
  }, [points, map]);
  return null;
}

function Recenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView([center.lat, center.lng], Math.max(map.getZoom(), 15));
  }, [center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/**
 * @param markers [{id, lat, lng, color, label, popup, radius, accuracy}]
 * @param pins    [{id, lat, lng, icon, label, popup}]
 */
export default function MapView({ markers = [], pins = [], center, height = 360, onClick, fit = true, recenter }) {
  const all = useMemo(
    () => [...markers, ...pins].filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
    [markers, pins],
  );
  const start = center || all[0] || DEFAULT_CENTER;

  return (
    <MapContainer center={[start.lat, start.lng]} zoom={15} style={{ height }} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      {fit && !center && <FitBounds points={all} />}
      {recenter && <Recenter center={recenter} />}
      {onClick && <ClickHandler onClick={onClick} />}
      {pins.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={p.icon || ICON_PUNTO}>
          {p.label && <Tooltip direction="top" offset={[0, -28]}>{p.label}</Tooltip>}
          {p.popup && <Popup>{p.popup}</Popup>}
        </Marker>
      ))}
      {markers.map((m) => (
        <CircleMarker
          key={m.id}
          center={[m.lat, m.lng]}
          radius={m.radius || 9}
          pathOptions={{ color: '#fff', weight: 2, fillColor: m.color || '#1565C0', fillOpacity: 0.95 }}
        >
          {m.label && <Tooltip>{m.label}</Tooltip>}
          {m.popup && <Popup>{m.popup}</Popup>}
        </CircleMarker>
      ))}
      {markers
        .filter((m) => m.accuracy && m.accuracy < 300)
        .map((m) => (
          <Circle
            key={`acc-${m.id}`}
            center={[m.lat, m.lng]}
            radius={m.accuracy}
            pathOptions={{ color: m.color || '#1565C0', weight: 1, fillOpacity: 0.08 }}
          />
        ))}
    </MapContainer>
  );
}
