# Plan Fase 0 SIGP — Base

**Objetivo**: dejar el panel web listo para que F1 (Comercial) pueda arrancar sin bloqueos. F0 no incluye lógica de negocio del SIGP — es infraestructura, refactor mínimo y preparación.

**Duración estimada**: 1-2 semanas.

**Base de este plan**: el reconocimiento de Fase 0.0 (03-jul-2026) reveló que faltan varias piezas que el plan de F1 asumía como precondiciones. F0 las construye.

---

## Alcance de F0

### Dentro
- Instalación de `pdf-lib` (dependencia para F1)
- Instalación y configuración de Vitest + testing-library
- Configuración de Firebase Emulator Suite
- Extensión de `firebase/config.ts` con `getStorage()`
- Extracción de `AdminRoute` inline a `components/ProtectedRoute.tsx` genérico
- Creación de la estructura `sigp/` en `components/`, `pages/`, `types/`, `hooks/`
- Sistema de consecutivos con Cloud Function transaccional
- Layout SIGP y navegación base (Sidebar extendido con sección SIGP oculta por feature flag)
- Feature flag `sigp_f1_enabled` en Firebase Remote Config
- Batch de migración de roles heredados a nuevos roles SIGP

### Fuera (queda para F1+)
- Cualquier CRUD de entidades del SIGP (clientes, LPU, solicitudes, cotizaciones, etc.)
- Cualquier UI de negocio
- Generación de PDFs de negocio
- Reglas Firestore específicas para colecciones del SIGP (van con F1)

---

## Iteración 0.1 — Dependencias y configuración de entorno

**Objetivo**: preparar el terreno con las librerías y herramientas que F1 va a necesitar.

### Tarea 0.1.1 — Instalar `pdf-lib`

```bash
npm install pdf-lib
```

Verificar que el bundle no crece excesivamente. Documentar en `DEPLOYMENT_GUIDE.md` que el panel ahora genera PDFs (para el equipo).

**Verificación**: `npm run build` exitoso, tamaño del bundle reportado en el commit.

### Tarea 0.1.2 — Instalar Vitest + React Testing Library

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitest/ui
```

Configurar `vitest.config.ts` en la raíz del proyecto:
- Entorno `jsdom`
- Setup file en `src/test/setup.ts` con imports de `@testing-library/jest-dom`
- Alias de imports iguales a los de Vite
- Comando `npm test` y `npm run test:ui` en `package.json`

Escribir **un solo test smoke** que renderice `App` y verifique que compila sin errores. Confirma que el pipeline funciona.

**Verificación**: `npm test` corre y pasa un test.

### Tarea 0.1.3 — Configurar Firebase Emulator Suite

Instalar Firebase CLI si no está: `npm install -g firebase-tools`.

Ejecutar `firebase init emulators` en la raíz de `sst-panel-web/`. Habilitar:
- Auth Emulator (puerto 9099)
- Firestore Emulator (puerto 8080)
- Storage Emulator (puerto 9199)
- Functions Emulator (puerto 5001)

Actualizar `firebase/config.ts` para conectar a los emuladores cuando `import.meta.env.DEV === true`:

```typescript
if (import.meta.env.DEV) {
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(db, 'localhost', 8080);
  // storage cuando exista
}
```

Documentar en `DEPLOYMENT_GUIDE.md` cómo levantar los emuladores localmente (`firebase emulators:start`).

**Verificación**: emuladores levantan sin error; el panel en dev conecta a los emuladores.

### Tarea 0.1.4 — Extender `firebase/config.ts` con Storage

Agregar la inicialización de Storage:

```typescript
import { getStorage, connectStorageEmulator } from 'firebase/storage';

const storage = getStorage(app);
if (import.meta.env.DEV) {
  connectStorageEmulator(storage, 'localhost', 9199);
}

