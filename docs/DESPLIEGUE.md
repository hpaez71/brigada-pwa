# Despliegue paso a paso

Tiempo estimado: 45–60 minutos la primera vez.

## Requisitos

- Cuenta de Google y de GitHub.
- Node.js 22 y npm 10 (`node -v`).
- Firebase CLI: `npm install -g firebase-tools` y `firebase login`.
- Java 11+ solo si va a ejecutar emuladores o las pruebas de reglas en local.
- **Plan Blaze** (pago por uso) en Firebase: necesario para Cloud Functions, llamadas salientes a WhatsApp/Twilio/SMTP y los buckets de Storage actuales. Configure un presupuesto con alertas.

---

## Paso 1 · Crear el proyecto Firebase

1. Entre a <https://console.firebase.google.com> → **Agregar proyecto** (p. ej. `brigadas-miempresa`). Puede desactivar Google Analytics.
2. **Actualizar a Blaze** (ícono de engranaje → Uso y facturación).
3. **Authentication** → Comenzar → habilite **Correo electrónico/contraseña**.
   - Configuración → **Dominios autorizados** → agregue `SU-USUARIO.github.io`.
   - Configuración → Política de contraseñas y protección contra enumeración de correos.
4. **Firestore Database** → Crear base de datos → modo **producción** → región cercana (p. ej. `southamerica-east1` o `us-central1`).
5. **Storage** → Comenzar → misma región.
6. **Configuración del proyecto → General → Tus apps → Web (</>)** → registre la app (no marque Hosting). Copie el objeto `firebaseConfig`.
7. **Configuración del proyecto → Cloud Messaging → Certificados push web → Generar par de claves**. Copie la clave (VAPID).

## Paso 2 · Preparar el repositorio

```bash
git clone https://github.com/SU-USUARIO/brigadas-pwa.git   # o copie la carpeta del proyecto
cd brigadas-pwa
cp .env.example .env.local          # complete con el firebaseConfig y la VAPID key
cp .firebaserc.example .firebaserc  # ponga el id de su proyecto
cp functions/.env.example functions/.env   # APP_URL, SMTP, WhatsApp, Twilio
npm install
(cd functions && npm install)
```

`APP_URL` en `functions/.env` debe ser la URL final de GitHub Pages, con barra al final:
`https://SU-USUARIO.github.io/brigadas-pwa/`

## Paso 3 · Desplegar el backend

```bash
firebase use <id-del-proyecto>
firebase deploy --only firestore:rules,firestore:indexes,storage
firebase deploy --only functions
```

La primera vez Firebase habilita APIs (Cloud Build, Artifact Registry, Cloud Scheduler, Eventarc). Si falla por permisos recién activados, espere 2–3 minutos y repita. Los índices pueden tardar varios minutos en construirse (Firestore → Índices).

Configure la política **TTL**: Firestore → TTL → colección `_eventos`, campo `expireAt`.

## Paso 4 · Crear el primer Administrador General

1. Consola → Configuración del proyecto → **Cuentas de servicio** → *Generar nueva clave privada* (guárdela fuera del repositorio).
2. Ejecute:

```bash
cd functions
export GOOGLE_APPLICATION_CREDENTIALS=/ruta/segura/service-account.json
node scripts/bootstrap-admin.js admin@miempresa.com "Nombre del Administrador"
```

El script imprime un enlace para definir la contraseña. A partir de aquí todos los demás usuarios se crean desde la app (módulo **Brigadistas**).

## Paso 5 · Probar en local

```bash
npm run dev            # http://localhost:5173
```

Inicie sesión con el administrador, cree una **sede** con sus puntos de encuentro, registre un brigadista y active un **simulacro**. Para probar push en local use Chrome (localhost es contexto seguro) y active las notificaciones en **Mi perfil**.

Con emuladores (sin tocar producción): `VITE_USE_EMULATORS=true` en `.env.local` y `npm run emulators`.

## Paso 6 · Publicar en GitHub Pages con GitHub Actions

1. Cree el repositorio en GitHub y suba el código:
   ```bash
   git init && git add . && git commit -m "Plataforma de brigadas"
   git branch -M main
   git remote add origin https://github.com/SU-USUARIO/brigadas-pwa.git
   git push -u origin main
   ```
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Secrets** — cree:

| Secret | Valor |
|---|---|
| `VITE_FIREBASE_API_KEY` | apiKey |
| `VITE_FIREBASE_AUTH_DOMAIN` | authDomain |
| `VITE_FIREBASE_PROJECT_ID` | projectId |
| `VITE_FIREBASE_STORAGE_BUCKET` | storageBucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | messagingSenderId |
| `VITE_FIREBASE_APP_ID` | appId |
| `VITE_FIREBASE_VAPID_KEY` | clave de certificados push web |
| `VITE_RECAPTCHA_SITE_KEY` | (opcional) App Check |

   Pestaña **Variables** (opcionales): `VITE_ORG_NAME`, `VITE_EMERGENCY_PHONE`, `VITE_COORDINATOR_PHONE`, `VITE_FUNCTIONS_REGION`, y `VITE_BASE` **solo** si usa dominio propio o un repo `SU-USUARIO.github.io` (valor `/`).

