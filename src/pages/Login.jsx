import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Link, MenuItem, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import ShieldIcon from '@mui/icons-material/HealthAndSafety';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { ORG_NAME } from '../config/constants';

export const REGISTRO_KEY = 'brigadas.registro';

const ERRORES = {
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/user-disabled': 'La cuenta está deshabilitada o la solicitud fue rechazada. Contacte al coordinador.',
  'auth/too-many-requests': 'Demasiados intentos. Espere unos minutos o restablezca la contraseña.',
  'auth/network-request-failed': 'Sin conexión. Para ingresar o registrarse se requiere Internet.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Use "Ingresar" o "¿Olvidó su contraseña?".',
  'auth/invalid-email': 'El correo no es válido.',
  'auth/weak-password': 'La contraseña es muy débil.',
  'auth/password-does-not-meet-requirements': 'La contraseña no cumple la política: mínimo 10 caracteres.',
};

const REG_VACIO = { nombre: '', tipoDocumento: 'CC', documento: '', telefono: '', cargo: '', area: '', password2: '' };

export default function Login() {
  const { user, login, resetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [modo, setModo] = useState('ingresar'); // ingresar | registro
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reg, setReg] = useState(REG_VACIO);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from?.pathname || '/'} replace />;

  const r = (k) => (e) => setReg((s) => ({ ...s, [k]: e.target.value }));

  const ingresar = async (e) => {
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

  const registrar = async (e) => {
    e.preventDefault();
    setError('');
    if (!reg.nombre.trim()) return setError('Escriba su nombre completo.');
    if (!reg.documento.trim()) return setError('Escriba su número de documento.');
    if (password.length < 10) return setError('La contraseña debe tener al menos 10 caracteres.');
    if (password !== reg.password2) return setError('Las contraseñas no coinciden.');
    setBusy(true);
    // Se guarda antes de crear la cuenta: la pantalla de "cuenta pendiente"
    // envía la solicitud en cuanto la sesión queda iniciada.
    const { password2, ...datos } = reg;
    sessionStorage.setItem(REGISTRO_KEY, JSON.stringify(datos));
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      sessionStorage.removeItem(REGISTRO_KEY);
      setError(ERRORES[err.code] || `No fue posible crear la cuenta (${err.code || err.message}).`);
      setBusy(false);
    }
    return null;
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
      <Card sx={{ width: '100%', maxWidth: 440 }} variant="elevation" elevation={8}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Stack alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <ShieldIcon color="primary" sx={{ fontSize: 56 }} />
            <Typography variant="h5" textAlign="center">Brigadas de Emergencia</Typography>
            <Typography variant="body2" color="text.secondary">{ORG_NAME}</Typography>
          </Stack>

          <Tabs value={modo} onChange={(_, v) => { setModo(v); setError(''); setInfo(''); }} variant="fullWidth" sx={{ mb: 2 }}>
            <Tab value="ingresar" label="Ingresar" />
            <Tab value="registro" label="Crear cuenta" />
          </Tabs>

          {modo === 'ingresar' ? (
            <form onSubmit={ingresar}>
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
          ) : (
            <form onSubmit={registrar}>
              <Stack spacing={2}>
                <Alert severity="info" icon={false}>
                  Su cuenta quedará <strong>pendiente</strong> hasta que un coordinador la apruebe y le asigne un rol.
                </Alert>
                {error && <Alert severity="error">{error}</Alert>}
                <TextField label="Nombre completo" value={reg.nombre} onChange={r('nombre')} required autoComplete="name" />
                <Stack direction="row" spacing={1}>
                  <TextField select label="Tipo" value={reg.tipoDocumento} onChange={r('tipoDocumento')} sx={{ width: 100 }}>
                    {['CC', 'CE', 'TI', 'PA', 'PPT'].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                  </TextField>
                  <TextField label="Documento" value={reg.documento} onChange={r('documento')} required inputMode="numeric" />
                </Stack>
                <TextField label="Celular (ej. 3001234567)" value={reg.telefono} onChange={r('telefono')} type="tel" autoComplete="tel" />
                <Stack direction="row" spacing={1}>
                  <TextField label="Cargo" value={reg.cargo} onChange={r('cargo')} />
                  <TextField label="Área" value={reg.area} onChange={r('area')} />
                </Stack>
                <TextField label="Correo electrónico" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <TextField label="Contraseña (mínimo 10 caracteres)" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <TextField label="Confirmar contraseña" type="password" autoComplete="new-password" value={reg.password2} onChange={r('password2')} required />
                <Button type="submit" variant="contained" size="large" disabled={busy}>{busy ? 'Creando cuenta…' : 'Crear cuenta'}</Button>
              </Stack>
            </form>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