export { auth, db, storage };
```

**Verificación**: importar `storage` desde otro archivo compila sin error.

### Criterios de aceptación 0.1

- [ ] `pdf-lib`, Vitest y RTL instalados. `npm test` pasa un test smoke.
- [ ] Firebase Emulator Suite configurado. `firebase emulators:start` levanta Auth + Firestore + Storage + Functions sin errores.
- [ ] `firebase/config.ts` exporta `auth`, `db`, `storage`. En dev, los tres se conectan a emuladores.
- [ ] `DEPLOYMENT_GUIDE.md` actualizado con la sección "Desarrollo local con emuladores".
- [ ] Todo en rama `sigp/f0-base`, cero cambios en `main`.

---

## Iteración 0.2 — Refactor de protección de rutas y estructura de carpetas

**Objetivo**: dejar el sistema de protección de rutas listo para los nuevos roles del SIGP y crear la estructura de carpetas donde vivirá el código.

### Tarea 0.2.1 — Extraer `AdminRoute` inline a `ProtectedRoute` genérico

Actualmente `App.tsx` tiene:

```typescript
function AdminRoute({ children }) {
  const { userProfile } = useAuth();
  if (userProfile?.rol !== 'admin') return <Navigate to="/registros" replace />;
  return children;
}
```

Crear `src/components/ProtectedRoute.tsx` como componente reutilizable:

```typescript
interface ProtectedRouteProps {
  children: React.ReactNode;
  rolesPermitidos: string[];  // acepta cualquier rol
  redirectTo?: string;         // default '/registros'
}

export function ProtectedRoute({ children, rolesPermitidos, redirectTo = '/registros' }: ProtectedRouteProps) {
  const { userProfile } = useAuth();
  if (!userProfile || !rolesPermitidos.includes(userProfile.rol)) {
    return <Navigate to={redirectTo} replace />;
  }
  return <>{children}</>;
}
```

En `App.tsx`, reemplazar el `AdminRoute` inline por:

```typescript
<Route path="/obras" element={
  <ProtectedRoute rolesPermitidos={['admin']}>
    <Obras />
  </ProtectedRoute>
} />
```

Aplicar el mismo cambio a `/contratistas`.

**No romper nada**: los roles `sst`, `admin`, `tecnico` siguen funcionando exactamente igual. Solo cambia dónde vive la lógica.

**Verificación**: iniciar sesión como `sst` y verificar que `/obras` y `/contratistas` redirigen a `/registros`. Iniciar sesión como `admin` y verificar acceso.

### Tarea 0.2.2 — Crear estructura `sigp/` de carpetas

Crear las carpetas (sin código todavía, solo estructura). Cada subcarpeta con un `README.md` corto que explique su propósito:

```
src/
├── components/
│   └── sigp/
│       ├── clientes/       README.md
│       ├── lpu/            README.md
│       ├── solicitudes/    README.md
│       ├── cotizaciones/   README.md
│       ├── proyectos/      README.md
│       ├── ejecucion/      README.md
│       ├── cierre/         README.md
│       └── calidad/        README.md
├── pages/
│   └── sigp/               README.md
├── types/
│   └── sigp/               README.md
└── hooks/
    └── sigp/               README.md
```

El README de cada carpeta dice qué componentes vivirán ahí (referencia al plan de la fase correspondiente).

**Verificación**: estructura commiteada, cada carpeta con su README.

### Criterios de aceptación 0.2

- [ ] `ProtectedRoute` reemplaza `AdminRoute` sin cambios de comportamiento.
- [ ] Estructura `sigp/` creada en `components/`, `pages/`, `types/`, `hooks/`.
- [ ] Cada subcarpeta con `README.md` describiendo su propósito.
- [ ] Test de regresión manual: SST sigue funcionando exactamente igual.

---

## Iteración 0.3 — Sistema de consecutivos

**Objetivo**: implementar el helper que genera consecutivos transaccionales para el SIGP (`OFR-2026-001`, `PRY-2026-001`, `FAC-2026-001`, etc.).

### Tarea 0.3.1 — Diseñar la Cloud Function `generarConsecutivo`

Crear `functions/src/consecutivos.ts` (nuevo directorio de Cloud Functions):

```typescript
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const PREFIJOS_VALIDOS = ['SOL', 'OFR', 'PRY', 'ACT', 'LIQ', 'FAC', 'NC'] as const;

