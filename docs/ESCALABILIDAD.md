# Estrategia de escalabilidad (> 10 000 usuarios)

## 1. Supuestos de carga

| Escenario | Volumen |
|---|---|
| Usuarios registrados | 10 000 – 50 000 en varias sedes |
| Activación de emergencia «todas las sedes» | 10 000 destinatarios en < 30 s |
| Pico de respuestas | ~10 000 escrituras en 2–3 minutos (≈ 60–80/s) |
| Ubicaciones | 1 escritura / 20 s por brigadista con GPS activo durante la emergencia |
| Lecturas del tablero | decenas de coordinadores en tiempo real |

## 2. Qué ya está resuelto en el diseño

| Área | Técnica | Efecto |
|---|---|---|
| **Fan-out push** | Temas FCM (`todos`, `sede_x`, `rol_x`); la suscripción la hace el servidor al registrar el token | 1 llamada a FCM para N dispositivos; la latencia no crece con el número de usuarios |
| **Correo** | BCC por lotes de 80 con *pool* SMTP | 10 000 correos ≈ 125 envíos |
| **WhatsApp / SMS** | Concurrencia limitada (20 / 10) y SMS inmediato solo en nivel crítico; escalamiento solo a quienes **no** respondieron | Controla costo y límites de tasa del proveedor |
| **Agregados** | `stats`, `totalRespuestas`, `sumTiempoRespuestaSeg` con `FieldValue.increment` desde un trigger | El tablero lee **1 documento**, no 10 000 respuestas |
| **Conteos** | `getCountFromServer` (agregación) cada 60 s | Costo de 1 lectura por cada 1 000 documentos contados |
| **Ubicaciones** | Escritura acotada (20 s / 20 m), consultas por ventana de tiempo y sede, `limit` | Evita tormenta de escrituras y lecturas |
| **Índices** | Compuestos solo donde hay consultas; exenciones para arreglos grandes | Escrituras más baratas y rápidas |
| **Cliente** | Code-splitting por página y por librería (mapa, gráficos, PDF, Excel cargan bajo demanda); caché persistente | Primera carga ligera; lecturas repetidas sin costo de red |
| **Idempotencia** | `_eventos/{eventId}` | Reintentos de triggers sin duplicar envíos ni contadores |
| **Hosting** | GitHub Pages (CDN Fastly) + Service Worker | El frontend no tiene servidor que escalar |

## 3. Ajustes al superar ~10 000 usuarios activos simultáneos

### 3.1 Contadores distribuidos para emergencias masivas
Firestore recomienda ~1 escritura sostenida/s por documento. Con miles de respuestas por minuto en **una** emergencia, use *sharded counters*:

```
emergencias/{id}/shards/{0..19}  { stats.recibido: n, totalRespuestas: n, … }
```
El trigger incrementa un shard aleatorio y el tablero suma los 20 shards (20 lecturas). Alternativa: una función programada cada 10 s que recalcule `stats` con `count()` por estado.

### 3.2 Fan-out por cola (Cloud Tasks / Pub/Sub)
Para correo, WhatsApp y SMS masivos, divida los destinatarios en lotes de 500 y encole una tarea por lote (`onTaskDispatched`), con reintentos y control de tasa por proveedor. El push FCM por tema no lo necesita.

### 3.3 Ubicaciones en Realtime Database
Para seguimiento de miles de brigadistas cada pocos segundos, mover `ubicaciones` y `presencia` a **Realtime Database** (cobra por ancho de banda, no por operación, e incluye `onDisconnect` para presencia real). Firestore se mantiene para todo lo auditable.

### 3.4 Particionar por sede
- Los coordinadores de sede consultan siempre con `where('sedeId', '==', …)` (índices ya definidos).
- Topics FCM por sede ya existen; agregue temas por brigada (`brigada_contra_incendios`) si necesita activar solo una especialidad.

### 3.5 Paginación
`Brigadistas`, `Auditoría` y el historial ya usan `limit`; para > 5 000 registros cambie a paginación por cursor (`startAfter`) y búsqueda por prefijo en un campo `nombreLower`, o integre la extensión **Search with Algolia / Typesense**.

### 3.6 Cloud Functions
- `minInstances: 1` en `onEmergenciaCreada` y `onAlertaApoyoCreada` elimina el arranque en frío (≈ 1–3 s) en la ruta crítica (costo mensual bajo).
- `maxInstances` y `concurrency` (2.ª gen permite hasta 1 000 solicitudes por instancia) ajustables en `setGlobalOptions`.
- Despliegue multirregión de funciones críticas si opera en varios países.

### 3.7 Datos históricos
- Política **TTL** en `_eventos.expireAt`, `presencia` y `ubicaciones` antiguas.
- Exportación mensual de `auditoria`, `accesos` y `notificacionesLog` a **BigQuery** (extensión *Stream Firestore to BigQuery*) para tableros de largo plazo sin cargar Firestore.

## 4. Estimación de costos (orden de magnitud)

Para 10 000 brigadistas, 4 simulacros/año por sede y ~20 activaciones reales/año: Firestore, Storage y Functions suelen quedar en **decenas de USD/mes**. El costo dominante son **SMS y WhatsApp** (por mensaje, según país y proveedor), por eso el diseño reserva el SMS para nivel crítico y escalamiento. Configure alertas de presupuesto en Google Cloud.

## 5. Pruebas de carga sugeridas

1. Emulador + script que cree 10 000 respuestas concurrentes y mida la latencia del tablero.
2. Simulacro real por sede con medición de: tiempo de llegada del push (campo `notificaciones.inicio/fin`), tiempo promedio de respuesta y tasa de participación.
3. Prueba de modo avión: responder, cargar evidencia y enviar SOS sin red; verificar sincronización al reconectar.
