import { Navigate, useLocation } from 'react-router-dom';
import { Alert, Box, Button, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_LABELS } from '../config/constants';
import Loading from './Loading';

export default function ProtectedRoute({ children, minRole }) {
  const { user, role, loading, hasRole, logout } = useAuth();
  const location = useLocation();

  if (loading) return <Loading full />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  if (!role) {
    return (
      <Box sx={{ maxWidth: 520, mx: 'auto', mt: 10, p: 3 }}>
        <Typography variant="h5" gutterBottom>Cuenta pendiente de activación</Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          Su cuenta ({user.email}) aún no tiene un rol asignado. Solicite al Administrador General que le asigne uno.
        </Alert>
        <Button variant="outlined" onClick={logout}>Cerrar sesión</Button>
      </Box>
    );
  }

  if (minRole && !hasRole(minRole)) {
    return (
      <Alert severity="warning" sx={{ m: 2 }}>
        Esta sección requiere el rol «{ROLE_LABELS[minRole]}» o superior.
      </Alert>
    );
  }
  return children;
}