export const generarConsecutivo = onCall<{ prefijo: string }>(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Auth requerida');

  const { prefijo } = request.data;
  if (!PREFIJOS_VALIDOS.includes(prefijo as any)) {
    throw new HttpsError('invalid-argument', `Prefijo no válido: ${prefijo}`);
  }

  const año = new Date().getFullYear();
  const db = getFirestore();
  const ref = db.doc(`consecutivos/${prefijo}_${año}`);

  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const siguiente = (snap.data()?.ultimo ?? 0) + 1;
    tx.set(ref, {
      ultimo: siguiente,
      actualizado: FieldValue.serverTimestamp(),
      actualizado_por: request.auth!.uid
    });
    return `${prefijo}-${año}-${String(siguiente).padStart(3, '0')}`;
  });
});
```

Estructura del directorio `functions/`:
```
functions/
├── src/
│   ├── index.ts
│   └── consecutivos.ts
├── package.json
├── tsconfig.json
└── .eslintrc.js
```

En `functions/src/index.ts`:
```typescript
export { generarConsecutivo } from './consecutivos';
```

### Tarea 0.3.2 — Hook `useConsecutivo` en el panel

Crear `src/hooks/useConsecutivo.ts`:

```typescript
import { httpsCallable } from 'firebase/functions';
import { getFunctions } from 'firebase/functions';

const functions = getFunctions();
const generar = httpsCallable<{ prefijo: string }, string>(functions, 'generarConsecutivo');

