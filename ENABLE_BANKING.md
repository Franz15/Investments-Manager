# Análisis de integración: Enable Banking

> Análisis: 2026-07-16. **Implementado en `chore/Refactor`** (fases 2–4). Ver §7 para la puesta en marcha.

## 1. Qué es Enable Banking y por qué encaja

[Enable Banking](https://enablebanking.com) es un agregador finlandés de open banking (PSD2) con
licencia AISP propia. Da acceso unificado a ~2.500 bancos europeos vía una única API REST.

Dos propiedades lo hacen especialmente adecuado para este proyecto:

1. **Es pass-through puro**: "Enable Banking does not store, cache, or process data for any purpose
   other than delivering it to the application authorised by the user". Los datos bancarios solo
   viven en nuestra BD — un único punto de custodia que controlamos nosotros.
2. **Modo restringido gratuito**: una app de producción puede activarse "by linking accounts"
   (enlazando tus propias cuentas) **sin contrato, sin KYB y sin coste**. Solo devuelve datos de las
   cuentas explícitamente enlazadas. Es el modo pensado exactamente para apps personales/familiares
   como esta (lo usa, p. ej., la comunidad de Firefly III). El modo completo (usuarios públicos)
   requiere contrato firmado, KYB, y pricing por volumen con mínimo mensual.

**Cobertura España** ([market specifics ES](https://enablebanking.com/docs/markets/es/)): CaixaBank,
BBVA, Santander, Sabadell, Bankinter, Kutxabank, Unicaja y otros menores (la mayoría vía plataforma
Redsys). Particularidad importante de Redsys: **una sola sesión de autenticación activa por usuario
y TPP** — una nueva autorización invalida el token anterior. No afecta si cada cuenta se conecta una
vez y se renueva cada ~180 días, pero hay que tenerlo en cuenta al reconectar.

## 2. Cómo funciona la API (resumen técnico)

- **Autenticación de aplicación**: JWT RS256 firmado con clave privada RSA propia (4096 bits). La
  clave pública se registra en su Control Panel y devuelve un `app_id` (va en el header `kid` del
  JWT). TTL máximo del token: 24 h. Cada request lleva `Authorization: Bearer <jwt>`.
- **Flujo de consentimiento (AIS)**:
  1. `POST /auth` → indicas banco (ASPSP), `valid_until` (máx. ~180 días), `redirect_url` y `state` → devuelve URL de autorización.
  2. El usuario se autentica en su banco (redirect + SCA con app del banco).
  3. Callback a nuestra `redirect_url` con `code` + `state`.
  4. `POST /sessions` con el `code` → devuelve `session_id` + lista de cuentas autorizadas.
- **Datos**: `GET /accounts/{uid}/balances`, `GET /accounts/{uid}/transactions` (paginado con
  `continuation_key`, filtro `date_from`/`date_to`).
- **Revocación**: `DELETE /sessions/{id}` cierra sesión y revoca el consentimiento en el banco.
- **Sandbox**: disponible nada más crear cuenta, con bancos mock. Una app se registra como SANDBOX
  o PRODUCTION y no puede cambiarse después (se crean dos apps).

### Límites regulatorios (PSD2 RTS art. 10a / 36(5)b) que condicionan el diseño

| Límite                         | Valor                     | Implicación de diseño                                                                                                                              |
| ------------------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Consentimiento AIS             | máx. 180 días (por banco) | Renovación con SCA del usuario ~2 veces/año; la UI debe avisar antes de expirar                                                                    |
| Acceso sin usuario presente    | máx. 4 veces / 24 h       | El cron de sincronización: 1–2 ejecuciones diarias, no más                                                                                         |
| Historial sin usuario presente | solo últimos 90 días      | La **carga inicial completa** debe hacerse inmediatamente tras la autorización (usuario presente); después el cron solo pide incrementos recientes |

## 3. Arquitectura de integración propuesta

Todo el contacto con Enable Banking vive en el **backend** (Railway). El frontend nunca ve la clave
privada, el `app_id` ni el `session_id`; solo dispara el flujo y recibe estados.

```
frontend (Vercel)                backend (Railway)                    Enable Banking
─────────────────                ─────────────────                    ──────────────
"Conectar banco" ──────────────► POST /api/bank-connections/start ──► POST /auth
                 ◄────────────── { url }                                 │
window.location = url  ────────────────── redirect ──────────────────► banco (SCA)
                 ◄──────────────────── callback con code+state ◄─────────┘
/bank-callback?code=... ───────► POST /api/bank-connections/complete ► POST /sessions
                                 guarda BankConnection                 │
                                 sync inicial (historial completo) ◄──┘
                                 mapeo cuentas EB → Account/SubAccount

node-cron (ya existe scheduler/) ► sync diario incremental (≤4/día) ► GET transactions
```

### Piezas nuevas

| Pieza                                                | Ubicación | Responsabilidad                                                                       |
| ---------------------------------------------------- | --------- | ------------------------------------------------------------------------------------- |
| `services/enableBankingService.js`                   | backend   | Firmar JWT RS256, llamadas HTTP a la API, paginación                                  |
| `models/BankConnection.js`                           | backend   | Sesión EB + mapeo de cuentas + validez del consentimiento                             |
| `routes/bankConnectionRoutes.js`                     | backend   | start / complete / status / sync manual / disconnect (todas tras `authenticateToken`) |
| `services/bankSyncService.js`                        | backend   | Sincronización, deduplicación, normalización a `Transaction`                          |
| Job en `scheduler/`                                  | backend   | Cron diario de sync + aviso de consentimientos por expirar                            |
| Página/moda "Conectar banco" + ruta `/bank-callback` | frontend  | Selección de banco, redirect, estado de conexión                                      |

### Modelo de datos

**`BankConnection`** (nuevo):

```js
{
  user: String,                    // mismo patrón que el resto de modelos
  aspsp: { name, country },        // p. ej. { name: "BBVA", country: "ES" }
  sessionIdEncrypted: String,      // session_id CIFRADO (AES-256-GCM) — ver §4
  validUntil: Date,                // expiración del consentimiento
  status: 'active' | 'expired' | 'revoked' | 'error',
  accounts: [{
    uid: String,                   // uid de cuenta en EB (por sesión)
    identificationHash: String,    // hash estable entre sesiones (lo da EB) → re-mapeo al renovar
    ibanMasked: String,            // "ES91 **** **** **** 1234" — NUNCA el IBAN completo
    name: String,
    account: ObjectId,             // → Account existente
    subAccount: ObjectId,          // → SubAccount (opcional)
    lastSyncedAt: Date,
  }],
}
```

**`Transaction`** (ampliar, sin romper lo existente):

```js
externalId: String,   // entry_reference / id de transacción del banco
source: { type: String, enum: ['manual', 'import', 'bank'], default: 'manual' },
```

Índice único parcial para deduplicación:
`{ user: 1, account: 1, externalId: 1 }` con `unique + partialFilterExpression: { externalId: { $exists: true } }`.

Si el banco no da `entry_reference` estable, fallback: hash SHA-256 de
`fecha + importe + moneda + descripción normalizada` (con contador para duplicados legítimos).

### Sincronización

- **Inicial** (usuario presente, justo tras autorizar): historial completo (`date_from` lejano),
  paginando con `continuation_key`. Es la única ventana para traer >90 días.
- **Incremental** (cron, 1×/día): `date_from = lastSyncedAt - 7 días` (margen para transacciones
  que pasan de PEND a BOOK) + dedupe por `externalId`. Solo estado `BOOK` para crear `Transaction`.
- **Normalización**: importe positivo/negativo → `type: income/expense`; categoría → `"Sin categorizar"`
  (o motor de reglas simple por comercio, fase posterior); `description` ← remittance information.
- **Fallos**: si EB devuelve error de sesión expirada/revocada → `status: 'expired'` y aviso en UI;
  nunca reintentar en bucle (cuenta contra el límite de 4/día).

## 4. Seguridad

### 4.1 Secretos y claves

- **Clave privada RSA**: generar en local (`openssl genrsa 4096`), subir solo la pública a EB.
  La privada va como variable de entorno en Railway (`EB_PRIVATE_KEY`, base64 del PEM) — **jamás en
  el repo ni en `backend/`**. Ya hubo un incidente con credenciales en el historial de git; una
  clave que da acceso a datos bancarios es estrictamente peor que la URI de Atlas.
- `EB_APP_ID`, `EB_REDIRECT_URL` también por env.
- Añadir a `.gitignore` explícitamente: `*.pem`, `*.key`.

### 4.2 Cifrado del `session_id` en reposo

El `session_id` de EB es un secreto de larga vida (hasta 180 días): quien lo tenga **junto con
nuestra clave privada** puede leer las cuentas. Defensa en profundidad frente a un compromiso de la
BD (el escenario ya ocurrió con los backups en el historial):

- Cifrar `session_id` con AES-256-GCM antes de guardarlo (`crypto` nativo de Node, sin dependencias).
- Clave de cifrado (`EB_ENC_KEY`, 32 bytes) solo en env de Railway → un dump de Mongo Atlas por sí
  solo no expone nada utilizable.

### 4.3 Minimización de datos

- **No almacenar IBAN completo**: máscara para UI + `identification_hash` (lo provee EB) para
  re-mapear cuentas al renovar consentimiento.
- **No almacenar el JSON crudo** de EB (trae datos del titular, referencias internas del banco).
  Guardar solo los campos normalizados de `Transaction`. Si hace falta debug, colección aparte con
  TTL de 7 días.
- No pedir scopes que no se usan (solo accounts + balances + transactions; nada de PIS/pagos).

### 4.4 Flujo de callback

- Generar `state` aleatorio (`crypto.randomBytes`) en `/start`, guardarlo con TTL de 15 min
  asociado al usuario, y **validarlo en `/complete`** (anti-CSRF: evita que un tercero nos haga
  completar una sesión con un `code` suyo).
- `redirect_url` fija registrada en EB (dominio de Vercel), nunca construida desde input.
- Enviar los **PSU headers** (`Psu-Ip-Address`, `Psu-User-Agent` del usuario real) cuando la llamada
  la origina el usuario — EB lo recomienda y los bancos aplican límites más generosos con usuario presente.

### 4.5 Prerequisitos en la app actual (bloqueantes antes de conectar datos bancarios reales)

Detectado en `develop` (algunos puede que ya estén corregidos en `chore/Refactor` — commit e04d639
"improve auth routes"; verificar antes de duplicar trabajo):

1. **`GET /api/auth/debug`** (`authRoutes.js:9`): endpoint público que lista todos los usuarios y
   comprueba si su contraseña es "admin". Eliminar.
2. **Login verboso** (`authRoutes.js:102`): en fallo devuelve `availableUsers` y nombre de BD en la
   respuesta. Eliminar el bloque `debug` y los `console.log` con URI de Mongo.
3. **`JWT_SECRET` con fallback hardcodeado** (`authMiddleware.js:3`): en producción debe fallar el
   arranque si no está definido, no usar `"your-secret-key-change-in-production"`.
4. **`userMiddleware.js` acepta `x-user-id` sin verificar**: cualquier ruta que lo use permite
   suplantar usuario. Auditar usos y migrar a `authenticateToken`.
5. **Pendientes de la auditoría anterior**: rotar credenciales de Atlas, rotar `JWT_SECRET`, purgar
   backups del historial de git. Con transacciones bancarias reales en la BD, esto deja de ser
   opcional.

### 4.6 GDPR / legal

- Uso personal/familiar → exención doméstica del RGPD; aun así aplicar minimización (§4.3) por higiene.
- El modo restringido de EB no exige privacy policy ni ToS; el modo completo (app pública) sí:
  contrato, KYB, enlaces a ToS/privacy y email de protección de datos activo.
- Botón "Desconectar banco" debe llamar a `DELETE /sessions/{id}` (revoca consentimiento en el
  banco) y opcionalmente ofrecer borrar las transacciones importadas.

## 5. Plan de implementación por fases

| Fase                          | Contenido                                                                                 | Verificación                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **0. Saneamiento**            | §4.5: debug endpoint, JWT secret, x-user-id, rotaciones                                   | `develop` sin endpoints debug; arranque falla sin `JWT_SECRET`                 |
| **1. Cuenta EB + sandbox**    | Cuenta en enablebanking.com, generar RSA, registrar app SANDBOX                           | `GET /application` responde 200 con JWT firmado                                |
| **2. Backend core**           | `enableBankingService` + `BankConnection` + rutas start/complete/status                   | Flujo completo contra banco mock del sandbox: sesión creada y cuentas listadas |
| **3. Frontend**               | UI conectar banco, `/bank-callback`, mapeo cuenta EB → Account, estado del consentimiento | Conectar y mapear un banco mock de punta a punta desde la UI                   |
| **4. Sync**                   | Carga inicial + cron incremental + dedupe + `source: 'bank'`                              | Re-ejecutar sync no duplica; transacciones mock visibles en dashboard          |
| **5. Producción restringida** | App PRODUCTION en EB, activar enlazando cuentas reales, env en Railway                    | Transacciones reales del banco en la app; cron ≤2 ejecuciones/día              |

Estimación: fases 0–2 son el grueso; el servicio EB en sí es pequeño (~3 ficheros nuevos, sin
dependencias nuevas — `jsonwebtoken` ya firma RS256 y `node-fetch`/`node-cron` ya están).

## 7. Puesta en marcha (pasos manuales)

La integración está implementada pero necesita credenciales. Pasos:

1. **Crear cuenta** en [enablebanking.com](https://enablebanking.com) (Control Panel).
2. **Generar claves** (en local, nunca en el repo):
   ```bash
   openssl genrsa -out eb-private.pem 4096
   openssl req -new -x509 -key eb-private.pem -out eb-cert.pem -days 3650 -subj "/CN=investments-manager"
   ```
3. **Registrar app** en el Control Panel subiendo `eb-cert.pem`:
   - Primero una app **SANDBOX** (para probar con bancos mock).
   - `redirect_url`: `http://localhost:5173/bank-callback` (dev) / `https://<tu-vercel>/bank-callback` (prod).
   - Copiar el `Application ID`.
4. **Variables de entorno** (backend `.env.local` en dev, Railway en prod):
   ```bash
   EB_APP_ID=<application id del control panel>
   EB_PRIVATE_KEY_BASE64=<salida de: openssl base64 -A -in eb-private.pem>
   EB_REDIRECT_URL=http://localhost:5173/bank-callback
   EB_ENC_KEY=<salida de: openssl rand -hex 32>
   ```
5. **Probar en sandbox**: página "Bancos" → Conectar banco → banco mock → autorizar →
   mapear cuenta EB a una Account → Sincronizar (la primera vez trae historial completo).
6. **Producción restringida**: registrar una segunda app como PRODUCTION, activarla con
   "Activate by linking accounts" enlazando tus cuentas reales, y poner sus credenciales en Railway.

Guardar `eb-private.pem` en un gestor de contraseñas y borrarlo del disco.

## 8. Fase 2 — Integración 360 (estudio, backlog FEAT-20+)

### Estado de partida (ya funciona, no necesita US)

- Transacción bancaria → subcuenta mapeada → **ya aparece** en Finanzas, estadísticas y
  transacciones (mismo camino que una manual).
- Saldo de la subcuenta = saldo del banco tras cada sync (fuente de verdad).
- Renovación de consentimiento, dedupe por `externalId` y cron diario: hechos.

### Huecos reales detectados

| #   | Hueco                                                 | Consecuencia hoy                                                     |
| --- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Las tx bancarias no heredan `business` de la cuenta   | Cuentas de empresa sincronizan a "personal"; Negocios no las ve      |
| 2   | Todo entra "Sin categorizar"                          | Finanzas por categoría inútil hasta categorizar a mano               |
| 3   | Transferencia entre dos cuentas propias sincronizadas | Se importa como gasto + ingreso → doble contabilización              |
| 4   | Convivencia con transacciones manuales y recurrentes  | Duplicados: lo que ya anotaste a mano vuelve a entrar desde el banco |

### Backlog

**FEAT-20 — Cuentas de negocio sincronizadas entran en Negocios** · S

- **BE**: en `bankSyncService`, la tx hereda `business` del `Account` padre de la subcuenta
  mapeada (1 línea + populate). Script one-off para retro-etiquetar las tx `source: 'bank'`
  existentes.
- **FE**: nada — Negocios ya filtra por `business`.
- **AC**: conecto una cuenta cuyo `Account.business != null` → sus movimientos aparecen en
  Negocios y NO en Finanzas personal; con `business: null`, al revés.

**FEAT-21 — Categorización asistida** · M

- **BE**: al importar, buscar la última tx del usuario con la misma descripción normalizada
  (lowercase, sin números) que tenga categoría ≠ "Sin categorizar" y copiarla. Sin modelo nuevo,
  sin motor de reglas: la historia del usuario ES la regla.
- **FE**: en Transacciones, filtro "Sin categorizar" + edición de categoría en línea (ya existe
  edición; añadir el filtro y acceso rápido).
- **AC**: categorizo "MERCADONA" una vez → la próxima importación de "MERCADONA" sale categorizada.

**FEAT-22 — Detección de transferencias internas** · M

- **BE**: post-import, buscar contrapartida: mismo importe, signo opuesto, ±3 días, distinta
  subcuenta del mismo usuario, ambas `source: 'bank'` → marcar ambas `type: 'transfer'` (el enum
  ya existe; verificar que las estadísticas ya excluyen transfer — lo hacen).
- **FE**: badge "Transferencia" en la lista (si no existe ya para type transfer).
- **AC**: mover 500 € entre dos cuentas sincronizadas no altera ingresos ni gastos del mes.

**FEAT-23 — Conciliación con transacciones manuales** · M

- **BE**: al importar, si existe una tx manual del mismo usuario con mismo importe, misma
  subcuenta y fecha ±3 días → importar igualmente pero con flag `possibleDuplicateOf: <id>`.
  Endpoint `POST /transactions/:id/resolve-duplicate` con acción `merge` (borra la manual,
  conserva la bancaria) o `keep-both`.
- **FE**: banner "N posibles duplicados" en Transacciones con las parejas y dos botones.
- **AC**: gasto anotado a mano el martes e importado del banco el jueves → una sola tx tras revisar.
- Nota: la salida de largo plazo es dejar de anotar a mano en subcuentas sincronizadas; este flujo
  es para la transición y para pagos que el banco tarda días en asentar.

**FEAT-24 — Blindaje de datos bancarios** · XS

- **BE**: en PUT/DELETE de transacción, si `source: 'bank'`: bloquear cambio de `amount`, `date` y
  borrado (categoría, tags, descripción y `business` sí editables). El banco es la verdad; editarla
  a mano solo crea descuadres que el siguiente sync no puede arreglar.
- **FE**: deshabilitar esos campos en el modal de edición con tooltip "importada del banco".
- **AC**: no se puede alterar importe/fecha de una tx bancaria desde la UI ni la API.

**FEAT-25 — Paso a producción (bancos reales)** · S, sin código

- Registrar app PRODUCTION en EB, activar en modo restringido enlazando cuentas reales,
  variables en Railway (`EB_*` nuevas, redirect a Vercel), clave RSA nueva (la de sandbox pasó
  por chats), conectar CaixaBank/Santander/etc. desde la app desplegada.
- **AC**: movimientos reales sincronizando a diario en producción.

### Orden recomendado

`20 → 25 → 21 → 22 → 23 → 24`. La 20 es una línea y desbloquea Negocios; la 25 es donde aparece
el valor real (datos de verdad); 21-23 solo tienen sentido con datos reales fluyendo; la 24 cabe
en cualquier hueco.

### Descartado a propósito (YAGNI)

Motor de reglas de categorización configurable, webhooks de EB, multi-divisa, split de
transacciones, notificaciones de sync, histórico de saldos bancarios, ML. Cualquiera se
reevalúa cuando su ausencia duela con datos reales.

## 9. Sprint de seguridad (FEAT-26+) — gate antes de datos bancarios reales

> Auditoría 2026-07-18. Regla del sprint: primero lo que cierra puertas abiertas,
> después lo que endurece. Nada de teatro criptográfico (CSFLE con la clave en la misma
> caja que los datos no protege nada; los importes se computan, no se cifran).

### Transversales (ops, sin código — el 90% del riesgo)

**FEAT-26 — Rotación y purga de secretos** · S · **BLOQUEANTE para FEAT-25**

- Rotar credenciales de MongoDB Atlas (usuario nuevo, borrar el antiguo).
- Rotar `JWT_SECRET` en Railway (invalida sesiones activas: avisar a la familia).
- Purgar del historial de git los backups/credenciales filtrados (`git filter-repo`),
  force-push coordinado y re-clone.
- AC: la connection string del historial ya no autentica; el repo no contiene secretos en
  ningún commit.

**FEAT-27 — Backups fiables** · S

- Atlas M0 no tiene backup: `mongodump` programado (cron local o GitHub Action a storage
  privado) o subir a tier con backup. **Nunca al repo.**
- AC: restore probado una vez (dump → BD temporal → datos íntegros).

### Backend

**FEAT-28 — `/uploads` tras autenticación** · XS

- `express.static` de uploads detrás de `authenticateToken` (ruta que sirve el fichero
  tras validar token). Recibos/facturas dejan de ser públicos por URL.
- AC: GET a un upload sin token → 401.

**FEAT-29 — Rate-limit en login** · XS

- `express-rate-limit` en `/api/auth/login` (p. ej. 10 intentos / 15 min / IP).
- AC: intento 11 → 429.

**FEAT-24 — Blindaje de tx bancarias** (ya en backlog §8) · XS

- Encaja en este sprint: importe/fecha/borrado inmutables en `source: 'bank'`.

### Frontend

**FEAT-30 — Higiene de sesión** · S

- Al recibir 401 con sesión previa: limpiar `localStorage` (ya lo hace el interceptor) y
  mostrar aviso "sesión caducada" en Login en vez de aterrizar en frío.
- Verificar que ningún componente use `dangerouslySetInnerHTML` (grep) — React escapa el
  resto por defecto.
- AC: caducidad de sesión → mensaje claro; grep limpio.

### Extras (pedidos: más allá del mínimo — con su precio real)

| Extra                                                                        | Talla | Beneficio honesto                                    | ¿Cuándo hacerlo?                            |
| ---------------------------------------------------------------------------- | ----- | ---------------------------------------------------- | ------------------------------------------- |
| **FEAT-31** Auth por cookie httpOnly (+ CSRF) en vez de localStorage         | M     | El token deja de ser robable por XSS                 | Si la app sale del círculo familiar         |
| **FEAT-32** CSP + security headers en Vercel (`vercel.json`) y helmet en API | S     | Mitiga XSS/clickjacking; barato                      | Vale la pena en este sprint si sobra tiempo |
| **FEAT-33** Registro de accesos (colección `authlog`: login, sync, IP)       | S     | Forense básico: saber si pasó algo                   | Con bancos reales conectados, sí            |
| **FEAT-34** `npm audit` + Dependabot en CI                                   | S     | Avisos de CVEs sin trabajo manual                    | Sí, es configuración una vez                |
| 2FA / passkeys                                                               | L     | Real pero desproporcionado para 5 usuarios conocidos | Nunca, salvo apertura al público            |
| IP fija Railway + Atlas allowlist                                            | €     | Cierra el `0.0.0.0/0`                                | Solo si Railway se paga por otra razón      |

### Orden del sprint

`26 → 28 → 29 → 24 → 27 → 30 → (32 → 34 → 33 si hay hueco)`. La 26 va primera y sola:
rotar secretos con calma, sin mezclar con deploys de código. FEAT-25 (bancos reales) **no se
completa hasta cerrar la 26** — conectar tu banco de verdad a una BD cuyas credenciales
llevan meses filtradas en el historial es el orden equivocado.

## 10. Alternativa considerada

**GoCardless Bank Account Data** (ex-Nordigen): free tier similar, también cubre bancos españoles.
Diferencia clave: GoCardless **almacena** los datos en sus servidores (más superficie de terceros);
Enable Banking es pass-through. Para una app cuyo requisito explícito es controlar seguridad y
almacenamiento, Enable Banking es la mejor opción de las dos. No se recomienda Plaid/Tink para este
caso (orientados a contrato enterprise).

## Referencias

- [API Reference](https://enablebanking.com/docs/api/reference/) · [FAQ](https://enablebanking.com/docs/faq/) · [Linked accounts / restricted mode](https://enablebanking.com/docs/api/linked-accounts/) · [Especificidades España](https://enablebanking.com/docs/markets/es/)
- [RTS art. 10a — SCA cada 180 días](https://www.projectivegroup.com/psd2-alert-authentication-period-for-account-information-services-extended-to-180-days/) · [EBA Q&A — 4 accesos/día sin PSU](https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId/2018_4210) · [EBA Q&A — historial 90 días](https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId/2018_4177)
- Ejemplo real de este patrón: [Firefly III + Enable Banking](https://docs.firefly-iii.org/tutorials/data-importer/eb/)
