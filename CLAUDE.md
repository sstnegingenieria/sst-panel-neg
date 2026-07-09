# SIGP — NEG Ingeniería S.A.S. BIC

Sistema Integral de Gestión de Proyectos. Este archivo es el contexto operativo que cualquier instancia de Claude debe leer antes de tocar código en este repositorio.

---

## 0. Contexto SST heredado — leer primero

Este archivo aplica **encima** del `CLAUDE.md` del directorio padre (`APLICACION SST/CLAUDE.md`), que documenta el panel web SST original y el proyecto Firebase compartido. Cuando trabajes en `sst-panel-web/src/modules/sigp/`, ambos archivos rigen simultáneamente: el padre define la base compartida (panel SST, app Flutter, marca, restricciones absolutas); este define la ampliación SIGP.

**Reglas heredadas del padre que este archivo mantiene:**

1. **NO tocar la app Flutter** (`neg_sst_app/`). Su código y sus formularios están en producción y son estables. Cualquier cambio en colecciones compartidas debe ser retrocompatible.
2. **Cloud Functions y reglas Firestore requieren aprobación explícita del usuario antes de deploy a producción**. Diseño y prueba en emulador local son libres; producción requiere OK del humano en cada caso.
3. **Estrategia de subagentes por modelo**: Haiku para exploración y lectura, Sonnet para escribir código de complejidad media (default), Opus para arquitectura, revisión previa a producción y decisiones críticas. Nunca Haiku para código que va a producción directamente.
4. **La colección se llama `formularios`, no `registros`** — en versiones tempranas de la documentación se usó el nombre viejo. El nombre real en Firestore es `formularios`. Las visitas técnicas del SIGP también usarán esta colección con un `tipo` nuevo.
5. **`normalizarDoc()` es el helper canónico para leer documentos de Firestore** cuando la app Flutter y el panel usan nombres de campo distintos. Cualquier lectura de `formularios` en el SIGP debe usarlo.
6. **Los roles heredados del panel SST son tres**: `tecnico` (solo app móvil), `sst` (panel web), `admin` (total). El SIGP amplía este esquema — ver capítulo 9 de este archivo.
7. **La marca completa está definida en el CLAUDE.md padre**. Este archivo referencia lo mínimo necesario para el SIGP; ante cualquier duda de color, tipografía o logo, consultar el padre.

**Precedencia ante conflicto:** el CLAUDE.md padre gana en dominios que ya existen (SST, marca, restricciones absolutas). Este gana solo en el dominio nuevo del SIGP. Ante duda, pregunta al usuario.

---

## 1. Qué es este repositorio

El SIGP es el sistema operativo de la operación de proyectos de NEG Ingeniería (Colombia, S.A.S. BIC, NIT 900.975.870-1). NEG presta servicios de ingeniería eléctrica, civil, telecomunicaciones y arquitectónica, y opera hoy con procesos formales del SGI (ISO 9001 + 14001 + 45001) pero con la operación de proyectos viviendo en WhatsApp, Telegram, correo y Excel.

El SIGP cierra ese gap: hace que la operación de proyectos ocurra dentro del sistema, y que la evidencia ISO se genere como **subproducto automático** de operar, no como carga documental adicional.

---

## 2. Filosofía rectora — no negociable

**La evidencia ISO se genera automáticamente como consecuencia de operar, no como carga documental adicional.**

Cada vez que estés diseñando o codificando algo, pregúntate: "¿qué evidencia ISO deja este hito?". Si la respuesta es "hay que llenar un formato adicional", el diseño está mal. La evidencia debe ser el subproducto natural de que alguien hizo su trabajo dentro del sistema.

Corolarios:
- No hay pantallas cuyo único propósito sea "llenar formato para auditoría".
- No se piden datos dos veces.
- Los timestamps, autores y estados son parte del dato, no adjuntos.
- Los PDFs se generan del sistema, nunca se suben a mano si el sistema podía producirlos.

---

## 3. Stack técnico

- **Backend**: Firebase (proyecto `neg-sst-app`) — Firestore + Auth + Storage (SDK v10 modular)
- **Panel web**: React 18 + Vite 5 + Tailwind CSS 3, TypeScript 100%, desplegado en Vercel
- **App móvil**: Flutter (Android primero, iOS después), publicada en Play Store como app SST extendida
- **Routing**: react-router-dom v6
- **Gráficos**: recharts v3
- **Excel**: xlsx (SheetJS) — ya está en el stack para F1 (parser de LPU)
- **PDFs**: `pdf-lib` — **NO instalado hoy**. Se agrega en F0 como preparación para generación de PDFs en el panel (Tarea 1.4.5 del plan F1). Los PDFs actuales del panel SST vienen de la app Flutter (`pdf_url`); el panel solo los muestra.
- **Firebase Storage**: SDK disponible pero **`getStorage()` no está inicializado en `firebase/config.ts`**. Se extiende en F0 antes de arrancar F1 (necesario para el Excel del LPU en Tarea 1.1.4).
- **Testing**: **no hay infraestructura de test instalada hoy**. Vitest + Firebase Emulator Suite se configuran como parte de F0.
- **Notificaciones**: Firebase Cloud Messaging + correo transaccional
- **CI/CD**: GitHub Actions → Vercel (web) y App Distribution (Flutter)

