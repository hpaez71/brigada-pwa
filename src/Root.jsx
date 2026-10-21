import { lazy, Suspense, useMemo } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline, useMediaQuery } from '@mui/material';
import { makeTheme } from './theme';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Loading from './components/Loading';
import ErrorBoundary from './components/ErrorBoundary';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Emergencias = lazy(() => import('./pages/Emergencias'));
const EmergenciaDetalle = lazy(() => import('./pages/EmergenciaDetalle'));
const Mapa = lazy(() => import('./pages/Mapa'));
const Brigadistas = lazy(() => import('./pages/Brigadistas'));
const Sedes = lazy(() => import('./pages/Sedes'));
const Simulacros = lazy(() => import('./pages/Simulacros'));
const Evidencias = lazy(() => import('./pages/Evidencias'));
const Chat = lazy(() => import('./pages/Chat'));
const Reportes = lazy(() => import('./pages/Reportes'));
const Auditoria = lazy(() => import('./pages/Auditoria'));
const Perfil = lazy(() => import('./pages/Perfil'));

export default function Root() {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = useMemo(() => makeTheme(prefersDark ? 'dark' : 'light'), [prefersDark]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <ErrorBoundary full>
        <Suspense fallback={<Loading full />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="emergencias" element={<Emergencias />} />
              <Route path="emergencias/:id" element={<EmergenciaDetalle />} />
              <Route path="mapa" element={<ProtectedRoute minRole="jefe_brigada"><Mapa /></ProtectedRoute>} />
              <Route path="brigadistas" element={<ProtectedRoute minRole="jefe_brigada"><Brigadistas /></ProtectedRoute>} />
              <Route path="sedes" element={<Sedes />} />
              <Route path="simulacros" element={<ProtectedRoute minRole="jefe_brigada"><Simulacros /></ProtectedRoute>} />
              <Route path="evidencias" element={<Evidencias />} />
              <Route path="chat" element={<Chat />} />
              <Route path="reportes" element={<ProtectedRoute minRole="coordinador"><Reportes /></ProtectedRoute>} />
              <Route path="auditoria" element={<ProtectedRoute minRole="admin"><Auditoria /></ProtectedRoute>} />
              <Route path="perfil" element={<Perfil />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
      </AuthProvider>
    </ThemeProvider>
  );
}
