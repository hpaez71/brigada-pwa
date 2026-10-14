import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';

/**
 * Suscripción en tiempo real a una consulta.
 * @param {() => import('firebase/firestore').Query | null} factory
 * @param {any[]} deps
 */
export function useQuery(factory, deps = []) {
  const [state, setState] = useState({ data: [], loading: true, error: null, fromCache: false });

  useEffect(() => {
    const q = factory();
    if (!q) {
      setState({ data: [], loading: false, error: null, fromCache: false });
      return undefined;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      q,
      (snap) =>
        setState({
          data: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
          loading: false,
          error: null,
          fromCache: snap.metadata.fromCache,
        }),
      (error) => {
        console.error(error);
        setState((s) => ({ ...s, loading: false, error }));
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

/** Suscripción en tiempo real a un documento. */
export function useDocument(factory, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    const ref = factory();
    if (!ref) {
      setState({ data: null, loading: false, error: null });
      return undefined;
    }
    return onSnapshot(
      ref,
      (snap) => setState({ data: snap.exists() ? { id: snap.id, ...snap.data() } : null, loading: false, error: null }),
      (error) => setState({ data: null, loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
