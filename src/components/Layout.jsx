import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar, Avatar, Box, Chip, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon,
  ListItemText, Toolbar, Tooltip, Typography, useMediaQuery, Alert, Snackbar,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import WarningIcon from '@mui/icons-material/Warning';
import MapIcon from '@mui/icons-material/Map';
import GroupsIcon from '@mui/icons-material/Groups';
import ApartmentIcon from '@mui/icons-material/Apartment';
import ModelTrainingIcon from '@mui/icons-material/ModelTraining';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import ForumIcon from '@mui/icons-material/Forum';
import AssessmentIcon from '@mui/icons-material/Assessment';
import PolicyIcon from '@mui/icons-material/Policy';
import PersonIcon from '@mui/icons-material/Person';
import LogoutIcon from '@mui/icons-material/Logout';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { LocationProvider, useGeo } from '../contexts/LocationContext';
import { OpsProvider, useOps } from '../contexts/OpsContext';
import { ROLE_LABELS, EMERGENCIA_TIPOS, labelOf } from '../config/constants';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { onQueueChange, pendingCount, processQueue } from '../services/offlineQueue';
import { onForegroundMessage } from '../services/notifications';
import { unlockAudio } from '../utils/alarm';
import EmergencyWatcher from './EmergencyWatcher';
import ApoyoWatcher from './ApoyoWatcher';
import PanicButton from './PanicButton';

const DRAWER = 260;

const NAV = [
  { to: '/', label: 'Inicio', icon: <DashboardIcon />, min: 'brigadista' },
  { to: '/emergencias', label: 'Emergencias', icon: <WarningIcon />, min: 'brigadista' },
  { to: '/mapa', label: 'Mapa operativo', icon: <MapIcon />, min: 'jefe_brigada' },
  { to: '/brigadistas', label: 'Brigadistas', icon: <GroupsIcon />, min: 'jefe_brigada' },
  { to: '/sedes', label: 'Centros de operación', icon: <ApartmentIcon />, min: 'brigadista' },
  { to: '/simulacros', label: 'Simulacros', icon: <ModelTrainingIcon />, min: 'jefe_brigada' },
  { to: '/evidencias', label: 'Evidencias', icon: <PhotoLibraryIcon />, min: 'brigadista' },
  { to: '/chat', label: 'Comunicaciones', icon: <ForumIcon />, min: 'brigadista' },
  { to: '/reportes', label: 'Reportes', icon: <AssessmentIcon />, min: 'coordinador' },
  { to: '/auditoria', label: 'Auditoría', icon: <PolicyIcon />, min: 'admin' },
  { to: '/perfil', label: 'Mi perfil', icon: <PersonIcon />, min: 'brigadista' },
];

function usePresence() {
  const { user, profile } = useAuth();
  useEffect(() => {
    if (!user) return undefined;
    const beat = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      setDoc(
        doc(db, 'presencia', user.uid),
        { uid: user.uid, nombre: profile?.nombre || user.email, sedeId: profile?.sedeId || null, lastSeen: serverTimestamp() },
        { merge: true },
      ).catch(() => {});
    };
    beat();
    const id = setInterval(beat, 120_000);
    document.addEventListener('visibilitychange', beat);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [user, profile?.nombre, profile?.sedeId]);
}

function StatusBar() {
  const online = useOnlineStatus();
  const [pending, setPending] = useState(0);
  const { activas } = useOps();
  const navigate = useNavigate();

  useEffect(() => {
    pendingCount().then(setPending);
    processQueue();
    return onQueueChange(setPending);
  }, []);

  return (
    <>
      {!online && (
        <Alert severity="warning" icon={<CloudOffIcon />} sx={{ borderRadius: 0 }}>
          Sin conexión. Puede seguir trabajando: los cambios se sincronizarán automáticamente.
          {pending > 0 && ` (${pending} archivo(s) en cola)`}
        </Alert>
      )}
      {online && pending > 0 && (
        <Alert severity="info" sx={{ borderRadius: 0 }}>Sincronizando {pending} archivo(s) pendiente(s)…</Alert>
      )}
      {activas.length > 0 && (
        <Alert
          severity="error"
          variant="filled"
          sx={{ borderRadius: 0, cursor: 'pointer' }}
          onClick={() => navigate(`/emergencias/${activas[0].id}`)}
        >
          {activas.length === 1 ? 'Emergencia activa: ' : `${activas.length} emergencias activas. Última: `}
          <strong>{labelOf(EMERGENCIA_TIPOS, activas[0].tipo)}</strong>
          {activas[0].sedeNombre ? ` · ${activas[0].sedeNombre}` : ''} — toque para ver
        </Alert>
      )}
      <ApoyoWatcher />
    </>
  );
}

