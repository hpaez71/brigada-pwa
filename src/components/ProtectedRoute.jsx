import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_LABELS } from '../config/constants';
import { auth, callable } from '../config/firebase';
import Loading from './Loading';

const REGISTRO_KEY = 'brigadas.registro';

/**
 * Cuenta sin rol:
 *  1) intenta reclamar el rol de administrador inicial (solo el correo configurado);
 *  2) si viene de "Crear cuenta", envía la solicitud de registro;
 *  3) muestra el estado (pendiente de aprobación).
 */
function CuentaPendiente({ user, profile, logout }) {
  const tried = useRef(false);
  const [estado, setEstado] = useState('verificando'); // verificando | listo
  const [error, setError] = useState('');

  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    (async () => {
      try {
        await callable('reclamarAdmin')();
        await auth.currentUser?.getIdTokenResult(true);
        window.location.reload();
        return;
      } catch {
        /* no es el administrador inicial */
      }
      const pendiente = sessionStorage.getItem(REGISTRO_KEY);
      if (pendiente) {
        try {
          await callable('registrarSolicitud')(JSON.parse(pendiente));
          sessionStorage.removeItem(REGISTRO_KEY);
        } catch (e) {
          setError(`No se pudo enviar la solicitud: ${e.message}`);
        }
      }
      setEstado('listo');
    })();
  }, []);

  const solicitado = profile?.estado === 'pendiente';

  return (
    <Box sx={{ maxWidth: 520, mx: 'auto', mt: { xs: 6, sm: 10 }, p: 3 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
        <HourglassTopIcon color="warning" sx={{ fontSize: 36 }} />
        <Typography variant="h5">Cuenta pendiente de aprobación</Typography>
      </Stack>
      {estado === 'verificando' ? (
        <Stack direction="row" spacing={2} alignItems="center" sx={{ my: 3 }}>
          <CircularProgress size={24} />
          <Typography>Verificando…</Typography>
        </Stack>
      ) : (
        <>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Alert severity={solicitado ? 'success' : 'info'} sx={{ mb: 2 }}>
            {solicitado ? (
              <>
                Su solicitud fue enviada, <strong>{profile.nombre}</strong>. Un coordinador debe aprobarla y asignarle
                un rol. Recibirá una notificación; luego vuelva a abrir la app.
              </>
            ) : (
              <>Su cuenta ({user.email}) aún no tiene un rol asignado. Solicite al Administrador General que le asigne uno.</>
            )}
          </Alert>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={() => window.location.reload()}>Ya me aprobaron</Button>
            <Button variant="outlined" onClick={logout}>Cerrar sesión</Button>
          </Stack>
        </>
      )}
    </Box>
  );
}

export default function ProtectedRoute({ children, minRole }) {
  const { user, role, profile, loading, hasRole, logout } = useAuth();
  const location = useLocation();

  if (loading) return <Loading full />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!role) return <CuentaPendiente user={user} profile={profile} logout={logout} />;

  if (minRole && !hasRole(minRole)) {
    return (
      <Alert severity="warning" sx={{ m: 2 }}>
        Esta sección requiere el rol «{ROLE_LABELS[minRole]}» o superior.
      </Alert>
    );
  }
  return children;
}