### Repositorios relacionados

- `sst-panel-web/` — panel administrativo (donde vive el SIGP web). ~60% del código base es reutilizable (auth, `components/shared/`, `useFirestore`, patrón Firestore, marca).
- `neg_sst_app/` — app móvil SST + módulo de proyectos para contratistas y personal de campo.

**Regla dura**: nada en el SIGP puede romper la funcionalidad SST en producción. Los cambios que tocan colecciones compartidas (`users`, `formularios`, `obras`, `contratistas`, `notificaciones`) requieren pruebas de regresión SST.

---

## 4. Marca y estilo visual

La marca completa está definida en el CLAUDE.md padre. Aquí solo el resumen operativo:

- **Verde primario**: `#628E3A` = `brand-600` en Tailwind
- **Verde oscuro (estados activos)**: `#4F7330` = `brand-700`
- **Acento lima**: `#D7DA33` = `accent`. Usar con moderación — muy saturado, no para texto pequeño.
- **Neutros**: negro `#000000`, gris oscuro `#454545`, fondo gris claro `#EFF1F4`. Tarjetas blancas con borde 1px.
- **Semánticos SST** (estados de revisión, no de marca): pendiente ámbar, aprobado emerald, rechazado red.
- **Tipografía UI**: Montserrat (`font-sans` / `font-display`) en pesos 400, 500, 600, 700. Weights 300 e italic prohibidos en UI general.
- **Slogan**: solo Lato italic (`font-slogan`), reservado para *"Ingeniería que cambia el mundo"*.
- **Logo símbolo**: `public/logo-neg.png` (turbina Pelton).
- **Logo completo**: `public/logo-neg-full.png` (con sello Sociedades BIC).
- **Tono**: profesional, directo, técnico, sin adornos. Nunca infantil, nunca corporativista genérico.
- **UI inspiración**: Linear/Vercel. Sidebar claro (blanco, ítem activo verde). Prohibido: glassmorphism, modo oscuro forzado, cualquier color azul.

⚠️ **Nota histórica**: sesiones tempranas asumieron paleta azul (`blue-700/900`) que quedó obsoleta tras el rebrand del 28-may-2026. Cualquier azul en el código es error, no legado válido.

En PDFs generados (cotizaciones, actas, informes) usar `Plantilla_de_documento.docx` como referencia estructural.

---

## 5. Restricciones críticas

1. **Cero borrado físico**. Todo es soft-delete con `estado: archivado` o `activo: false`. La trazabilidad ISO no perdona registros perdidos.
2. **Versionado de documentos**. Cotizaciones, actas y liquidaciones se versionan (`version: int`); nunca se sobrescriben.
3. **Snapshots de datos volátiles**. Los precios del LPU se copian en la cotización al crearla — no se referencian por FK. Si el LPU cambia, las cotizaciones históricas quedan intactas.
4. **Consecutivos transaccionales**. Formatos con año en el ID (`OFR-2026-001`, `PRY-2026-001`, `FAC-2026-001`) generados con transacciones Firestore atómicas — nunca en cliente.
5. **No tocar el SST en producción**. La app Flutter (`neg_sst_app/`) no se modifica bajo ninguna circunstancia. Cualquier cambio a colecciones compartidas (`users`, `formularios`, `obras`, `contratistas`, `notificaciones`) debe ser retrocompatible y probarse primero en Firebase Emulator Suite contra el flujo SST completo.
6. **Cloud Functions y reglas Firestore — aprobación explícita para producción**. Diseñar, escribir y probar en Firebase Emulator Suite es libre. Deploy a producción requiere OK explícito del usuario en cada caso. No hay excepciones "porque es un cambio menor".
7. **Autenticación obligatoria**. Ninguna colección tiene reglas `allow read/write: if true`. Todo pasa por `request.auth.uid` y rol.
8. **PDFs con hash**. Cada PDF generado guarda su hash SHA-256 en el documento correspondiente — evidencia de integridad.
9. **Consulta, no gestión — patrón para módulos externos**. El módulo de proyectos **consume estados** de otros módulos (SGI, administrativa) pero **no los escribe**. Los dominios externos hoy incluyen: habilitación SST del contratista (escrita por SGI) y ciclo financiero de anticipos, pagos y facturación (escrita por gerencia administrativa). Ver reglas 7.2 y 7.6.

---

## 6. Modelo de datos (resumen por dominio)

