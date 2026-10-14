import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// VITE_BASE debe ser "/<nombre-repo>/" en GitHub Pages (lo define el workflow).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE || '/';

  return {
    base,
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
            { name: 'Solicitar apoyo', url: `${base}#/?panico=1`, icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
            { name: 'Emergencias', url: `${base}#/emergencias`, icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
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
