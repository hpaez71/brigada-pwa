# Seguridad y buenas prácticas

## 1. Modelo de autorización (RBAC)

| Capacidad | Brigadista | Jefe de Brigada | Coordinador | Administrador |
|---|:-:|:-:|:-:|:-:|
| Ver emergencias activas, responder, SOS | ✔ | ✔ | ✔ | ✔ |
| Compartir ubicación, chat, cargar evidencias | ✔ | ✔ | ✔ | ✔ |
| **Activar / cerrar emergencias** | | ✔ | ✔ | ✔ |
| Ver mapa operativo, ubicaciones, brigadistas | | ✔ | ✔ | ✔ |
| Gestionar simulacros, validar evidencias, atender SOS | | ✔ | ✔ | ✔ |
| Crear/editar brigadistas (hasta jefe), sedes, grupos de chat | | | ✔ | ✔ |
| Reportes PDF/Excel | | | ✔ | ✔ |
| **Asignar cualquier rol**, ver auditoría y accesos | | | | ✔ |

- El rol vive en los **custom claims** del token de Firebase Auth. Solo las Cloud Functions `crearUsuario`, `asignarRol` y el script `bootstrap-admin` pueden establecerlo.
- Las reglas leen `request.auth.token.role`; el campo `role` en `users` es solo un espejo informativo y las reglas impiden modificarlo desde el cliente.
- Al cambiar el rol, la función escribe `claimsUpdatedAt`; el cliente lo detecta y fuerza `getIdTokenResult(true)`.
- Un usuario autenticado **sin rol** no puede leer nada (pantalla «Cuenta pendiente»).
- Al pasar un brigadista a `inactivo`, un trigger deshabilita la cuenta en Auth y revoca sus *refresh tokens*.

## 2. Integridad y trazabilidad (auditorías SG-SST)

- **Hora del servidor**: `createdAt` de emergencias, SOS, evidencias, mensajes y auditoría debe ser `request.time` (no manipulable por el cliente).
- **Tiempos de respuesta calculados en el servidor** (`onRespuestaEscrita`); el cliente no puede escribir `tiempoRespuestaSeg`.
- **Inmutabilidad**: emergencias, respuestas, evidencias, mensajes, auditoría y accesos no se pueden borrar; las evidencias solo admiten el cambio de `validada`. En Storage, evidencias y adjuntos no se sobrescriben ni eliminan.
- **Cadena de custodia**: cada archivo de evidencia guarda su huella **SHA-256**, la hora de captura del dispositivo, la ubicación y el autor; el acta PDF de la emergencia lista las huellas.
- **Registro de auditoría** de acciones clave (activar, responder, cerrar, crear evidencia, validar, cambiar rol, generar reportes) e **historial de accesos** (login/logout con dispositivo).
- Una emergencia cerrada no se puede reabrir ni recibir nuevas respuestas.

## 3. Protección de datos personales (Ley 1581 de 2012 – Colombia)

- Los datos sensibles (documento, teléfono, RH, contacto de emergencia, ubicación) solo los ven el titular y roles ≥ jefe de brigada.
- El resto de brigadistas ve el **directorio** reducido (nombre, cargo, brigadas, sede).
- La ubicación solo se comparte si el brigadista la activa; puede desactivarla en cualquier momento (se marca `activa: false`).
- Incluya en su política de tratamiento la finalidad (atención de emergencias), el aviso de privacidad y el procedimiento de consulta/reclamo. Defina un periodo de retención (p. ej., borrar `ubicaciones` antiguas con TTL o una tarea programada).

## 4. Endurecimiento recomendado antes de producción

1. **App Check** con reCAPTCHA v3 (`VITE_RECAPTCHA_SITE_KEY`) y luego `ENFORCE_APP_CHECK=true` en functions; active la aplicación forzosa en Firestore y Storage desde la consola.
2. **Restringir la API key web** en Google Cloud Console → Credenciales: referencias HTTP `https://SU-USUARIO.github.io/*` y solo las APIs de Firebase necesarias. (La API key web no es un secreto, pero restringirla evita abusos.)
3. **Dominios autorizados** de Auth: deje solo `SU-USUARIO.github.io`, su dominio propio y `localhost` para desarrollo.
4. **Política de contraseñas** (Auth → Configuración): longitud mínima 10, mayúsculas, números. Active **MFA por SMS/TOTP** al menos para administradores y coordinadores (Identity Platform).
5. **Protección contra enumeración de correos** (Auth → Configuración → activada).
6. **Secretos**: credenciales SMTP/Twilio/WhatsApp en `functions/.env` (no versionado) o, mejor, en **Secret Manager** (`firebase functions:secrets:set`). En GitHub use *Secrets*, nunca variables en claro.
7. **Cuenta de servicio de CI** con roles mínimos: *Firebase Rules Admin*, *Cloud Datastore Index Admin*, *Cloud Functions Admin*, *Service Account User*, *Cloud Scheduler Admin*, *Artifact Registry Writer*.
8. **Rama `main` protegida**: revisión obligatoria de PR y el workflow de pruebas de reglas como *status check* requerido.
9. **Alertas de presupuesto** en Google Cloud Billing (los SMS/WhatsApp tienen costo por mensaje).
10. **Copias de seguridad**: active *Point-in-time recovery* y exportaciones programadas de Firestore (`gcloud firestore export`) a un bucket con retención.
11. **Cabeceras de seguridad**: GitHub Pages no permite cabeceras personalizadas; si requiere CSP estricta, HSTS preload o `Permissions-Policy`, sirva el `dist/` desde Firebase Hosting o un CDN (Cloudflare) con esas cabeceras.

## 5. Seguridad en el cliente

- Sin `dangerouslySetInnerHTML`; React escapa todo el contenido. La plantilla de correo del servidor escapa HTML (`esc`).
- Enlaces externos con `rel="noopener noreferrer"`.
- Las fotos se recomprimen en el dispositivo (elimina metadatos EXIF de geolocalización no deseados y reduce consumo de datos).
- La sesión persiste en IndexedDB del dispositivo; al cerrar sesión se elimina el rol en caché. En equipos compartidos, cierre siempre la sesión.
- Dependabot mantiene actualizadas las dependencias de npm y de GitHub Actions.

## 6. Limitaciones conocidas

- **iOS**: Web Push solo funciona con la app **instalada en la pantalla de inicio** (iOS/iPadOS 16.4+). El geoposicionamiento en segundo plano no está disponible para PWAs en ningún sistema; la ubicación se actualiza mientras la app está abierta.
- **Respuestas offline**: el servidor usa la hora del dispositivo para el tiempo de respuesta solo si es posterior a la activación y anterior a la recepción; un reloj manipulado podría mejorar ese indicador dentro de ese margen.
- El navegador puede suspender la sirena si la pestaña no está visible; el push del sistema operativo cubre ese caso.