El modelo completo está en el ERD (`ERD_SIGP_NEG.pdf`). Aquí el mapa mental por dominio:

### Dominio comercial (Fase 1)
- `clientes` — con `tiene_lpu` y `tipo_documento_cierre` (acta o liquidación)
- `lpu_clientes` — lista de precios unitarios (Excel del cliente parseado a items[])
- `solicitudes` — con `origen` (info_suficiente / insuficiencia / solicitud_cliente)
- `visitas_tecnicas` — opcional, cuelga de la solicitud
- `cotizaciones` — con `modo: lpu|libre`, `version`, `items_snapshot`

### Dominio proyecto (núcleo, Fase 2)
- `proyectos` — con `valor_venta_vigente` (actualizable por ajustes)
- `asignaciones` — 1:1 con proyecto, referencia al contratista con criterio y puntaje
- `preliquidaciones` — 1:1 con proyecto, valor_venta / valor_contratista / utilidad / anticipo_pct
- `contratistas` — compartido con SST; `estado_habilitacion` es escrito por SGI, leído por SIGP

### Dominio ejecución (Fase 3)
- `avances` — fotos por actividad, subidas por el contratista
- `ajustes_obra` — tipificados: `interno` (solo utilidad) o `adicional_cliente` (afecta venta y liquidación)
- `documentos_cierre` — colección genérica que soporta actas de entrega Y liquidaciones finales, tipificada por `tipo_documento`

### Dominio financiero (Fase 4) — gestionado por administrativa
- `facturas` — ligadas a `documento_cierre_id`, no directo al proyecto
- `pagos` — con `tipo`: `anticipo_contratista`, `pago_cliente`, `saldo_contratista`. El saldo no se registra sin un pago del cliente previo.

Ambas colecciones son **escritas por el módulo de gerencia administrativa** (aún por construir). El módulo de proyectos solo las **lee** para mostrar el estado financiero del proyecto. Ver regla 7.6.

### Dominio calidad y aprendizaje (transversal)
- `no_conformidades` — garantías, rechazos, hallazgos de auditoría
- `evaluaciones` — puntaje del contratista al cierre del proyecto
- `satisfaccion` — encuesta corta al cliente al cierre

### Infraestructura
- `consecutivos` — contadores atómicos por tipo y año
- `notificaciones` — reutilizada del sistema SST

### Remote Config
- **`sigp_f1_enabled`** (boolean, default `false`) controla la visibilidad del módulo SIGP en el panel. Se lee vía el hook `useFeatureFlag` (`src/hooks/useFeatureFlag.ts`). Ajustable desde la consola de Firebase sin necesidad de deploy.

---

## 7. Reglas de negocio críticas

Estas reglas están codificadas en el modelo y deben respetarse en la UI y en Cloud Functions:

### 7.1. Snapshot del LPU

Cuando se crea una cotización con `modo = 'lpu'`, los ítems seleccionados y sus precios se **copian** dentro del documento de la cotización (`items_snapshot: array`). Nunca se referencian por FK al LPU en tiempo de lectura. Razón: el LPU del cliente puede cambiar y las cotizaciones históricas deben conservar los precios pactados.

```typescript
// Correcto
cotizacion.items_snapshot = lpu.items
  .filter(item => seleccionadas.includes(item.codigo))
  .map(item => ({ ...item, cantidad: cantidades[item.codigo] }));

// Incorrecto - NO leer LPU al mostrar cotización histórica
cotizacion.items = lpu.items.filter(...);  // rompe historia
```

### 7.2. Gate SST — consulta, no gestión

El módulo de proyectos **nunca** modifica `contratistas.estado_habilitacion`. Solo lo lee. Quien lo actualiza es el módulo transversal de Gestión Integral (SGI). Antes de permitir que un proyecto pase a estado `en_ejecucion`, se valida que el contratista asignado tenga `estado_habilitacion === 'habilitado'`.

Si el contratista no está habilitado, la UI muestra un mensaje claro: "El contratista X está pendiente de habilitación por parte de Gestión Integral" — no ofrece "solucionarlo desde aquí".

### 7.3. Ciclo financiero de dos momentos

El pago al contratista se divide siempre en dos eventos:
1. **Anticipo** (50-65%) al inicio de obra, tras aprobación de la preliquidación.
2. **Saldo** solo después de que exista un `pago` de tipo `pago_cliente` registrado.

Regla en Cloud Function (o en reglas Firestore) que rechaza la creación de un `pago` de tipo `saldo_contratista` si no existe un `pago_cliente` previo para el mismo proyecto.

```typescript
// Pseudocódigo de validación
if (nuevo_pago.tipo === 'saldo_contratista') {
  const hay_pago_cliente = await db.collection('pagos')
    .where('proyecto_id', '==', nuevo_pago.proyecto_id)
    .where('tipo', '==', 'pago_cliente')
    .limit(1).get();
  if (hay_pago_cliente.empty) {
    throw new Error('No se puede pagar saldo al contratista sin pago del cliente registrado');
  }
}
```

