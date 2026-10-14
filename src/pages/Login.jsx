import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Link, Stack, TextField, Typography } from '@mui/material';
import ShieldIcon from '@mui/icons-material/HealthAndSafety';
import { useAuth } from '../contexts/AuthContext';
import { ORG_NAME } from '../config/constants';

const ERRORES = {
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/user-disabled': 'La cuenta está deshabilitada. Contacte al administrador.',
  'auth/too-many-requests': 'Demasiados intentos. Espere unos minutos o restablezca la contraseña.',
  'auth/network-request-failed': 'Sin conexión. Para el primer inicio de sesión se requiere Internet.',
};

export default function Login() {
  const { user, login, resetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from?.pathname || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(ERRORES[err.code] || 'No fue posible iniciar sesión.');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!email) return setError('Escriba su correo para enviarle el enlace.');
    try {
      await resetPassword(email);
    } catch {
      /* no revelar si el correo existe */
    }
    setInfo('Si el correo está registrado, recibirá un enlace para restablecer la contraseña.');
    return null;
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2, background: 'linear-gradient(160deg,#B71C1C 0%,#263238 70%)' }}>
      <Card sx={{ width: '100%', maxWidth: 420 }} variant="elevation" elevation={8}>
        <CardContent sx={{ p: 4 }}>
          <Stack alignItems="center" spacing={1} sx={{ mb: 3 }}>
            <ShieldIcon color="primary" sx={{ fontSize: 56 }} />
            <Typography variant="h5">Brigadas de Emergencia</Typography>
            <Typography variant="body2" color="text.secondary">{ORG_NAME}</Typography>
          </Stack>
          <form onSubmit={submit}>
            <Stack spacing={2}>
              {error && <Alert severity="error">{error}</Alert>}
              {info && <Alert severity="info">{info}</Alert>}
              <TextField label="Correo electrónico" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required size="medium" />
              <TextField label="Contraseña" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required size="medium" />
              <Button type="submit" variant="contained" size="large" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</Button>
              <Link component="button" type="button" variant="body2" onClick={reset} sx={{ alignSelf: 'center' }}>
                ¿Olvidó su contraseña?
              </Link>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