4. Vaya a **Actions → Frontend · Build y GitHub Pages → Run workflow** (o haga push a `main`). Al terminar, la URL aparece en el job *deploy*: `https://SU-USUARIO.github.io/brigadas-pwa/`.

### Dominio propio (opcional)
Settings → Pages → Custom domain (`brigadas.miempresa.com`), cree el registro CNAME en su DNS, defina la variable `VITE_BASE=/`, agregue el dominio a los dominios autorizados de Firebase Auth y actualice `APP_URL`.

## Paso 7 · CI/CD del backend (opcional, recomendado)

El workflow `firebase-backend.yml` prueba las reglas en el emulador y despliega reglas, índices y funciones cuando cambian.

1. Google Cloud Console → IAM → Cuentas de servicio → cree `github-deployer` con los roles: *Firebase Rules Admin*, *Cloud Datastore Index Admin*, *Firebase Admin*, *Cloud Functions Admin*, *Service Account User*, *Cloud Scheduler Admin*, *Artifact Registry Administrator*. Genere una clave JSON.
2. Secrets en GitHub:
   - `FIREBASE_SERVICE_ACCOUNT`: contenido completo del JSON.
   - `FIREBASE_PROJECT_ID`: id del proyecto.
   - `FUNCTIONS_ENV`: contenido completo de su `functions/.env`.
3. Settings → Branches → proteja `main` y marque *Pruebas de reglas (emulador)* como verificación obligatoria.

## Paso 8 · Canales externos (estructura preparada)

**Correo (SMTP)** — complete `SMTP_*`. Google Workspace: `smtp.gmail.com:465`, `SMTP_SECURE=true`, contraseña de aplicación. Microsoft 365: `smtp.office365.com:587`.

**WhatsApp Business Cloud API**
1. <https://developers.facebook.com> → Crear app tipo *Business* → producto WhatsApp.
2. Registre el número de la empresa; copie *Phone number ID* → `WHATSAPP_PHONE_ID`.
3. Cree un *token de sistema permanente* → `WHATSAPP_TOKEN`.
4. Cree y espere la aprobación de una plantilla (categoría *Utility*) llamada `alerta_emergencia`, idioma `es`, por ejemplo:
   > 🚨 Alerta: {{1}} – nivel {{2}} en {{3}}. Reporte su estado de inmediato: {{4}}

**SMS (Twilio)** — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` y `TWILIO_FROM` (número) o `TWILIO_MESSAGING_SERVICE_SID`. Para Colombia verifique los requisitos de registro de remitente.

Tras cambiar `functions/.env`: `firebase deploy --only functions`.

Para usar otro proveedor de SMS (p. ej. AWS SNS, Infobip, Hablame), reemplace solo la función `sendSMS` en `functions/src/channels.js`.

## Paso 9 · Instalación en los dispositivos

- **Android (Chrome)**: abrir la URL → menú ⋮ → *Instalar aplicación*. Aceptar notificaciones y ubicación.
- **iPhone (Safari, iOS 16.4+)**: abrir la URL → Compartir → **Agregar a inicio** → abrir desde el ícono → Mi perfil → activar notificaciones. *(En iOS el push solo funciona con la app instalada.)*
- En cada dispositivo: **Mi perfil** → activar *Notificaciones push*, *Compartir ubicación* y *Disponible*.

## Paso 10 · Lista de verificación de salida a producción

- [ ] Simulacro de prueba en cada sede: push recibido en Android, iPhone y PC; correo recibido; WhatsApp/SMS si aplica.
- [ ] Modo avión: responder, cargar foto y SOS → se sincronizan al reconectar.
- [ ] Brigadista inactivo no puede iniciar sesión.
- [ ] App Check habilitado y en modo forzado.
- [ ] API key restringida por referente HTTP.
- [ ] Copias de seguridad / PITR de Firestore activas.
- [ ] Alertas de presupuesto configuradas.
- [ ] Política de tratamiento de datos comunicada a los brigadistas.

## Solución de problemas

| Síntoma | Causa probable |
|---|---|
| Pantalla «Configuración pendiente» | Faltan secrets `VITE_FIREBASE_*` en el build |
| `auth/unauthorized-domain` | Agregue el dominio de Pages en Auth → Dominios autorizados |
| «The query requires an index» | Índices aún construyéndose o no desplegados (`firebase deploy --only firestore:indexes`) |
| No llegan push | VAPID key incorrecta, permiso denegado, o en iPhone la app no está instalada; revise `fcmTokens` y `notificacionesLog` |
| `permission-denied` tras cambiar rol | Cierre y abra sesión (o espere el refresco automático del token) |
| Página en blanco tras actualizar | El SW se actualiza solo; recargue una vez. Verifique `VITE_BASE` = `/<repo>/` |
| Funciones no envían correo/SMS | Revise `firebase functions:log` y los chips de estado por canal en el detalle de la emergencia |
