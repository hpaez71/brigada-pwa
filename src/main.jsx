import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { isFirebaseConfigured } from './config/firebaseConfig';
import ConfigMissing from './pages/ConfigMissing';

registerSW({ immediate: true });

// La app solo se carga si Firebase está configurado (evita errores de inicialización).
const Root = lazy(() => import('./Root'));

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isFirebaseConfigured ? (
      <HashRouter>
        <Suspense fallback={null}>
          <Root />
        </Suspense>
      </HashRouter>
    ) : (
      <ConfigMissing />
    )}
  </React.StrictMode>,
);
