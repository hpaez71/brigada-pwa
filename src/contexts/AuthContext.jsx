import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { ROLE_RANK } from '../config/constants';
import { logAcceso, logAudit } from '../services/audit';

const AuthContext = createContext(null);
const ROLE_CACHE_KEY = 'brigadas.role';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const tokenIssuedAt = useRef(0);

  useEffect(() => {
    let unsubProfile = null;

    const unsub = onAuthStateChanged(auth, async (u) => {
      unsubProfile?.();
      unsubProfile = null;
      if (!u) {
        setUser(null);
        setRole(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      setUser(u);

      // El rol viene de los custom claims (fuente de verdad para las reglas).
      // Offline: si el token no se puede refrescar se usa el rol en caché.
      try {
        const tr = await u.getIdTokenResult();
        tokenIssuedAt.current = Date.parse(tr.issuedAtTime);
        const r = tr.claims.role || null;
        setRole(r);
        localStorage.setItem(ROLE_CACHE_KEY, r || '');
      } catch {
        setRole(localStorage.getItem(ROLE_CACHE_KEY) || null);
      }

      unsubProfile = onSnapshot(
        doc(db, 'users', u.uid),
        async (snap) => {
          const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;
          setProfile(data);
          // Si una Cloud Function cambió el rol, refrescamos el token.
          const changed = data?.claimsUpdatedAt?.toMillis?.();
          if (changed && changed > tokenIssuedAt.current) {
            try {
              const tr = await u.getIdTokenResult(true);
              tokenIssuedAt.current = Date.parse(tr.issuedAtTime);
              setRole(tr.claims.role || null);
              localStorage.setItem(ROLE_CACHE_KEY, tr.claims.role || '');
            } catch {
              /* offline */
            }
          }
          setLoading(false);
        },
        () => setLoading(false),
      );
    });

    return () => {
      unsub();
      unsubProfile?.();
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    logAcceso('login', cred.user);
    return cred.user;
  }, []);

  const logout = useCallback(async () => {
    if (auth.currentUser) {
      await logAcceso('logout', auth.currentUser).catch(() => {});
      await logAudit('sesion.cerrar', {}).catch(() => {});
    }
    localStorage.removeItem(ROLE_CACHE_KEY);
    await signOut(auth);
  }, []);

  const resetPassword = useCallback((email) => sendPasswordResetEmail(auth, email.trim()), []);

  const hasRole = useCallback((minRole) => (ROLE_RANK[role] || 0) >= (ROLE_RANK[minRole] || 0), [role]);

  const value = { user, role, profile, loading, login, logout, resetPassword, hasRole };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
