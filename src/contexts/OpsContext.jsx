import { createContext, useContext } from 'react';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useQuery } from '../hooks/useFirestore';
import { useAuth } from './AuthContext';

const OpsContext = createContext({ activas: [], apoyos: [] });

/** Estado operativo compartido: emergencias activas y solicitudes de apoyo abiertas. */
export function OpsProvider({ children }) {
  const { user, hasRole } = useAuth();
  const isJefe = hasRole('jefe_brigada');

  const { data: activas } = useQuery(
    () =>
      user
        ? query(collection(db, 'emergencias'), where('estado', '==', 'activa'), orderBy('createdAt', 'desc'), limit(10))
        : null,
    [user?.uid],
  );

  const { data: apoyos } = useQuery(
    () =>
      user && isJefe
        ? query(collection(db, 'alertasApoyo'), where('estado', '==', 'abierta'), orderBy('createdAt', 'desc'), limit(25))
        : null,
    [user?.uid, isJefe],
  );

  return <OpsContext.Provider value={{ activas, apoyos }}>{children}</OpsContext.Provider>;
}

export const useOps = () => useContext(OpsContext);