function Shell() {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const [open, setOpen] = useState(false);
  const { user, profile, role, hasRole, logout } = useAuth();
  const { sharing } = useGeo();
  const location = useLocation();
  const navigate = useNavigate();
  const [fgMsg, setFgMsg] = useState(null);
  usePresence();

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    let unsub = () => {};
    onForegroundMessage((payload) => {
      const n = payload.notification || payload.data || {};
      setFgMsg({ title: n.title, body: n.body, link: payload.data?.path });
    }).then((u) => {
      unsub = u;
    });
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => unsub();
  }, []);

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar src={profile?.fotoUrl} sx={{ bgcolor: 'primary.main' }}>{(profile?.nombre || user?.email || '?')[0]}</Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap>{profile?.nombre || user?.email}</Typography>
          <Typography variant="caption" color="text.secondary">{ROLE_LABELS[role]}</Typography>
        </Box>
      </Box>
      <Divider />
      <List sx={{ flex: 1, py: 1 }}>
        {NAV.filter((n) => hasRole(n.min)).map((n) => (
          <ListItemButton
            key={n.to}
            component={NavLink}
            to={n.to}
            end={n.to === '/'}
            sx={{ mx: 1, borderRadius: 2, '&.active': { bgcolor: 'action.selected', color: 'primary.main', '& svg': { color: 'primary.main' } } }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>{n.icon}</ListItemIcon>
            <ListItemText primary={n.label} />
          </ListItemButton>
        ))}
      </List>
      <Divider />
      <ListItemButton onClick={() => logout().then(() => navigate('/login'))} sx={{ m: 1, borderRadius: 2 }}>
        <ListItemIcon sx={{ minWidth: 40 }}><LogoutIcon /></ListItemIcon>
        <ListItemText primary="Cerrar sesión" />
      </ListItemButton>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" color="secondary" sx={{ zIndex: (t) => t.zIndex.drawer + 1, pt: 'env(safe-area-inset-top)' }}>
        <Toolbar>
          {!desktop && (
            <IconButton color="inherit" edge="start" onClick={() => setOpen(true)} sx={{ mr: 1 }} aria-label="Menú">
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" sx={{ flex: 1 }} noWrap>Brigadas de Emergencia</Typography>
          <Tooltip title={sharing ? 'Compartiendo ubicación' : 'Ubicación desactivada'}>
            <Chip
              size="small"
              icon={<MyLocationIcon />}
              label={sharing ? 'GPS' : 'GPS off'}
              color={sharing ? 'success' : 'default'}
              onClick={() => navigate('/perfil')}
              sx={{ color: '#fff' }}
            />
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Drawer
        variant={desktop ? 'permanent' : 'temporary'}
        open={desktop || open}
        onClose={() => setOpen(false)}
        sx={{ width: DRAWER, flexShrink: 0, '& .MuiDrawer-paper': { width: DRAWER, boxSizing: 'border-box' } }}
      >
        <Toolbar />
        {drawer}
      </Drawer>

      <Box component="main" sx={{ flex: 1, minWidth: 0 }}>
        <Toolbar sx={{ mt: 'env(safe-area-inset-top)' }} />
        <StatusBar />
        <Box sx={{ p: { xs: 2, md: 3 }, pb: 12, maxWidth: 1400, mx: 'auto' }}>
          <Outlet />
        </Box>
      </Box>

      <PanicButton />
      <EmergencyWatcher />

      <Snackbar open={Boolean(fgMsg)} autoHideDuration={8000} onClose={() => setFgMsg(null)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        {fgMsg ? (
          <Alert severity="error" variant="filled" onClose={() => setFgMsg(null)}
            onClick={() => fgMsg.link && navigate(fgMsg.link)}>
            <strong>{fgMsg.title}</strong> {fgMsg.body}
          </Alert>
        ) : <span />}
      </Snackbar>
    </Box>
  );
}

export default function Layout() {
  return (
    <LocationProvider>
      <OpsProvider>
        <Shell />
      </OpsProvider>
    </LocationProvider>
  );
}