### 7.4. Ajustes en obra — tipificación estricta

Todo `ajuste_obra` tiene `tipo`:
- `interno`: error de NEG. `impacto_venta = 0`, `impacto_costo` puede ser positivo o negativo. **No se traslada al cliente.**
- `adicional_cliente`: adición aprobada por el cliente. `impacto_venta` y `impacto_costo` ambos actualizados. Requiere evidencia de aprobación (correo, comunicación).

Al registrar el ajuste, `proyecto.valor_venta_vigente` se actualiza automáticamente. La preliquidación original queda intacta; los ajustes son entidad separada.

### 7.5. Documento de cierre — genérico

`documentos_cierre` soporta dos tipos:
- `acta_entrega` — firmada por el coordinador o supervisor del cliente. Default.
- `liquidacion_final` — firmada por el representante legal del cliente. Ej: Ingemec.

El tipo por default para un cliente viene de `clientes.tipo_documento_cierre`, pero se puede sobreescribir en el proyecto si es necesario. Las facturas se emiten contra el `documento_cierre_id`, nunca directamente contra el proyecto.

### 7.6. Pagos y facturación — consulta, no gestión

El módulo de proyectos **nunca** escribe en `pagos` ni en `facturas`. Estas colecciones son escritas exclusivamente por el módulo de gerencia administrativa (aún por construir). El módulo de proyectos solo las lee para:

- Mostrar el estado financiero del proyecto (anticipo registrado / factura emitida / pago recibido / saldo liquidado).
- Bloquear transiciones de estado que dependen de eventos financieros (ej: no marcar `en_ejecucion` sin `anticipo_contratista` registrado; no marcar `cerrado` sin `saldo_contratista` liquidado).
- Alimentar el dashboard de proyectos con indicadores financieros.

Este es el mismo patrón que se usa para la habilitación SST (regla 7.2): el módulo de proyectos consume el estado, no lo produce.

**Implicaciones para F4**: cuando se llegue a la Fase 4 (Cierre financiero), la decisión de diseño será construir el mini-módulo administrativo como parte de F4, o esperar a que administrativa tenga su propio módulo independiente. La segunda opción es más limpia arquitectónicamente pero deja F4 dependiente de otro entregable. Esa decisión se toma al llegar a F4, no ahora.

**Reglas Firestore** para `pagos` y `facturas`:
- Read: roles `gerencia_administrativa`, `gerencia_general`, `director_proyectos`, `operacion_comercial`, `admin`, `gestion_integral`.
- Write: solo roles `gerencia_administrativa` y `admin`. Ningún componente del módulo de proyectos genera escrituras a estas colecciones.

Cuando el módulo de proyectos necesite mostrar información financiera, siempre usa lecturas de `pagos` y `facturas` filtradas por `proyecto_id`. Nunca calcula ni sintetiza estos datos.

---

## 8. Consecutivos

Formato: `PREFIJO-YYYY-NNN` (padding con 3 dígitos, se extiende a 4 si supera 999 en un año).

| Prefijo | Entidad | Uso |
|---|---|---|
| `SOL` | solicitudes | Registro de solicitud entrante |
| `OFR` | cotizaciones | Cotización enviada al cliente |
| `PRY` | proyectos | Proyecto creado al aprobar cotización |
| `ACT` | documentos_cierre (tipo acta) | Acta de entrega |
| `LIQ` | documentos_cierre (tipo liquidación) | Liquidación final estilo Ingemec |
| `FAC` | facturas | Factura emitida |
| `NC` | no_conformidades | No conformidad registrada |

Los consecutivos se generan con transacciones atómicas Firestore sobre la colección `consecutivos/{prefijo}_{año}`:

```typescript
// Cloud Function o cliente autorizado
const generarConsecutivo = async (prefijo: string, año: number): Promise<string> => {
  return await db.runTransaction(async (tx) => {
    const ref = db.doc(`consecutivos/${prefijo}_${año}`);
    const snap = await tx.get(ref);
    const siguiente = (snap.data()?.ultimo ?? 0) + 1;
    tx.set(ref, { ultimo: siguiente, actualizado: FieldValue.serverTimestamp() });
    return `${prefijo}-${año}-${String(siguiente).padStart(3, '0')}`;
  });
};
```

**Nunca** generar consecutivos con `Date.now()`, hashes o UUIDs. La secuencialidad es evidencia ISO.

---

## 9. Roles y permisos

Los roles viven en `users.rol` y las reglas Firestore los usan para autorizar.

**Roles heredados del panel SST original** (siguen vigentes para el subsistema SST):

- `tecnico` — solo app móvil, sube formularios
- `sst` — panel web, revisa formularios, aprueba/rechaza
- `admin` — total en el panel