export function useConsecutivo() {
  async function obtener(prefijo: string): Promise<string> {
    const resultado = await generar({ prefijo });
    return resultado.data;
  }
  return { obtener };
}
```

Actualizar `firebase/config.ts` para inicializar Functions y conectar al emulador en dev.

### Tarea 0.3.3 — Tests con emulador

Crear `src/hooks/__tests__/useConsecutivo.test.ts` con casos:
1. Generar un consecutivo `OFR` → devuelve `OFR-2026-001`.
2. Generar dos consecutivos consecutivos → devuelven `OFR-2026-001` y `OFR-2026-002`.
3. Prueba de concurrencia: 10 llamadas simultáneas → devuelven 10 consecutivos únicos.
4. Prefijo no válido → error.
5. Sin auth → error.

Los tests corren contra el emulador de Functions y Firestore. Requiere `firebase emulators:exec 'npm test'` o similar.

### Tarea 0.3.4 — Deploy a producción (requiere OK explícito)

⚠️ **PARAR ANTES DE ESTA TAREA Y PEDIR APROBACIÓN AL USUARIO.**

Cuando el usuario dé el OK explícito:

```bash
firebase deploy --only functions:generarConsecutivo
```

Después del deploy, prueba manual desde el panel en producción:
- Genera un consecutivo desde una página de prueba.
- Verifica que el documento `consecutivos/OFR_2026` se creó en producción.
- **Limpia**: borra el documento de prueba después.

### Criterios de aceptación 0.3

- [ ] Cloud Function `generarConsecutivo` implementada y desplegada al emulador.
- [ ] Hook `useConsecutivo` funcional.
- [ ] Los 5 tests pasan con el emulador.
- [ ] **Deploy a producción con OK explícito del usuario.**
- [ ] Prueba manual en producción exitosa (consecutivo generado y verificado).

---

## Iteración 0.4 — Layout SIGP y navegación

**Objetivo**: extender el panel para que tenga navegación al SIGP, oculta por feature flag.

### Tarea 0.4.1 — Extender el Sidebar con sección SIGP

En `src/components/Sidebar.tsx`, agregar una sección SIGP con los ítems principales, controlada por feature flag:

```typescript
{sigpEnabled && (
  <div className="mt-6">
    <h3 className="text-xs font-semibold uppercase text-gray-500 px-3 mb-2">SIGP</h3>
    <NavItem to="/sigp/dashboard" icon={...} label="Panel SIGP" />
    <NavItem to="/sigp/clientes" icon={...} label="Clientes" rolesRequeridos={['admin', 'gerencia_comercial']} />
    <NavItem to="/sigp/solicitudes" icon={...} label="Solicitudes" />
    <NavItem to="/sigp/cotizaciones" icon={...} label="Cotizaciones" />
    {/* Más ítems irán apareciendo con cada fase */}
  </div>
)}
```

El componente `NavItem` acepta `rolesRequeridos` opcional. Si el rol del usuario no está en la lista, no se renderiza.

### Tarea 0.4.2 — Rutas base `/sigp/*`

En `App.tsx`, agregar rutas placeholder para el SIGP:

```typescript
<Route path="/sigp/dashboard" element={
  <ProtectedRoute rolesPermitidos={[
    'admin', 'gerencia_general', 'gerencia_comercial', 'director_proyectos',
    'gerencia_administrativa', 'residente_sst', 'gestion_integral'
  ]}>
    <SigpDashboardPlaceholder />
  </ProtectedRoute>
} />
```

Crear `pages/sigp/SigpDashboardPlaceholder.tsx` con un simple:

```tsx
<div>
  <h1 className="text-2xl font-bold">SIGP — Panel</h1>
  <p className="text-gray-600">Módulo en construcción. Fase 1 en desarrollo.</p>
</div>
```

Mismo patrón para `/sigp/clientes`, `/sigp/solicitudes`, `/sigp/cotizaciones` como placeholders.

### Criterios de aceptación 0.4

- [ ] Sidebar muestra la sección SIGP cuando el feature flag está activo.
- [ ] Rutas `/sigp/dashboard`, `/sigp/clientes`, `/sigp/solicitudes`, `/sigp/cotizaciones` responden con placeholders.
- [ ] Protección de rutas SIGP funciona con los nuevos roles.
- [ ] Con feature flag apagado, la sección SIGP no aparece en el sidebar.

---

## Iteración 0.5 — Feature flag y migración de roles

**Objetivo**: dejar el sistema de activación del SIGP listo y migrar los roles de los usuarios existentes.

### Tarea 0.5.1 — Feature flag en Firebase Remote Config

En la consola de Firebase, ir a Remote Config y crear el parámetro:

- **Nombre**: `sigp_f1_enabled`
- **Tipo**: Boolean
- **Valor por defecto**: `false`
- **Condiciones**: por ahora ninguna. Se activa manualmente cuando F1 esté lista.

En el panel, crear hook `useFeatureFlag`:

```typescript
import { getRemoteConfig, fetchAndActivate, getValue } from 'firebase/remote-config';

export function useFeatureFlag(nombre: string): boolean {
  const [valor, setValor] = useState(false);
  useEffect(() => {
    const remoteConfig = getRemoteConfig();
    remoteConfig.settings.minimumFetchIntervalMillis = 300000; // 5 min en prod
    fetchAndActivate(remoteConfig).then(() => {
      setValor(getValue(remoteConfig, nombre).asBoolean());
    });
  }, [nombre]);
  return valor;
}
```

Usar en el Sidebar y en cualquier componente que necesite gating.

### Tarea 0.5.2 — Batch de migración de roles

Crear un script en `scripts/migrar_roles_sigp.ts` (fuera del bundle del panel) que:

1. Lee todos los usuarios de la colección `users` en producción (Firebase Admin SDK).
2. Para cada usuario con rol `sst` o `admin`, imprime un CSV con:
   ```
   uid,email,nombre,rol_actual,rol_sigp_sugerido
   ```
   El rol SIGP sugerido se calcula con lógica simple: `admin` → `admin`; `sst` → `residente_sst`. Los ajustes finos los hará el usuario a mano después.
3. **NO escribe nada.** Solo genera el CSV para revisión manual.

El usuario revisa el CSV, ajusta los roles a mano, y le pasa el CSV corregido a un segundo script (`scripts/aplicar_migracion_roles.ts`) que aplica los cambios batch.

⚠️ **Antes de ejecutar `aplicar_migracion_roles.ts`, pedir OK explícito.** Es escritura masiva en la colección `users` en producción.

### Tarea 0.5.3 — Documentación de la migración

Escribir `docs/sigp/migracion-roles.md` explicando:
- Por qué existe la migración.
- Cómo ejecutar el script de generación de CSV.
- Cómo revisar y ajustar el CSV.
- Cómo aplicar la migración.
- Cómo revertir (usando el CSV original).

### Criterios de aceptación 0.5

- [ ] Feature flag `sigp_f1_enabled` creado en Remote Config en producción, valor `false`.
- [ ] Hook `useFeatureFlag` funcional.
- [ ] Script de generación de CSV corre en local y genera el archivo correctamente (con datos del emulador).
- [ ] Script de aplicación de migración corre en local (con datos del emulador).
- [ ] Documentación de migración escrita.
- [ ] **La migración en producción se ejecuta con OK explícito del usuario, no automáticamente al terminar F0.**

---

## Iteración 0.6 — Cierre F0

**Objetivo**: verificar que nada del SST se rompió y dejar F0 listo para merge a `main`.

### Tarea 0.6.1 — Smoke tests manuales de regresión SST

Ejecutar el flujo completo del panel SST y verificar que todo funciona igual que antes:
- [ ] Login como `sst` funciona.
- [ ] Login como `admin` funciona.
- [ ] Dashboard carga con los 4 gráficos.
- [ ] `/registros` muestra el hub de obras.
- [ ] Clic en una obra abre `ObraRegistros` con vista Lista y Kanban.
- [ ] Aprobar/rechazar un registro funciona; llega notificación a la app móvil (verificar en Firestore que se creó el documento en `notificaciones`).
- [ ] `/reportes` exporta Excel y CSV correctamente.
- [ ] `/obras` accesible solo para admin.
- [ ] `/contratistas` accesible solo para admin.
- [ ] `/usuarios` con panel de pestañas funciona.
- [ ] `InvitarUsuarioModal`, `EditarDocumentosModal`, `AsignarObrasModal`, `TecnicoPerfilModal` operativos.

Ninguna de estas cosas debió cambiar. Si algo se rompió, investigar y corregir antes de merge.

### Tarea 0.6.2 — Verificación del build

```bash
npm run build
```

Sin errores. Tamaño del bundle documentado en el commit para futura referencia.

### Tarea 0.6.3 — Preparar merge a `main`

- Rebase de `sigp/f0-base` sobre `main`.
- PR con descripción clara: qué cambió, qué se agregó, qué NO cambió.
- Deploy preview de Vercel: URL para revisión manual.
- Usuario revisa el preview y da OK explícito para merge.

### Criterios de aceptación 0.6

- [ ] Regresión SST verificada: todo funciona igual.
- [ ] Build de producción exitoso.
- [ ] PR abierto con preview de Vercel.
- [ ] **Merge a `main` con OK explícito del usuario.**
- [ ] Feature flag `sigp_f1_enabled` sigue en `false` — el SIGP no aparece para nadie hasta que F1 esté lista.

---

## Criterios de aceptación globales de F0

Al cerrar F0, el sistema debe tener:

- [ ] `pdf-lib` instalado, Vitest funcional, Firebase Emulator Suite configurado.
- [ ] `firebase/config.ts` exporta `storage` además de `auth` y `db`.
- [ ] `ProtectedRoute` genérico reemplazando `AdminRoute` inline.
- [ ] Estructura `sigp/` creada en `components/`, `pages/`, `types/`, `hooks/`.
- [ ] Sistema de consecutivos operativo en producción (validado manualmente).
- [ ] Layout SIGP con Sidebar extendido y rutas placeholder.
- [ ] Feature flag `sigp_f1_enabled` en Remote Config (por defecto `false`).
- [ ] Migración de roles ejecutada en producción (con OK explícito).
- [ ] Cero regresión en el panel SST.
- [ ] Deploy en `main` con SIGP oculto para usuarios.

---

## Handoff a Fase 1

Cuando F0 esté cerrada, F1 (Comercial) arranca con:

- Estructura de carpetas lista para recibir código SIGP.
- Consecutivos disponibles vía `useConsecutivo`.
- Storage inicializado y listo para archivos de LPU.
- Vitest y Emulator listos para tests.
- Sidebar con la sección SIGP invisible al público, visible cuando se activa el flag.
- Roles nuevos migrados en `users`; los nuevos componentes pueden proteger sus rutas usando `ProtectedRoute` con los roles SIGP.

Cuando F1 esté lista y probada, se activa el flag `sigp_f1_enabled = true` primero para 1-2 usuarios internos, luego se hace rollout completo.

---

## Ritmo sugerido

- Iteración 0.1 (Dependencias): 1 día.
- Iteración 0.2 (Refactor y estructura): 1 día.
- Iteración 0.3 (Consecutivos): 2-3 días (incluye deploy con aprobación).
- Iteración 0.4 (Layout SIGP): 1 día.
- Iteración 0.5 (Feature flag + migración): 2 días.
- Iteración 0.6 (Cierre F0): 1 día.

**Total estimado: 8-10 días de trabajo enfocado (1.5-2 semanas)**.

---

*Última actualización: 03 de julio de 2026. Versión: 1.0.*
