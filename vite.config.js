import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Versión visible en la app: versión del paquete + fecha y hora de compilación (Colombia) + commit.
function appVersion() {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  let sha = '';
  try { sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* sin git */ }
  return `${pkg.version} · ${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}${sha ? ` · ${sha}` : ''}`;
}

// VITE_BASE debe ser "/<nombre-repo>/" en GitHub Pages (lo define el workflow).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE || '/';

  return {
    base,
    define: { __APP_VERSION__: JSON.stringify(appVersion()) },
    plugins: [
      react(),
      VitePWA({
        // injectManifest: un único Service Worker propio que combina
        // precache/caché inteligente (Workbox) + Firebase Cloud Messaging.
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        registerType: 'autoUpdate',
        injectRegister: false,
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        },
        includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          id: base,
          name: 'Brigadas de Emergencia',
          short_name: 'Brigadas',
          description: 'Gestión y activación de brigadas de emergencia empresariales',
          lang: 'es',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait',
          theme_color: '#B71C1C',
          background_color: '#FFFFFF',
          categories: ['business', 'productivity', 'utilities'],
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            { name: 'Solicitar apoyo', url: `${base}#/?panico=1`, icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
            { name: 'Emergencias', url: `${base}#/emergencias`, icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          ],
        },
        devOptions: { enabled: false, type: 'module' },
      }),
    ],
    build: {
      chunkSizeWarningLimit: 1600,
      rollupOptions: {
        output: {
          manualChunks: {
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/functions', 'firebase/messaging'],
            mui: ['@mui/material', '@emotion/react', '@emotion/styled'],
            map: ['leaflet', 'react-leaflet'],
            charts: ['recharts'],
          },
        },
      },
    },
  };
});