**Roles nuevos que introduce el SIGP** (coexisten con los anteriores en la misma colección `users`):

| Rol | Permisos clave |
|---|---|
| `admin` | Todo. Solo para configuración e infraestructura. |
| `gerencia_general` | Aprobación de proyectos > umbral, revisión por la dirección, dashboards ejecutivos |
| `gerencia_administrativa` | Preliquidaciones, pagos, facturación, presupuestos |
| `operacion_comercial` | Solicitudes, cotizaciones, aprobaciones comerciales |
| `director_proyectos` | Proyectos, asignaciones, avances, actas |
| `auxiliar_proyectos` | Apoyo operativo a proyectos: creación de obras y seguimiento (cargo real actual, p. ej. Paula Moreno) |
| `residente_sst` | Visitas técnicas (para levantamiento), lectura de proyectos |
| `gestion_integral` | Habilitación de contratistas, no conformidades, auditorías, indicadores |
| `contratista` | Sube avances por actividad, ve sus proyectos asignados |
| `cliente_final` (futuro) | Ve informes y actas de sus proyectos, aprueba entregas |

### Modelo de acceso por área (Opción C — validado 05-jul-2026)

El acceso a cada panel se determina por **área funcional**, no por listas de roles por-ruta. Dos helpers en `types/sigp/roles.ts` son la fuente única de verdad:

- **`accesoSST(rol)`** → `true` para `sst`, `admin`, `gerencia_general`, `gestion_integral`, `residente_sst`.
- **`accesoSIGP(rol)`** → `true` para `admin`, `gerencia_general`, `gerencia_administrativa`, `operacion_comercial`, `director_proyectos`, `auxiliar_proyectos`, `gestion_integral`.

Cada helper consume su array exportado (`ROLES_CON_ACCESO_SST` / `ROLES_CON_ACCESO_SIGP`), que también alimenta la protección de rutas en `App.tsx` (`<ProtectedRoute rolesPermitidos={ROLES_CON_ACCESO_SIGP}>`) y el filtro del Sidebar. Consecuencia: **cualquier rol con acceso SIGP ve todas las vistas SIGP**; la granularidad fina (qué acciones puede ejecutar dentro de una vista) se maneja **dentro de cada página**, no en el ruteo ni el sidebar.

> `operacion_comercial` (antes `gerencia_comercial`) es un rol **operativo**, no gerencial — refleja la multifuncionalidad real de NEG (personas cumplen funciones comerciales sin cargo comercial dedicado).

Regla base en Firestore rules:

```javascript
function rol() {
  return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.rol;
}
function esRol(r) {
  return request.auth != null && rol() == r;
}
function algunRol(rs) {
  return request.auth != null && rs.hasAny([rol()]);
}
```

### Mapeo de roles heredados a SIGP

Los usuarios existentes con rol `sst` o `admin` en el panel SST tienen acceso al SIGP según su nuevo rol asignado. La migración **no es automática** — cada usuario existente se revisa y se le asigna el rol SIGP correspondiente en un batch de configuración. Un usuario puede tener un solo rol activo. Si necesita acceso a más de un dominio, se le da el rol de mayor privilegio que le corresponda.

Ejemplos de mapeo esperado:
- Usuario con rol `admin` (panel SST) que gestiona proyectos → migra a `director_proyectos` o `gerencia_general` según su función real.
- Usuario con rol `sst` que solo aprueba formularios → migra a `residente_sst`.
- Usuarios `tecnico` (que solo usan la app móvil) no requieren cambio hasta que se implemente el rol `contratista` en F3.

El batch de migración se define y se ejecuta como parte de F0.

---

## 10. Convenciones de código

### Nomenclatura
- **Colecciones y campos Firestore**: `snake_case` en español (`documentos_cierre`, `valor_venta_vigente`)
- **Componentes React**: `PascalCase` en español (`FormularioCotizacion`, `TablaProyectos`)
- **Hooks**: `useAlgo` en camelCase inglés (`useProyectos`, `useConsecutivo`)
- **Tipos TypeScript**: `PascalCase` inglés (`Proyecto`, `Cotizacion`, `AjusteObra`) — cerca del dominio
- **Rutas**: kebab-case español (`/proyectos/nuevo`, `/cotizaciones/:id/editar`)

### Estructura del panel web

**Estructura real: plana, sin `modules/`.** Detectada en Fase 0.0 (03-jul-2026). El SIGP convive con el código SST existente usando **subcarpeta `sigp/`** dentro de cada carpeta de propósito único. No se reorganiza el código actual — Opción A confirmada.

