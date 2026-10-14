# Arquitectura

## 1. Visión general

Plataforma **serverless** compuesta por una PWA estática (React + Vite + Material UI) publicada en **GitHub Pages** y un backend administrado en **Firebase** (Auth, Firestore, Storage, Cloud Messaging y Cloud Functions 2.ª gen.).

Principios de diseño para un sistema de notificación crítica:

| Principio | Cómo se aplica |
|---|---|
| **Redundancia de alerta** | Una activación llega por 5 vías independientes: listener en tiempo real de Firestore (alerta a pantalla completa con sirena), push FCM, correo, WhatsApp y SMS. Si nadie responde en N minutos (niveles alto/crítico) se **escala** por SMS/WhatsApp solo a quienes no respondieron. |
| **Offline-first** | Service Worker con precache del app shell, caché de teselas y archivos; Firestore con caché persistente en IndexedDB y cola automática de escrituras; cola propia en IndexedDB para archivos (evidencias, adjuntos). Respaldo nativo `tel:` / `sms:` en el botón de pánico. |
| **Seguridad en el servidor** | Roles como *custom claims* (solo los asigna una Cloud Function). Reglas de Firestore/Storage validan rol, propiedad, estructura y estado. Evidencias y auditoría son inmutables. |
| **Cálculos confiables** | Tiempos de respuesta y contadores los calcula el servidor (trigger), no el cliente. |
| **Escalabilidad horizontal** | Fan-out por temas FCM (1 llamada para N dispositivos), agregados pre-calculados, consultas acotadas e índices compuestos. |

## 2. Diagrama de arquitectura

```mermaid
flowchart LR
  subgraph Dispositivos["Dispositivos (Android · iPhone · PC)"]
    PWA["PWA React + MUI<br/>Service Worker (Workbox + FCM)<br/>IndexedDB: caché Firestore + cola offline"]
  end

  subgraph GH["GitHub"]
    Repo["Repositorio"] --> GA["GitHub Actions"]
    GA -->|build Vite| Pages["GitHub Pages<br/>(hosting estático HTTPS)"]
  end

  subgraph FB["Firebase / Google Cloud"]
    Auth["Firebase Auth<br/>custom claims: role"]
    FS[("Cloud Firestore")]
    ST[("Cloud Storage")]
    FCM["Cloud Messaging<br/>temas: todos · sede_x · rol_x"]
    CF["Cloud Functions 2ª gen<br/>triggers · callables · scheduler"]
    AC["App Check<br/>(reCAPTCHA v3)"]
  end

  subgraph EXT["Proveedores externos"]
    SMTP["SMTP<br/>(Workspace / M365 / SES / SendGrid)"]
    WA["WhatsApp Business<br/>Cloud API"]
    SMS["Twilio SMS"]
  end

  Pages -->|descarga app shell| PWA
  PWA <-->|login| Auth
  PWA <-->|tiempo real / offline| FS
  PWA -->|evidencias, fotos, planos| ST
  PWA -->|callables| CF
  PWA -.-> AC
  FS -->|onCreate/onWrite| CF
  CF --> FCM -->|Web Push| PWA
  CF --> SMTP
  CF --> WA
  CF --> SMS
  CF --> FS
  GA -->|reglas, índices, funciones| FB
```

## 3. Diagrama de componentes (frontend)

```mermaid
flowchart TB
  main["main.jsx<br/>registerSW · HashRouter"] --> Root["Root.jsx<br/>ThemeProvider · rutas lazy"]
  Root --> AuthP["AuthContext<br/>usuario · rol (claims) · perfil"]
  AuthP --> PR["ProtectedRoute(minRole)"]
  PR --> Layout["Layout"]
  Layout --> LocP["LocationContext<br/>watchPosition → ubicaciones/{uid}"]
  Layout --> OpsP["OpsContext<br/>emergencias activas · SOS abiertos"]
  Layout --> EW["EmergencyWatcher<br/>alerta pantalla completa + sirena"]
  Layout --> AW["ApoyoWatcher<br/>banner SOS (jefes+)"]
  Layout --> PB["PanicButton<br/>Solicitar apoyo"]
  Layout --> SB["StatusBar<br/>offline · cola · emergencia activa"]

  subgraph Páginas
    D["Dashboard<br/>(coordinador / brigadista)"]
    E["Emergencias + ActivationDialog"]
    ED["EmergenciaDetalle<br/>respuestas · mapa · cercanos · evidencias"]
    M["Mapa operativo"]
    B["Brigadistas"]
    S["Sedes"]
    SI["Simulacros"]
    EV["Evidencias"]
    C["Chat"]
    R["Reportes"]
    AU["Auditoría"]
    P["Perfil"]
  end
  Layout --> Páginas

  subgraph Componentes
    MV["MapView (Leaflet)"]
    RP["ResponsePanel"]
    EM["EvidenceManager"]
  end
  ED --> RP & MV & EM
  D --> MV & RP

  subgraph Servicios
    sE["emergencias.js"]
    sN["notifications.js (FCM)"]
    sV["evidencias.js · storage.js"]
    sQ["offlineQueue.js (IndexedDB)"]
    sR["reports.js (jsPDF · ExcelJS)"]
    sA["audit.js"]
    sB["brigadistas.js · sedes.js · simulacros.js · chat.js"]
  end
  Páginas --> Servicios
  sV --> sQ
```

