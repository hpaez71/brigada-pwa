import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { isFirebaseConfigured } from './config/firebaseConfig';
import ConfigMissing from './pages/ConfigMissing';
import ErrorBoundary, { reloadForUpdate } from './components/ErrorBoundary';

registerSW({ immediate: true });

// Si falla la descarga de una pantalla tras publicar una versión nueva, recarga para traerla.
window.addEventListener('vite:preloadError', (e) => {
  if (reloadForUpdate()) e.preventDefault();
});

// La app solo se carga si Firebase está configurado (evita errores de inicialización).
const Root = lazy(() => import('./Root'));

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isFirebaseConfigured ? (
      <ErrorBoundary full>
        <HashRouter>
          <Suspense fallback={null}>
            <Root />
          </Suspense>
        </HashRouter>
      </ErrorBoundary>
    ) : (
      <ConfigMissing />
    )}
  </React.StrictMode>,
);