```
sst-panel-web/src/
├── App.tsx, main.tsx, index.css
├── components/
│   ├── [componentes SST existentes]
│   ├── shared/           # librería UI interna: Modal, MultiSelect, TextField, etc.
│   ├── ProtectedRoute.tsx  # (nuevo en F0) reemplaza AdminRoute inline con genérico
│   └── sigp/             # todos los componentes SIGP nuevos
│       ├── clientes/
│       ├── lpu/
│       ├── solicitudes/
│       ├── cotizaciones/
│       ├── proyectos/
│       ├── ejecucion/
│       ├── cierre/
│       └── calidad/
├── pages/
│   ├── [páginas SST existentes]
│   └── sigp/             # páginas SIGP nuevas
├── contexts/             # AuthContext, NotificacionesContext (SST); nuevos contexts del SIGP acá
├── hooks/
│   ├── useFirestore, useModal, useObrasConRegistros (SST)
│   ├── useConsecutivo.ts (nuevo en F0)
│   └── sigp/             # hooks específicos del SIGP (opcional)
├── utils/                # vencimiento.ts (SST); utilidades SIGP acá con prefijo
├── types/
│   ├── formulario.ts     # fuente única SST: Formulario, normalizarDoc, TIPO_LABELS
│   └── sigp/             # tipos SIGP nuevos: Cliente.ts, Cotizacion.ts, etc.
└── firebase/
    ├── config.ts         # (extender en F0) agregar getStorage()
    └── consecutivos.ts   # (nuevo en F0) helper transaccional
```

**Reglas de convivencia:**

1. **Nada del código SST existente se mueve o se renombra en F0.** Se agrega, no se reorganiza.
2. **Componentes SIGP nuevos van dentro de `components/sigp/{subdominio}/`.** Nombre del componente en PascalCase español (`FormularioCotizacion.tsx`).
3. **Páginas SIGP nuevas van en `pages/sigp/`.** Rutas usan prefijo `/sigp/*` (por ejemplo `/sigp/cotizaciones`).
4. **Tipos SIGP nuevos van en `types/sigp/`.** Un archivo por entidad principal (`types/sigp/Cotizacion.ts`).
5. **Componentes compartidos entre SST y SIGP se mantienen en `components/shared/`.** No se duplica.
6. **Las reglas Firestore viven en `firestore.rules` en la raíz del proyecto** (no en `src/firebase/rules/`). Se editan directamente allí.
7. **Migración de `/obras` al SIGP (F0.5.b)**: el módulo Obras tiene ahora ubicación canónica en **`/sigp/obras`** (protegida por `ROLES_CON_ACCESO_SIGP`, visible en el Sidebar SIGP), porque los proyectos SIGP nacen del flujo comercial y las obras son su manifestación física. La ruta **`/obras`** original (admin-only, Sidebar SST) **se conserva** para retrocompatibilidad. Ambas renderizan el mismo componente `Obras.tsx` (no duplicado).

**Reorganización futura**: cuando F1 esté estable y haya cobertura de tests, se puede evaluar migrar a estructura `modules/sst/` + `modules/sigp/` como tarea dedicada. No en F0/F1.

### Tests

- Tests unitarios con Vitest para lógica pura (validaciones, cálculos de utilidad, generación de consecutivos).
- Tests de integración con Firebase Emulator Suite para reglas de seguridad.
- Cada regla de negocio del capítulo 7 debe tener al menos un test que verifique el caso feliz y uno que verifique el rechazo.
- Cobertura mínima objetivo: 70% en `modules/sigp/`.

### Commits

Convención: `<área>: <acción imperativa>` en español.

Ejemplos:
- `cotizaciones: agrega selector de LPU con búsqueda`
- `consecutivos: transacción atómica para OFR`
- `docs: actualiza CLAUDE.md con regla de saldo contratista`

---

## 11. Cuándo consultar al humano

Claude Code debe **detenerse y preguntar** cuando:

1. La tarea implica **modificar colecciones compartidas con el sistema SST** (`users`, `contratistas`, `notificaciones`).
2. La tarea requiere **cambiar reglas de Firestore** en producción.
3. Un requerimiento no encaja con las reglas de negocio del capítulo 7 — probablemente hay que revisar la regla, no forzar la implementación.
4. La solución implica introducir una **nueva librería pesada** (>50 KB) o cambiar el stack.
5. Hay que decidir entre **dos estructuras de datos incompatibles** — la decisión afecta a futuro.
6. Se trata de un **flujo financiero** que no está explícitamente descrito.
7. El resultado impactaría **evidencia ISO histórica** ya emitida.

Frase útil: "Antes de proceder, quiero validar contigo esta decisión porque impacta [X]".

---

## 12. Roadmap F0 → F5