## 4. Flujo de activación de emergencia

```mermaid
sequenceDiagram
  autonumber
  actor C as Coordinador / Jefe
  participant App as PWA
  participant FS as Firestore
  participant CF as Cloud Functions
  participant FCM as FCM
  participant X as Correo · WhatsApp · SMS
  actor B as Brigadistas

  C->>App: Botón ACTIVAR → tipo, nivel, sede
  App->>C: Pantalla de confirmación
  C->>App: Confirmo
  App->>FS: emergencias.add (createdAt = hora servidor)
  Note over FS: Reglas: rol ≥ jefe, activadaPor = uid,<br/>tipo/nivel válidos
  FS-->>B: onSnapshot (app abierta) → alerta a pantalla completa
  FS->>CF: onEmergenciaCreada
  CF->>FCM: 1 mensaje al tema sede_x (o "todos")
  FCM-->>B: Push (requireInteraction, vibración)
  CF->>X: correo BCC · WhatsApp plantilla · SMS (si crítico)
  CF->>FS: notificaciones.{push,email,whatsapp,sms,destinatarios}
  B->>App: "Recibido" / "En desplazamiento"… + GPS
  App->>FS: respuestas/{uid} (offline: en cola)
  FS->>CF: onRespuestaEscrita
  CF->>FS: tiempoRespuestaSeg + stats agregados
  FS-->>C: Dashboard en tiempo real
  loop cada 2 min (alto/crítico)
    CF->>FS: ¿quién no ha respondido tras N min?
    CF->>X: SMS + WhatsApp + push solo a pendientes
  end
  C->>App: Cerrar emergencia
  FS->>CF: onEmergenciaActualizada → push "controlada"
```

## 5. Flujo del botón de pánico

```mermaid
sequenceDiagram
  actor B as Brigadista
  participant App as PWA
  participant FS as Firestore
  participant CF as Functions
  actor J as Jefes / Coordinadores
  B->>App: Solicitar apoyo
  App->>App: GPS puntual (8 s máx, si no: última conocida)
  App->>FS: alertasApoyo.add (prioridad crítica)
  App->>FS: respuestas/{uid} = necesito_apoyo (si hay emergencia activa)
  alt Sin Internet
    App-->>B: Queda en cola + botones tel:/sms: con enlace de ubicación
  end
  FS-->>J: Banner rojo intermitente + sirena (tiempo real)
  FS->>CF: onAlertaApoyoCreada
  CF-->>J: Push + correo + SMS con enlace a Google Maps
  J->>App: "Atendida"
```

## 6. Decisiones técnicas

| Decisión | Motivo |
|---|---|
| **HashRouter** | GitHub Pages no reescribe rutas: `/#/ruta` evita 404 en recargas y deep links desde notificaciones. |
| **Un solo Service Worker (injectManifest)** | Workbox y FCM comparten SW; dos SW en el mismo *scope* se pisan. |
| **Leaflet + OpenStreetMap** | Sin API key ni costos por carga; teselas cacheables offline. Puede cambiarse a Google Maps en `MapView.jsx`. |
| **Temas FCM** | Un único envío por emergencia sin importar si hay 50 o 50 000 dispositivos. Las suscripciones las hace el servidor leyendo el rol de los claims. |
| **Cloud Functions para crear usuarios** | El SDK cliente no puede crear cuentas de terceros sin cerrar la sesión propia; además permite asignar claims de forma segura. |
| **Directorio separado** | `users` contiene datos personales (documento, teléfono, RH). `directorio` expone solo nombre, cargo, brigadas y sede a todos los brigadistas (chat, simulacros). |
| **SHA-256 en evidencias** | Cadena de custodia: la huella permite demostrar que el archivo no fue alterado. |
| **Idempotencia `_eventos/{eventId}`** | Los triggers son *at-least-once*; se evita duplicar envíos y contadores. |

## 7. Estructura de carpetas

```
brigadas-pwa/
├── .github/
│   ├── dependabot.yml
│   └── workflows/
│       ├── deploy-pages.yml        # build + GitHub Pages
│       └── firebase-backend.yml    # tests de reglas + deploy reglas/índices/functions
├── docs/                           # arquitectura, datos, seguridad, escalabilidad, despliegue
├── functions/                      # Cloud Functions (Node 22)
│   ├── index.js                    # triggers, callables, tareas programadas
│   ├── src/channels.js             # push, correo, WhatsApp, SMS
│   ├── src/labels.js               # etiquetas y plantilla de correo
│   ├── scripts/bootstrap-admin.js  # crea el primer administrador
│   └── .env.example
├── public/                         # íconos PWA y favicon
├── src/
│   ├── config/                     # firebase, constantes
│   ├── contexts/                   # Auth, Location, Ops
│   ├── hooks/                      # useQuery/useDocument, useSedes, useOnlineStatus
│   ├── services/                   # lógica de negocio y acceso a datos
│   ├── components/                 # Layout, MapView, PanicButton, watchers…
│   ├── pages/                      # una por módulo
│   ├── utils/                      # geo, formato, alarma
│   ├── sw.js                       # Service Worker
│   ├── Root.jsx · main.jsx · theme.js · styles.css
├── tests/firestore.rules.test.mjs
├── firebase.json · firestore.rules · firestore.indexes.json · storage.rules
├── vite.config.js · index.html · package.json · .env.example
└── README.md
```
