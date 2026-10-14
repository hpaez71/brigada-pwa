import { useMemo } from 'react';
import { collection } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useQuery } from './useFirestore';

/** Sedes (pocas decenas): se cargan completas y quedan en caché offline. */
export function useSedes() {
  const { data, loading } = useQuery(() => collection(db, 'sedes'), []);
  const sorted = useMemo(() => [...data].sort((a, b) => a.nombre.localeCompare(b.nombre)), [data]);
  const map = useMemo(() => Object.fromEntries(data.map((s) => [s.id, s])), [data]);
  const puntos = useMemo(
    () =>
      data.flatMap((s) =>
        (s.puntosEncuentro || []).map((p, i) => ({
          id: `${s.id}-pe-${i}`,
          lat: p.lat,
          lng: p.lng,
          label: `Punto de encuentro: ${p.nombre} (${s.nombre})`,
          sedeId: s.id,
        })),
      ),
    [data],
  );
  return { sedes: sorted, sedesMap: map, puntos, loading };
}