| Fase | Nombre | Alcance |
|---|---|---|
| F0 | Base | Instalar `pdf-lib`; extender `firebase/config.ts` con `getStorage()`; extraer `AdminRoute` inline a `components/ProtectedRoute.tsx` genérico; instalar Vitest y configurar Firebase Emulator Suite; crear estructura `sigp/` en `components/`, `pages/`, `types/`; implementar sistema de consecutivos con Cloud Function (requiere OK del usuario para deploy); layout SIGP y navegación; feature flag `sigp_f1_enabled` en Remote Config; batch de migración de roles heredados. |
| F1 | Comercial | LPU, solicitudes, visitas técnicas, cotizaciones, aprobación cliente. **(Ver `PLAN_FASE_1_SIGP.md`.)** |
| F2 | Planeación | Asignación de contratista con criterio, preliquidaciones, anticipo, gate SST |
| F3 | Ejecución | Módulo app Flutter para contratistas, avances por actividad, ajustes en obra, documentos de cierre |
| F4 | Cierre financiero | Facturación contra documento de cierre, pagos, saldo contratista, evaluación, satisfacción |
| F5 | Cierre ISO | Indicadores automatizados, tablero SGI, auditorías, revisión por la dirección |

### Estado de F0 — ✅ CERRADA (06-jul-2026)

F0 se cerró con el merge del **PR #1** (`sigp/f0-base` → `main`, commit de merge **`3f7673a`**) y el auto-deploy de Vercel a producción **verificado** (https://sst-panel-neg.vercel.app → HTTP 200). **`sigp_f1_enabled` sigue en `false`** → el SIGP está en `main` y desplegado, pero **invisible para todos los usuarios** hasta que F1 esté lista.

- 0.1 ✅ dependencias (pdf-lib, Vitest, Emulator Suite, Storage/Functions en `config.ts`)
- 0.2 ✅ `ProtectedRoute` genérico + estructura de carpetas `sigp/`
- 0.3 ✅ sistema de consecutivos (Cloud Function desplegada y validada en producción)
- 0.4 ✅ layout SIGP + rutas placeholder + sidebar
- 0.5 ✅ refactor de accesos (`accesoSST`/`accesoSIGP`) + Remote Config (`useFeatureFlag`) + migración Obras a `/sigp/obras` + migración de 5 usuarios + creación de 3 nuevos
- 0.6 ✅ reglas Firestore por rol (H-007) + **0.6.a-ter** + regresión SST + merge a `main`

**Sub-bloque 0.6.a-ter (NO estaba en la planificación original):** durante la validación funcional afloró que las reglas Firestore ya eran correctas, pero la UI mostraba elementos que los roles nuevos no debían ver ni usar. Se creó **`types/sigp/permisos.ts`** — fuente única de permisos de UI (helpers `veX(rol)` de visibilidad y `puedeX(rol)` de acción) que alimenta el gating del Sidebar, de las rutas (`ProtectedRoute`) y de los botones de cada página (aprobar/rechazar, gestión de obras, gestión + habilitación de contratistas). Además se desplegó una regla Firestore que permite a `gerencia_administrativa` un `update` limitado de `contratistas` **solo sobre el campo `estado`** (habilitar/deshabilitar), vía `diff().affectedKeys().hasOnly(['estado', 'fecha_actualizacion'])`.

**Seguimiento abierto post-F0:** H-001 (refinamiento opcional), H-004 (bump `firebase-functions` v6), H-005 (CI/CD de functions). Ver `HALLAZGOS_AUDITORIA.md`.

### Estado de F1 (Comercial — en curso)

F1 se desarrolla por sub-iteraciones. Ver `PLAN_FASE_1_SIGP.md`.

