import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';
import { haversine } from '../utils/geo';

const LocationContext = createContext(null);
const KEY = 'brigadas.shareLocation';
const MIN_INTERVAL_MS = 20_000; // máximo una escritura cada 20 s
const MIN_DISTANCE_M = 20; // o si se movió más de 20 m

/**
 * Geolocalización del brigadista: watchPosition + escritura acotada en
 * ubicaciones/{uid}. Las escrituras offline quedan en la cola de Firestore.
 */
export function LocationProvider({ children }) {
  const { user, profile } = useAuth();
  const [sharing, setSharingState] = useState(() => localStorage.getItem(KEY) === '1');
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const last = useRef({ at: 0, lat: null, lng: null });

  const persist = useCallback(
    (pos, force = false) => {
      if (!user) return;
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      const now = Date.now();
      const moved = last.current.lat == null ? Infinity : haversine(last.current, { lat, lng });
      if (!force && now - last.current.at < MIN_INTERVAL_MS && moved < MIN_DISTANCE_M) return;
      last.current = { at: now, lat, lng };
      setDoc(
        doc(db, 'ubicaciones', user.uid),
        {
          uid: user.uid,
          nombre: profile?.nombre || user.email,
          sedeId: profile?.sedeId || null,
          brigadas: profile?.brigadas || [],
          lat,
          lng,
          accuracy: Math.round(accuracy || 0),
          activa: true,
          clientAt: now,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ).catch((e) => console.warn('ubicación', e));
    },
    [user, profile?.nombre, profile?.sedeId, profile?.brigadas],
  );

  useEffect(() => {
    if (!sharing || !user || !('geolocation' in navigator)) return undefined;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setError(null);
        persist(pos);
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [sharing, user, persist]);

  const setSharing = useCallback(
    (value) => {
      localStorage.setItem(KEY, value ? '1' : '0');
      setSharingState(value);
      if (!value && user) {
        setDoc(doc(db, 'ubicaciones', user.uid), { activa: false, updatedAt: serverTimestamp() }, { merge: true }).catch(
          () => {},
        );
      }
    },
    [user],
  );

  /** Obtiene una posición puntual (botón de pánico, respuesta, activación). */
  const getCurrent = useCallback(
    () =>
      new Promise((resolve) => {
        if (!('geolocation' in navigator)) return resolve(position);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
            setPosition(p);
            if (sharing) persist(pos, true);
            resolve(p);
          },
          () => resolve(position),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
        );
      }),
    [position, sharing, persist],
  );

  return (
    <LocationContext.Provider value={{ sharing, setSharing, position, error, getCurrent }}>
      {children}
    </LocationContext.Provider>
  );
}

export const useGeo = () => useContext(LocationContext);
