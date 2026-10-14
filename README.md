# 🚨 Brigadas de Emergencia — PWA

Plataforma web progresiva para brigadas de emergencia empresariales (SG-SST): gestión de brigadistas, activación de evacuaciones, notificación multicanal, respuesta y geolocalización en tiempo real, botón de pánico, simulacros, evidencias con cadena de custodia y reportes PDF/Excel para auditoría.

**Stack:** React 18 · Vite 5 · Material UI 6 · Firebase (Auth, Firestore, Storage, Cloud Messaging, Cloud Functions 2.ª gen) · Leaflet/OpenStreetMap · jsPDF · ExcelJS · Workbox · GitHub Pages · GitHub Actions.

## Módulos

| # | Módulo | Dónde |
|---|---|---|
| 1 | Autenticación, RBAC (4 roles por *custom claims*), historial de accesos, auditoría | `AuthContext`, `ProtectedRoute`, `pages/Auditoria`, `firestore.rules` |
| 2 | Gestión de brigadistas, certificaciones con vencimiento | `pages/Brigadistas`, `functions: crearUsuario, revisarCertificaciones` |
| 3 | Activación de emergencias (7 tipos, 4 niveles, confirmación) | `components/ActivationDialog`, `services/emergencias` |
| 4 | Notificaciones: Push/FCM, correo, WhatsApp Business, SMS + escalamiento | `functions/src/channels.js`, `onEmergenciaCreada`, `escalarSinRespuesta` |
| 5 | Geolocalización, mapa operativo, brigadistas más cercanos, puntos de encuentro | `LocationContext`, `pages/Mapa`, `components/MapView` |
| 6 | Estados de respuesta en tiempo real | `components/ResponsePanel`, `onRespuestaEscrita` |
| 7 | Panel de control | `pages/Dashboard` |
| 8 | PWA offline, instalable, sincronización automática | `src/sw.js`, `services/offlineQueue`, caché persistente de Firestore |
| 9 | Botón de pánico «Solicitar apoyo» | `components/PanicButton`, `ApoyoWatcher`, `onAlertaApoyoCreada` |
| 10 | Simulacros e indicadores | `pages/Simulacros`, `services/simulacros` |
| 11 | Reportes PDF y Excel | `pages/Reportes`, `services/reports` |
| 12 | Centros de operación: sedes, planos, rutas, puntos de encuentro | `pages/Sedes` |
| 13 | Chat interno: canales, grupos, directos, adjuntos | `pages/Chat`, `services/chat` |
| 14 | Evidencias: fotos, videos, documentos, observaciones, actas | `components/EvidenceManager`, `services/evidencias` |

## Inicio rápido

```bash
cp .env.example .env.local        # datos de su proyecto Firebase
npm install
npm run dev
```

Despliegue completo (Firebase + GitHub Pages + CI/CD): **[docs/DESPLIEGUE.md](docs/DESPLIEGUE.md)**.

## Documentación

- [Arquitectura, diagramas de componentes y flujos](docs/ARQUITECTURA.md)
- [Modelo de datos Firestore, diagrama ER e índices](docs/MODELO_DATOS.md)
- [Seguridad y buenas prácticas](docs/SEGURIDAD.md)
- [Escalabilidad para más de 10 000 usuarios](docs/ESCALABILIDAD.md)
- [Despliegue paso a paso](docs/DESPLIEGUE.md)

## Scripts

| Comando | Acción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción en `dist/` |
| `npm run preview` | Sirve `dist/` (prueba de PWA/offline) |
| `npm run emulators` | Firebase Emulator Suite |
| `npm run test:rules` | Pruebas de reglas de Firestore en el emulador |
| `npm run deploy:firebase` | Despliega reglas, índices y funciones |
| `cd functions && node scripts/bootstrap-admin.js <email> "<nombre>"` | Crea el primer administrador |

## Licencia

Uso interno de la organización. Ajuste según su política.