- **1.1 ✅ Clientes y gestión de LPU** — cerrada 07-jul-2026 con el merge del **PR #2** (`sigp/f1.1-clientes-lpu` → `main`, commit de merge **`24d1fd3`**). Incluye: CRUD de clientes (contactos, condiciones IVA pleno/AIU); **importador asistido de LPU** (wizard con SheetJS: selección de hojas, mapeo de columnas con heurísticas, vista previa consolidada, escritura de ítems en batches ≤500 + Excel original a Storage + guardado del mapeo en el cliente); **detalle de LPU** con ítems agrupados por categoría/capítulo y **trazabilidad de versiones** (cadena `reemplaza_a`); reglas Firestore (`clientes`/`lpus`/`lpus/{id}/items`) y Storage (`lpus/**`) desplegadas; 19 tests de la lógica del importador. Validada contra producción con la LPU real de IHS (536 ítems). Ver **H-008** en `HALLAZGOS_AUDITORIA.md` (gate cross-service de Storage removido → `auth-only`; hardening por custom claims pendiente).
- **1.2 ✅ Solicitudes** — cerrada 07-jul-2026 con el merge del **PR #3** (`sigp/f1.2-solicitudes` → `main`, commit de merge **`d2ba9cf`**). Incluye: bandeja de entrada `/sigp/solicitudes` (lista + filtros + stats); **registro** con consecutivo `SOL-YYYY-NNN` vía la Cloud Function `generarConsecutivo` (con manejo de fallo tras consumir el número: se preserva y se reintenta sin quemar otro → evita huecos accidentales) + adjuntos a Storage; origen flexible `cliente_id` o `prospecto_nombre` (al menos uno); **detalle** con timeline del historial y **máquina de estados** (`TRANSICIONES`, motivo obligatorio al descartar, correcciones hacia atrás auditadas; `cotizada` reservada a F1.4, `descartada` terminal); reglas Firestore (`solicitudes`) y Storage (`solicitudes/**` auth-only) desplegadas; tests de la máquina de estados. Validada contra producción. `useConsecutivo` se hizo *lazy* (callable creado en la llamada, no al importar).
- **1.3 ✅ Visitas técnicas** — cerrada 07-jul-2026 con el merge del **PR #4** (`sigp/f1.3-visitas` → `main`, commit de merge **`3965693`**). Incluye: bandeja `/sigp/visitas` (filtros estado/tipo/cliente, badge NEG vs Contratista); **programar** visita (origen solicitud en `requiere_visita` con autocompletado, o cliente/prospecto; ejecutor NEG o contratista activo) con consecutivo `VIS-YYYY-NNN` (mismo manejo de fallo/reintento que SOL); **ejecución mobile-first** (checklist por tipo — estación base greenfield/rooftop —, hallazgos con foto de cámara, plano como foto del sketch, cantidades preliminares, guardado parcial que no pierde datos); **transición cruzada**: al marcar realizada, la solicitud vinculada en `requiere_visita` pasa a `lista_para_cotizar` con entrada de historial que referencia la visita. Cloud Function `generarConsecutivo` + prefijo `VIS` (desplegada); reglas Firestore (`visitas`) y Storage (`visitas/**` auth-only) desplegadas. Validada contra producción, incluida la captura mobile en celular real.
- **1.3-bis ✅ Shell del panel responsive** — cerrada 07-jul-2026 con el merge del **PR #5** (`sigp/f1.3-bis-shell-responsive` → `main`, commit de merge **`79ff369`**). En móvil (< lg, 1024px) el sidebar es un **cajón (drawer)** off-canvas con backdrop, abierto por la hamburguesa y cerrado al navegar o tocar fuera; contenido a ancho completo. En escritorio (≥ lg) el sidebar sigue en flujo y colapsable (rail) **sin cambios**. Nuevo `hooks/useMediaQuery.ts`; toda la lógica nueva detrás de `< lg` (regresión SST verificada). Validado en celular real. Se agregó `sst-panel-web/.claude/launch.json` con `--host` como infra de validación móvil por LAN.
- **1.4 ⏳ Cotizaciones** — siguiente sub-iteración. Al crear una cotización (desde una solicitud en `lista_para_cotizar`), la solicitud pasará a `cotizada` automáticamente; alimentada por LPU (snapshot de precios) y por las cantidades preliminares de la visita.

**`sigp_f1_enabled` sigue en `false`**: el SIGP está en `main` y desplegado, pero invisible para los usuarios hasta que F1 esté completa y se decida activarlo.

Cada fase termina con: reglas de seguridad actualizadas, tests verdes, deploy a producción con feature flag, y un chequeo de brechas ISO cubiertas.

---

## 13. Documentos SGI del proyecto (referencia)

Estos documentos viven en el Project de Claude y son la fuente de verdad para las reglas de negocio, políticas y estructura organizacional:

- `DOCUMENTO_MAESTRO_SIGP_NEG.md` — visión estratégica del SIGP
- `POLITICA_INTEGRADA_DE_GESTION_Y_OBJETIVOS_ESTRATEGICOS.docx` — política ISO
- `CARACTERIZACION_INTEGRAL__GERENCIA_DE_PROYECTOS.xlsx` — proceso proyectos
- `CARACTERIZACION_INTEGRAL_GERENCIA__COMERCIAL.xlsx` — proceso comercial
- `MT_INDICADORES_DEL_SGI.xlsx` — indicadores que el SIGP debe alimentar
- `MT_RIESGOS_Y_OPORTUNIDADES.xlsx` — riesgos que el sistema debe mitigar
- `LISTADO_MAESTRO_DE_DOCUMENTOS_Y_CONTROL_DE_REGISTROS.xls` — catálogo documental
- `DC_ORGANIGRAMA.pdf` — estructura de roles

Ante duda sobre alcance ISO o proceso NEG, consultar estos documentos antes que la web.

---

## 14. Contacto

Este repositorio es propiedad de NEG Ingeniería S.A.S. BIC. La dirección técnica del SIGP la lleva la Gerencia con soporte del equipo de Gestión Integral. Cualquier PR que toque las reglas del capítulo 7 requiere revisión de la Gerencia.

*Última actualización de este archivo: 07 de julio de 2026, tras el cierre de F1.3 (Visitas técnicas) y 1.3-bis (shell responsive). Versión: 1.3.1.*
