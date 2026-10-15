import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_LABELS } from '../config/constants';
import { auth, callable } from '../config/firebase';
import Loading from './Loading';

/** Cuenta sin rol: intenta una sola vez reclamar el rol de administrador inicial. */
function CuentaPendiente({ user, logout }) {
  const tried = useRef(false);
  const [estado, setEstado] = useState('verificando'); // verificando | pendiente

  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    callable('reclamarAdmin')()
      .then(() => auth.currentUser?.getIdTokenResult(true))
      .then(() => window.location.reload())
      .catch(() => setEstado('pendiente'));
  }, []);

  return (
    <Box sx={{ maxWidth: 520, mx: 'auto', mt: 10, p: 3 }}>
      <Typography variant="h5" gutterBottom>Cuenta pendiente de activación</Typography>
      {estado === 'verificando' ? (
        <Stack direction="row" spacing={2} alignItems="center" sx={{ my: 3 }}>
          <CircularProgress size={24} />
          <Typography>Verificando permisos…</Typography>
        </Stack>
      ) : (
        <Alert severity="info" sx={{ mb: 2 }}>
          Su cuenta ({user.email}) aún no tiene un rol asignado. Solicite al Administrador General que le asigne uno.
        </Alert>
      )}
      <Button variant="outlined" onClick={logout}>Cerrar sesión</Button>
    </Box>
  );
}

export default function ProtectedRoute({ children, minRole }) {
  const { user, role, loading, hasRole, logout } = useAuth();
  const location = useLocation();

  if (loading) return <Loading full />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!role) return <CuentaPendiente user={user} logout={logout} />;

  if (minRole && !hasRole(minRole)) {
    return (
      <Alert severity="warning" sx={{ m: 2 }}>
        Esta sección requiere el rol «{ROLE_LABELS[minRole]}» o superior.
      </Alert>
    );
  }
  return children;
}
