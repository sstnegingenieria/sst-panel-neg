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

### Estado de F1 (Comercial) — ✅ FUNCIONALIDAD COMPLETA (11-jul-2026)

F1 se desarrolló por sub-iteraciones (ver `PLAN_FASE_1_SIGP.md`). Con el merge de F1.4-B el flujo comercial funciona de punta a punta: solicitud → visita técnica → cotización (LPU/catálogo/APU, con análisis económico interno) → envío con PDF → aprobación con evidencia. Queda **F1.5 (refinamientos comerciales)** como iteración de pulido antes de decidir la activación del flag.

- **1.1 ✅ Clientes y gestión de LPU** — cerrada 07-jul-2026 con el merge del **PR #2** (`sigp/f1.1-clientes-lpu` → `main`, commit de merge **`24d1fd3`**). Incluye: CRUD de clientes (contactos, condiciones IVA pleno/AIU); **importador asistido de LPU** (wizard con SheetJS: selección de hojas, mapeo de columnas con heurísticas, vista previa consolidada, escritura de ítems en batches ≤500 + Excel original a Storage + guardado del mapeo en el cliente); **detalle de LPU** con ítems agrupados por categoría/capítulo y **trazabilidad de versiones** (cadena `reemplaza_a`); reglas Firestore (`clientes`/`lpus`/`lpus/{id}/items`) y Storage (`lpus/**`) desplegadas; 19 tests de la lógica del importador. Validada contra producción con la LPU real de IHS (536 ítems). Ver **H-008** en `HALLAZGOS_AUDITORIA.md` (gate cross-service de Storage removido → `auth-only`; hardening por custom claims pendiente).
- **1.2 ✅ Solicitudes** — cerrada 07-jul-2026 con el merge del **PR #3** (`sigp/f1.2-solicitudes` → `main`, commit de merge **`d2ba9cf`**). Incluye: bandeja de entrada `/sigp/solicitudes` (lista + filtros + stats); **registro** con consecutivo `SOL-YYYY-NNN` vía la Cloud Function `generarConsecutivo` (con manejo de fallo tras consumir el número: se preserva y se reintenta sin quemar otro → evita huecos accidentales) + adjuntos a Storage; origen flexible `cliente_id` o `prospecto_nombre` (al menos uno); **detalle** con timeline del historial y **máquina de estados** (`TRANSICIONES`, motivo obligatorio al descartar, correcciones hacia atrás auditadas; `cotizada` reservada a F1.4, `descartada` terminal); reglas Firestore (`solicitudes`) y Storage (`solicitudes/**` auth-only) desplegadas; tests de la máquina de estados. Validada contra producción. `useConsecutivo` se hizo *lazy* (callable creado en la llamada, no al importar).
- **1.3 ✅ Visitas técnicas** — cerrada 07-jul-2026 con el merge del **PR #4** (`sigp/f1.3-visitas` → `main`, commit de merge **`3965693`**). Incluye: bandeja `/sigp/visitas` (filtros estado/tipo/cliente, badge NEG vs Contratista); **programar** visita (origen solicitud en `requiere_visita` con autocompletado, o cliente/prospecto; ejecutor NEG o contratista activo) con consecutivo `VIS-YYYY-NNN` (mismo manejo de fallo/reintento que SOL); **ejecución mobile-first** (checklist por tipo — estación base greenfield/rooftop —, hallazgos con foto de cámara, plano como foto del sketch, cantidades preliminares, guardado parcial que no pierde datos); **transición cruzada**: al marcar realizada, la solicitud vinculada en `requiere_visita` pasa a `lista_para_cotizar` con entrada de historial que referencia la visita. Cloud Function `generarConsecutivo` + prefijo `VIS` (desplegada); reglas Firestore (`visitas`) y Storage (`visitas/**` auth-only) desplegadas. Validada contra producción, incluida la captura mobile en celular real.
- **1.3-bis ✅ Shell del panel responsive** — cerrada 07-jul-2026 con el merge del **PR #5** (`sigp/f1.3-bis-shell-responsive` → `main`, commit de merge **`79ff369`**). En móvil (< lg, 1024px) el sidebar es un **cajón (drawer)** off-canvas con backdrop, abierto por la hamburguesa y cerrado al navegar o tocar fuera; contenido a ancho completo. En escritorio (≥ lg) el sidebar sigue en flujo y colapsable (rail) **sin cambios**. Nuevo `hooks/useMediaQuery.ts`; toda la lógica nueva detrás de `< lg` (regresión SST verificada). Validado en celular real. Se agregó `sst-panel-web/.claude/launch.json` con `--host` como infra de validación móvil por LAN.
- **1.4-A ✅ Cotizaciones (núcleo)** — cerrada 11-jul-2026 con el merge del **PR #6** (`sigp/f1.4a-cotizaciones` → `main`, commit de merge **`e5ef54a`**). Incluye: **modelo** — una cotización = un `COT-YYYY-NNN` con **versiones en subcolección** (`cotizaciones/{id}/versiones/{n}`, cada versión un snapshot completo con ítems inline, por el límite de 1MB/doc; el padre denormaliza total/estado/versión activa para la bandeja); **esquema tributario por cotización** (`iva_pleno` | `aiu` con IVA solo sobre la Utilidad — verificado contra el modelo Excel real), pre-sugerido desde las condiciones comerciales del cliente y siempre editable; `calcularTotales` con **redondeo a peso por componente** (CD/A/I/U/IVA/Total — el snapshot coincide con el PDF futuro); campo **`asunto`** (plantilla CM-FT-CT-19); estado `vencida` **derivado** en UI (enviada + validez vencida, no se almacena). **Bandeja** `/sigp/cotizaciones` (stats, filtros, columna Asunto). **Crear** desde solicitud `lista_para_cotizar` (transición automática a `cotizada` con historial referenciando el COT-; mismo manejo de fallo/reintento de consecutivo que SOL/VIS) o directa (cliente/prospecto). **Constructor de ítems**: buscador del LPU vigente (snapshot `origen:'lpu'` con trazabilidad `lpu_id`/`lpu_item_id`, **unidad heredada solo lectura**), ítems manuales, prellenado desde cantidades de la visita, capítulos con subtotales, descripción expandible a fila full-width, ítems en $0 advertidos sin bloquear (resalte ámbar), formato monetario es-CO. **Ciclo de estados**: `borrador→enviada→aprobada|rechazada` — enviar congela el snapshot (guarda antes) + `fecha_envio`; **aprobar exige evidencia adjunta** (validación dura, Storage `cotizaciones/**`); rechazar exige motivo; **nueva versión** desde enviada/rechazada/vencida (copia completa como borrador v+1, nunca desde aprobada); timeline del historial + comparación de versiones. **Desplegado con OK explícito**: reglas Firestore (`cotizaciones` + `versiones`), Storage (`cotizaciones/**` auth-only, H-008) y prefijo `COT` en `generarConsecutivo`. **H-009**: la LPU IHS se había importado con `unidad` vacía (encabezados en inglés, "UNIT OF MEASUREMENT"); heurística de mapeo extendida a plantillas bilingües + **backfill autorizado en prod (536/536 ítems, verificado)** — ver `HALLAZGOS_AUDITORIA.md`. Tests 26 → **35**. Validada contra producción (3 rondas de ajustes de Giovanny).
- **1.4-B ✅ Cotizaciones — APU, catálogo NEG, PDF y refinamientos** — cerrada 11-jul-2026 con el merge del **PR #7** (`sigp/f1.4b-apu-catalogo-pdf` → `main`, commit de merge **`9bde6f9`**). Incluye: **constructor APU** (formato canónico APU_CLARO_113: 5 secciones fijas — mano de obra, materiales, equipo, transporte, herramienta menor — insumos con `rendimiento` decimal fino, costo directo → margen [0,100) → precio sugerido; APU embebido como snapshot, `origen: 'apu'`); **análisis económico interno** (réplica DC-FT-CT-24, jamás en el PDF: `costo_directo`/`margen` por ítem — margen = % utilidad sobre el precio, factor 0,9 = 10% — con goal-seek bidireccional, peso económico, y tarjeta Todo Costo / Utilidad $ / % Utilidad que excluye y advierte ítems sin costo); **catálogo NEG** (`catalogo_items`: códigos **INP-NNN** temporales por versión vía `asignarCodigosINP`, incorporación al enviar con prompt por ítem — solo el "sí" quema un **CAT-NNNN** transaccional server-side de contador **acumulativo sin año** — o botón 📚 por ítem; **idempotente** vía `catalogo_id`; buscador dual LPU/catálogo con badges); **agrupador** capítulos/actividades a nivel VERSIÓN (reetiquetado del campo `capitulo` — la entidad "actividad" real quedó para F1.5); **OPEX/CAPEX** opcional (badge + filtro, no sale al PDF); indicador **"hace N días"** escalonado junto a Enviada; **PDF al enviar** (pdf-lib + `@pdf-lib/fontkit`, client-side: formato ISO **CM-FT-CT-19 v05 JUL-2026** modernizado con marca NEG, Montserrat/Lato OFL embebidas desde `public/fonts/`, tabla agrupada según agrupador, totales por esquema, firma con celular del perfil si existe; **SHA-256 en `pdf_hash`** — regla 8 —, un PDF inmutable por versión enviada en `cotizaciones/{id}/v{n}.pdf`, descargable; fallo de generación aborta el envío). Reglas Firestore (`catalogo_items`) y prefijo `CAT` en `generarConsecutivo` desplegados con OK explícito y verificados live. Tests 35 → **46**. Validada contra producción. Pendiente post-F1: campo `celular` en perfiles de usuario (toca `users`, compartido con SST).
- **1.5 ✅ Refinamientos comerciales — COMPLETA (12-jul-2026, puntos 1–4 ✅).** Pendiente de F1.5 solo el backlog PDF (abajo).
  1. ✅ **Evaluador de expresiones matemáticas en campos numéricos** — HECHO (12-jul-2026, **PR #10**, commit de merge **`4190a33`**, validado por Giovanny): `evaluarExpresion()` en `utils/sigp/expresion.ts` acepta `20.23*5`, `1/54`, `(15+3)*2` y evalúa al confirmar (blur/Enter). **Implementado con PARSER PROPIO recursivo-descendente, sin dependencia externa** — mathjs se probó y se DESCARTÓ por peso (+93KB gzip aun restringido por factory); el parser (~70 líneas) cuesta ~1KB y pasa la misma batería de tests (el contrato: 23 tests, incluidos 14 intentos de inyección). **Sin `eval`**: whitelist de caracteres + gramática que solo conoce números, `+ − * /` (menos unario), paréntesis y multiplicación implícita; coma y punto como decimal; sin miles dentro de la expresión; división por cero → error; resultado con precisión completa. Aplicado vía `InputExpresion` en: **cantidades** (todas las filas), **valor unitario** (solo manuales — LPU/catálogo bloqueados por fidelidad), **costo interno del análisis 📊** (con vaciado → limpia costo y margen), y **rendimiento/costo del modal APU** (inválidas bloquean "Aplicar"). Inválida → campo en rojo con motivo, no persiste, conserva el texto.
  2. ✅ **Actividades como entidad propia** — HECHO (12-jul-2026, **PR #8**, commit de merge **`ac287b3`**, validado funcionalmente por Giovanny). Entregado: **modelo** `modo_agrupacion: 'capitulo' | 'actividad'` a nivel versión (default lazy 'capitulo', sin migración; versiones aprobadas intactas) + **`Actividad { id, nombre, orden }`** + **ítem como INSTANCIA** (`instancia_id` uuid local — key de React/asignación; el mismo `codigo` puede repetirse en varias actividades volviéndolo a buscar en el buscador dual); `subtotalesPorGrupo` (antes de impuestos; Σ = costos directos; 'Otros' para huérfanos) integrado a `calcularTotales` (5º parámetro opcional — impuestos byte-idénticos a F1.4); **UI**: selector de modo con siembra capítulo→actividad (una actividad por capítulo; la vuelta es no destructiva), panel de actividades (crear/renombrar libre/reordenar/eliminar → ítems a 'Otros'), select de actividad por ítem; **bloqueo de fidelidad comercial**: ítems de origen LPU o catálogo (`esItemBloqueado`) con código/descripción/unidad/precio en solo lectura y defensa en profundidad en `patchInstancia` (ni por código se muta el snapshot; margen derivado, costo interno editable, cantidad siempre editable) — la duplicación de instancias "Añadir a…" se retiró; **PDF** agrupado por actividades/capítulos con la misma fuente de subtotales. Tests 46 → **63**. Sin cambios en reglas/functions/storage.
  3. ✅ **Numeración de versiones de cara al cliente** — HECHO (12-jul-2026, **PR #9**, commit de merge **`524820a`**, validado por Giovanny): `etiquetaVersion()` en `utils/sigp/formato.ts` (≤1 → sin sufijo; ≥2 → 'vN') aplicada en bandeja, header/banner/botón PDF del detalle, timeline, confirms de acciones, comparación de versiones ("1ª emisión" para v1) y el PDF (título del doc, encabezados). El `version` interno (1, 2, 3…) NO cambia — solo presentación.
  4. ✅ **Máximo 2 decimales en UI y PDF** — HECHO (misma rama, validado): `fmtNum`/`fmtMoney` en `utils/sigp/formato.ts` como fuente única (es-CO, miles '.', decimales ','; enteros limpios) aplicados a cantidades, valores, subtotales por grupo, cuadro de totales, análisis 📊 (costo/margen/peso), modal APU (rendimientos solo-lectura) y todo número del PDF. **Precisión interna intacta**: el recorte es solo de render; los campos editables conservan el valor completo (testeado).
  - 🧰 **Ajuste UX (misma rama)**: ancho de la tabla de ítems del constructor — con Análisis económico ON la vista va a ancho completo (totales/resumen bajan como tarjetas), columnas con min-width justo, descripción con elipsis+tooltip, encabezado y columnas Código/Descripción sticky. **Solo layout** — sin cambio de datos, columnas ni matemática. Verificado sin scroll horizontal a ≥1280px en ambos modos; móvil intacto.

  5. ✅ **Backlog PDF · M1 — rediseño del PDF como "propuesta económica"** — HECHO (15-jul-2026, **PR #11**, commit de merge **`94424b6`**, iterado en 5 rondas con Giovanny hasta versión final). El PDF dejó de ser un "formato de cotización" y se compone como propuesta económica de firma de ingeniería (elegancia/sobriedad/"menos es más"). **El cuadro ISO de control documental superior quedó INTACTO** (premisa dura). Entregado en `utils/sigp/cotizacionPdf.ts`:
     - **Encabezado**: el ASUNTO es el título del documento (14pt, con ajuste editorial: línea 1 respeta el consecutivo, línea 2 a la "Versión N", y si no cabe en 2 líneas baja a 12pt/3 líneas antes de elidir) + subtítulo "Propuesta económica"; consecutivo verde 17pt a la derecha con **"Versión N" discreta debajo** (solo v≥2). El cuadro "Asunto de la oferta" se eliminó.
     - **Tarjeta de datos** (2 columnas, iconografía de línea): cliente, NIT, **CONTACTO** (campo nuevo `Cotizacion.contacto` — prellenado con el contacto principal del cliente al crear, editable en borrador junto al asunto, oculto si vacío), fecha, validez, moneda.
     - **Introducción institucional** (2 líneas): "Apreciado(a) [contacto]:" (o "Apreciados señores:") + saludo genérico sin mencionar actividades específicas.
     - **Tabla**: filas alternadas `#F0F2F0`; grupos sobre fondo blanco con icono+nombre en **gris oscuro** (decisión final: menos verde = más seriedad), subtotal en negro, regla divisoria 1.1pt y aire entre grupos; columna CÓDIGO con respiración interna extra.
     - **Resumen económico**: tarjeta con filas alternadas y barra TOTAL verde (11/13pt — protagonista sin estridencia).
     - **Pie INSTITUCIONAL idéntico en todas las páginas**: logo gris con eslogan y sello BIC (`public/logo-neg-gris.png`, derivado de `LOGOS/Logo Neg con bic vectores-4.png`) 140pt a la izquierda, **QR estático** a `negingenieria.com` al centro (`public/qr-web.png`), redes/web/teléfonos a la derecha. Los datos del cotizador van UNA sola vez, al cierre del contenido (sección "COTIZADO POR" con **área de firma de 48pt** para firma manuscrita/digital futura).
     - **Espacio**: `MARGEN_INF` 152→118; cotizaciones cortas tienden a 1 página sin forzar; títulos de sección nunca quedan huérfanos al pie (reserva del primer contenido en `seccion()`).
     - Del backlog original quedaron resueltos: **a) tagline** — CERRADO 15-jul-2026: Giovanny confirmó *"Ingeniería que cambia el mundo"* (frase inspirada en Isaac Asimov) y el asset `logo-neg-full.png` verificado visualmente YA lo trae correcto (la observación de "CONSTRUYE SOLUCIONES" era del reconocimiento de julio, obsoleta tras el rebrand de mayo); b (grupos huérfanos = 'Otros', por 1.5.2), c (QR/redes reales), e (filas vacías ocultas), f (por 1.5.3/1.5.4), g (iconos vectoriales monocromos, B/N digno); d (multipágina) por M2. **Backlog PDF: sin pendientes.**
  6. ✅ **F1.5.5 — Condiciones elegibles, notas base y cuadro ISO en negro** (15-jul-2026, mismo **PR #11**, merge `94424b6`): **presets de condiciones comerciales** (`PRESETS_FORMA_PAGO/TIEMPO_EJECUCION/GARANTIA` en `types/sigp/cotizacion.ts` — datalist: elegible O texto libre, en creación y en detalle; ajustar las listas con el área comercial); **texto base de "Notas importantes"** (`OBSERVACIONES_BASE` — sembrado al crear, botón "Insertar texto base" en borradores vacíos, una nota por línea → viñetas del PDF); **cuadro ISO todo en letras negras** (sin verde, estructura intacta); banda del encabezado de tabla se probó en gris carbón y **volvió a verde** por decisión de Giovanny. El formato queda a la espera de la revisión del área comercial.
  7. ✅ **Backlog PDF · M2 — robustez multipágina** — HECHO (15-jul-2026, **PR #12**, commit de merge **`c3d0c6d`**, validado por Giovanny con oferta de 36 ítems / 4 páginas). Solo `utils/sigp/cotizacionPdf.ts`: encabezado corrido de páginas 2+ con **control documental "CM-FT-CT-19 · v05"** a la derecha (consecutivo · Versión N a la izquierda; el cuadro ISO completo NO se repite); **keep-with real de grupos** (el encabezado de actividad/capítulo entra solo si cabe con su primera fila completa, medida real); **"(cont.)"** al reanudar un grupo tras salto de página (sin repetir subtotal — evita lectura de doble suma); título de NOTAS reserva la altura de su primera cláusula. Ya existían de M1 y quedaron verificados: filas nunca partidas, encabezado de columnas repetido por página, "Página X de Y" post-paginado, tarjeta TOTAL/condiciones/firma indivisibles, pie institucional idéntico en todas las páginas. Regresión: cotización corta byte-idéntica a M1 salvo la etiqueta del encabezado corrido. Con esto queda cubierto el pendiente d) del backlog (validar además con un acta real de Claro cuando llegue el caso de uso).
  8. ✅ **PDF — descripción completa de ítems** — HECHO (16-jul-2026, **PR #15**, commit de merge **`d2cbb05`**, detectado por Giovanny en el piloto con un ítem de catálogo de alcance largo). La tabla limitaba cada descripción a 2 líneas con elipsis (herencia de M1); ahora se pinta COMPLETA — la descripción es el alcance pactado con el cliente. Tope de 20 líneas solo como seguro anti-desborde (una fila jamás supera la página; el corte por fila completa de M2 se mantiene). Verificado con oferta de 5 páginas (descripciones de 4-5 líneas + grupos "(cont.)").
  9. ✅ **PDF — refinamientos de tabla del piloto** — HECHO (16-jul-2026, **PR #16** merge **`0c90265`** + **PR #17** merge **`e7841ad`**, observaciones de Giovanny sobre COT-2026-010): versales del encabezado centradas ópticamente en la banda de 19pt; DESCRIPCIÓN +22pt de ancho (CANT 46→36, VR. UNITARIO 82→70; montos largos verificados); el primer grupo (y los "(cont.)" tras salto de página) pegado a la banda del encabezado — el aire de 16pt va ENTRE grupos; regla de cierre al final de la tabla.
  10. ✅ **Descarga del PDF con nombre de archivo propio** — HECHO (16-jul-2026, **PR #18**, commit de merge **`497100f`**, pedido por Giovanny): el botón 📄 descarga como blob con nombre "COT-YYYY-NNN [vN] - CLIENTE.pdf" (el atributo `download` no aplica cross-origin sobre Storage); fallback a pestaña si el fetch falla; enlace secundario "ver" para previsualizar. E2E en emulador. **CORS del bucket configurado en producción** (16-jul, vía API de GCS con la service account): sin CORS el fetch del blob fallaba en prod y el botón caía al fallback de pestaña; quedó GET/HEAD para `https://sst-panel-neg.vercel.app` + localhost 5173/5174, `maxAgeSeconds: 3600` — NO toca reglas de seguridad de Storage (la autorización sigue siendo el token de la URL). El emulador permite todo CORS: este tipo de fallo SOLO se ve en producción. ⚠️ Lección del piloto: el PDF se genera EN EL NAVEGADOR — tras cada deploy hay que RECARGAR el panel antes de generar (una pestaña vieja produce el PDF viejo); considerar aviso automático de "versión nueva del panel" como mejora futura.
  11. 🧹 **Limpieza autorizada de producción** (16-jul-2026): las 9 cotizaciones de prueba (COT-2026-001…009) borradas con versiones y archivos de Storage; SOL-2026-002 (Titan) devuelta a `lista_para_cotizar` con historial; el contador de consecutivos NO se tocó (la primera real del piloto es COT-2026-010; los huecos 001–009 fueron pruebas del arranque — dejar nota en el SGI).

**🚀 `sigp_f1_enabled` = `true` — ACTIVADO el 16-jul-2026** (autorizado por Giovanny tras el pre-vuelo de activación: 5 roles × 5 módulos sin errores, reglas prod == HEAD, Functions y Storage sanos). El módulo comercial SIGP es visible en el sidebar para los 6 usuarios con rol SIGP; `tecnico` y `sst` no ven cambios. Reversión: editar el parámetro en Remote Config → `false` → Publicar (2 minutos, sin deploy).

**Rebrand del panel** (16-jul-2026, **PR #13**, merge **`00df9b5`**): el nombre global pasó de "Panel SST" a **"Panel del Sistema de Gestión Integral"** (pestaña, login y sidebar); "SST" se conserva como nombre de área. Solo texto visible.

**UX: LPU vive en el detalle de Cliente** (20-jul-2026, **PR #24**, commit de merge **`0568e01`**, validado por Giovanny — resuelve el pendiente de UX "LPU como pestaña del detalle de cliente"): nueva página `/sigp/clientes/:clienteId` (`ClienteDetalleSigp`) con pestañas **Información** (contactos + condiciones) y **Listas de precios (LPU)** — la tabla de LPUs del cliente (vigente/histórica) y el wizard de importación **pre-scopeado** (selector de cliente bloqueado vía `clienteIdInicial`, capacidad que el wizard ya traía). El ítem "LPU" se retiró del sidebar; **`/sigp/lpus` redirige a Clientes** (enlaces guardados no se rompen); `/sigp/lpus/:lpuId` (detalle de una LPU) sigue vivo con back-link al cliente; `LpusSigp.tsx` eliminado. **Solo navegación/UI**: modelo `lpus`, subcolección items, SheetJS, mapeos, Storage, reglas y el buscador LPU del cotizador quedan INTACTOS (regresión verificada E2E). Cambio VISIBLE en producción al mergear (F1 en vivo; solo Vercel, sin reglas/functions).

**UX: historial de contactos del cliente en Solicitudes** (20-jul-2026, **PR #25**, commit de merge **`09bf349`**, validado por Giovanny — mejora de piloto, F1 en vivo): el formulario de Solicitud reutiliza **`clientes.contactos[]` como historial** — con cliente registrado el contacto se ELIGE de un selector (prefill: el principal, índice 0; tarjeta resumen de solo lectura), y **"＋ Nuevo contacto…"** abre los campos libres y al registrar la solicitud lo AÑADE al cliente vía `arrayUnion` (sin duplicar, comparación por nombre normalizado; el padre recarga clientes → aparece en la siguiente solicitud sin refrescar). Prospecto sigue texto libre; la solicitud guarda el MISMO campo `contacto` de siempre (cotizaciones y preventivos intactos); reglas ya lo permitían (write clientes = puedeGestionarProyectos). Merge visible en producción; sin reglas/functions.

### Estado de F2 (Planeación / Ejecución) — EN CURSO

**TODA la Fase 2 va detrás del flag Remote Config `sigp_f2_enabled` (default `false`)**: con el flag apagado el módulo Proyectos es invisible y el gancho de creación es inerte — F1 en producción queda intacto. Override local vía `.env.local` (`VITE_FF_sigp_f2_enabled=true`), mismo patrón que F1.

- **2.1.a ✅ Ficha de Proyecto (columna vertebral)** — HECHA (18-jul-2026, **PR #19**, commit de merge **`695d027`**, validada por Giovanny en emulador). Entregado: **colección `proyectos`** (`types/sigp/proyecto.ts`: enum completo de 12 estados creado → … → cerrado, labels/colores sin azules; snapshot COPIA de la versión aprobada — cliente/NIT/asunto/contacto/valor_venta/esquema/tipo_inversion/alcance resumido por grupo con `subtotalesPorGrupo`, misma fuente que el PDF); **nacimiento automático al aprobar una cotización** (`utils/sigp/proyectos.ts` + gancho en `CotizacionAcciones`): consecutivo **PRY-YYYY-NNN server-side**, **idempotente por construcción** (doc id = id de la cotización → 1:1 garantizado; re-aprobación/doble clic no duplican; consecutivo preservado ante fallo — patrón SOL/VIS/COT; auto-reparación del enlace inverso `cotizacion.proyecto_id`); chip "🏗 PRY-…" en la cotización aprobada o botón "Crear proyecto" (retry + **mecanismo de backfill manual** de aprobadas previas — previsto, no ejecutado); **bandeja** `/sigp/proyectos` (filtro por 12 estados + buscador) y **ficha** (ciclo de vida visual, "Lo pactado", alcance, línea de tiempo, enlace a la cotización origen, placeholders b/c/d); sidebar gateado por flag + `puedeGestionarProyectosUI`. Tests 92 → **98**. E2E en emulador flag ON (nace PRY-2026-001) y flag OFF (F1 byte-idéntico).
- **2.1.b ✅ Asignación de contratista + permisos de ingreso** — HECHA (18-jul-2026, **PR #20**, commit de merge **`b88d3cc`**, validada por Giovanny en emulador). **Hallazgo Paso 0**: el registro `contratistas` es MÍNIMO (`nombre`, `tipo`, `nit`/`cedula`, `estado: activo|inactivo`) — **la habilitación ES el campo `estado`** (administrada por Gestión Administrativa vía la regla de F0.6.a-ter); NO hay campos de evaluación/reevaluación/puntaje: la evaluación formal vive en el SGI (FT Selección y Reevaluación de Proveedores). Entregado: **`proyecto.asignacion`** (snapshot de nombre + documento + `habilitacion_snapshot` con fuente y fecha de consulta — evidencia ISO 9001 §8.4 / 45001 §8.1.4 de proveedor calificado al asignar; `evaluacion_snapshot` OPCIONAL previsto para cuando el registro evolucione; `nota_criterio`), **gate no-solo-UI** (`construirAsignacion` LANZA si el contratista no está habilitado; el selector solo lista habilitados con conteo "N de M"), y **`proyecto.permisos`** (solicitado/aprobado/negado/no_requiere + fechas, entidad responsable, nota y adjunto a Storage `proyectos/{id}/permisos/` — patrón visitas). Transiciones: creado → contratista_asignado → permisos_en_tramite (el primer registro de permisos transiciona; la resolución se registra sobre el mismo objeto), todas con historial. Componentes `AsignacionContratista` y `PermisosIngreso` en la ficha (los placeholders quedan solo para c/d). Tests 98 → **103**. E2E completo sobre PRY-2026-001 (asignación con evidencia congelada verificada en Firestore + adjunto verificado en Storage). Cero archivos de F1 tocados.
- **2.1.c ✅ Preliquidación + aprobación + anticipo + preliquidación del contratista** — HECHA (19-jul-2026, **PR #21**, commit de merge **`091c0a2`**, validada por Giovanny con sus dos ajustes). Entregado: **`proyecto.preliquidacion`** — `valor_venta` AUTO del snapshot mostrado con el **desglose del esquema aprobado** (AIU: obra + A/I/U + IVA sobre la Utilidad; IVA pleno: subtotal); palanca de **MARGEN % con la convención EXACTA del APU** del cotizador (margen = % de utilidad sobre el total → `contratista = venta × (1 − m/100)`, helper `contratistaDesdeMargen`), **bidireccional** (teclear valor_contratista con expresiones deriva el margen — goal-seek como el APU; test cruzado contra `precioDesdeCosto`/`margenDesdePrecio`); `anticipo_pct` default 50 con derivados `anticipoValorDe`/`saldoValorDe`; **vista interna del alcance aprobado CON valores** (misma agrupación del PDF, plegable) + **`observaciones` por ítem** (keyed por `claveItemAlcance`: instancia_id → fallback código+índice/índice; editables en la vista interna, persisten al blur, SÍ salen al contratista). **SEGREGACIÓN DE FUNCIONES**: proyectos DEFINE (`preliquidacion_definida`, estado nuevo — el ciclo quedó de 13); **gerencia_administrativa APRUEBA y registra el ANTICIPO girado** (fecha/valor/evidencia a Storage `proyectos/{id}/anticipo/`) → `preliquidacion_aprobada` → `anticipo_girado` (permisos UI `puedeAprobarPreliquidacionUI` + `veProyectosUI` para que gerencia vea el módulo; E2E con dos usuarios distintos: `definida_por ≠ aprobada_por`). **PDF de preliquidación del contratista** (`utils/sigp/preliquidacionPdf.ts`, marca NEG): alcance por grupos con columnas CÓDIGO/DESCRIPCIÓN/CANT/UND/**OBSERVACIONES** (texto que envuelve) y SOLO anticipo + saldo + TOTAL CONTRATISTA — **jamás valor de venta, utilidad ni precios por actividad** (es lo que hoy se manda por WhatsApp). Matiz de reglas: la regla nueva restringe a gerencia a sus campos; el bloqueo de que proyectos apruebe es de UI (hardening por-campo anotado como opcional). Tests 103 → **108**. El pago del cliente y el saldo del contratista son F2.1.d.
- **2.1.d ✅ Ejecución + entrega + soporte del cliente + evaluación — F2.1 COMPLETA** — HECHA (20-jul-2026, **PR #22**, commit de merge **`1d2118e`**, validada E2E por Giovanny). **Máquina de estados final (15)**: `informe_entregado` reemplazado por la secuencia real `en_ejecucion → ejecutado → entregado_cliente → soporte_recibido → enviado_a_facturacion`; los estados desde **`facturado`** (`ESTADO_INICIO_ADMINISTRATIVA`) son el **MÓDULO FUTURO de Gerencia Administrativa** (factura → pago del cliente → saldo al contratista con su gate de pago-cliente-primero) — marcados en la UI (chips punteados + nota) y FUERA del alcance de Proyectos. Entregado: **ejecución MVP** (`proyecto.ejecucion`: iniciar; "ejecutado" con **evidencia fotográfica OBLIGATORIA** multiarchivo a Storage `proyectos/{id}/ejecucion/` + nota; el avance por actividad y el informe fotográfico automático quedan para F2.3); **entrega** (`proyecto.entrega`: fecha + nota); **soporte del cliente** (`proyecto.soporte_cliente`: tipo `orden_pago|orden_compra|liquidacion` + número + fecha + adjunto a `proyectos/{id}/soporte/` + **verificación "concuerda con lo ejecutado" que BLOQUEA el avance**); **handoff** con confirm y banner "En manos de Gerencia Administrativa"; **evaluación del contratista** (`proyecto.evaluacion_contratista`: 4 criterios ISO — calidad/cumplimiento/SST/documentación — puntaje 1–5, promedio derivado guardado, comentario; `CRITERIOS_EVALUACION` extensible por GI; disponible desde "ejecutado"). Todo con historial. Componentes `EjecucionProyecto` y `EvaluacionContratistaCard`. Tests 108 → **111**. E2E completo: anticipo_girado → … → enviado_a_facturacion con 2 fotos + OC adjunta en Storage + evaluación promedio 4,5.

- **2.2 ✅ Entrada de preventivos IHS — F2 COMPLETO** — HECHA (20-jul-2026, **PR #23**, commit de merge **`a89519c`**, validada por Giovanny incl. el ajuste de cliente fijo). Entregado: **matriz de precios versionada EN CÓDIGO** (`types/sigp/preventivos.ts`: 9 renglones zona Z1/Z2/Z3 × greenfield pesado/liviano + rooftop pesado, valores normal/jungle, transporte constante $1.080.000; mapa departamento→zona insensible a tildes; `precioPreventivo()` puro: base jungle/normal + transporte si jungle O San Andrés; rooftop liviano → "no disponible"; esquema **IVA pleno** — el IVA se aplica aguas abajo en la facturación de Administrativa; **no requiere colección ni regla Firestore**, cambia por PR); **solicitud tipo `preventivo`** (`tipo: comercial|preventivo`, ausente = comercial → flujo de F1 INTACTO; datos del sitio con zona/SAI denormalizados; **cliente FIJO IHS** — resuelto del registro por nombre, solo lectura con NIT y candado; sin IHS activo → aviso y bloqueo; badge PREV en bandeja); **aceptar/rechazar SIN cotización** (panel dedicado con precio de matriz en vivo; rechazar exige motivo → descartada; **aceptar crea el proyecto `origen='preventivo'`** — idempotente con doc id = id de la solicitud, PRY preservado ante fallo, snapshot con valor_venta de matriz y alcance de un renglón; estado nuevo `aceptada` terminal inalcanzable desde la máquina comercial); el proyecto **entra al flujo F2.1 completo** (ficha con origen "preventivo SOL-…", preliquidación con palanca de margen sobre el precio de matriz, doc del contratista desde el snapshot). Tests 111 → **120** (9 de matriz: normal, jungle, SAI, jungle+SAI transporte único, combinaciones inexistentes). E2E: preventivo Antioquia/Z3/GF-pesado/jungle → $2.856.685 → aceptado → PRY con F2.1 recorrido hasta preliquidación (margen 30% exacto).

- **2.3 ✅ Entregables IHS (versión LIGERA)** — HECHA (21-jul-2026, **PR #26**, commit de merge **`d497e6e`**, validada por Giovanny). **Decisión de proporcionalidad**: se DESCARTÓ el enfoque pesado de F2.3.a (captura de datos + generación del Excel con ExcelJS sobre la plantilla oficial) — los 3 formatos IHS los diligencia el equipo en los ARCHIVOS DEL CLIENTE y se suben a la app de IHS; replicarlos en el panel era doble digitación. El panel solo TRAZA y guarda copia. Entregado: **`proyecto.entregables_ihs`** (solo `origen='preventivo'`) — checklist de los 3 formatos (**Inventario de antenas · Estado de línea de vida · Torque de torre**), cada uno con estado pendiente/diligenciado, **adjunto OBLIGATORIO** (la copia del Excel → Storage `proyectos/{id}/entregables/`, regla ya desplegada), fecha, nota y entrada al historial; **indicador X/3** y **GATE en la entrega**: con faltantes, el paso "Entrega al cliente" lista cuáles faltan y oculta el botón — no se llega a `enviado_a_facturacion` sin los 3 (helpers puros `entregablesIhsFaltantes`/`Completos`; para no-preventivos no aplica). Componente `EntregablesIhs` + aviso en `EjecucionProyecto`. Tests 120 → **123**. E2E: 0/3 bloquea con lista → 3/3 libera; proyecto de cotización sin sección ni gate.

- **Panel SIGP · Tablero de indicadores (ISO 9.1) ✅** — HECHO (21-jul-2026, **PR #27**, commit de merge **`47fafc3`**, validado por Giovanny; visual v2 del mockup `panel_sigp_mockup_v2.html`, alineado al Dashboard SST). Reemplaza el placeholder de `/sigp/panel`. **CAPA OFICIAL**: los 5 indicadores de la Caracterización Integral (`utils/sigp/indicadores.ts`, cálculo puro client-side + semáforos por meta): 1) cumplimiento del plan (actividades ejecutadas/programadas, corte actual, meta 80–100 %), 2) calidad (entregas con calificación ≥4/5 del periodo, ≥90 %), 3) proyección presupuestal (Σ costo ejecutado/Σ valor cotización, 90–110 % con ámbar simétrico), 4) satisfacción (encuestas ≥4/5 del periodo, ≥90 %), 5) ambiental/SST (**registro MANUAL** por periodo en la colección **`indicadores`** doc `sst_YYYY-MM` hasta integrar el Panel SST — regla **DESPLEGADA en producción el 21-jul** con OK, pre-verificación prod==HEAD, post-verificación byte-idéntica y prueba de denegación anónima). **CAMPOS NUEVOS de captura**: `actividades_plan[]` (checkboxes en Ejecución, sembrado del alcance al iniciar), `entrega.calificacion_calidad` (1–5 OBLIGATORIA en el acta), `preliquidacion.costo_ejecutado` (con expresiones), `evaluacion_cliente` (encuesta 1–5, tarjeta `SatisfaccionClienteCard`). **VISUAL v2**: hero "Así vamos" (gradiente verde→violeta, frase-resumen dinámica, anillo de salud X/5, selector de periodo, chip ISO 9.1); tarjetas KPI con chip de ACENTO por identidad (paleta categórica CVD: verde #628E3A · violeta #6E56CF · ámbar #E0A100 · teal #1BAF7A · naranja #EB6834), anillo conic en color de ESTADO (#3C8B2E/#E0A100/#D03B3B) SIEMPRE con pill de texto, sparkline 6 periodos (solo ind. 2/4 — los de corte degradan sin inventar series); operativa: dona categórica de estados agrupados, funnel verde con conversión, tiles IHS (con `ejecutados`). Regla de color: identidad ≠ estado, nunca mezclados. Tests 123 → **132**. NOTA de marca: la paleta categórica del tablero fue validada explícitamente por Giovanny para dashboards (excepción consciente a la regla "solo verde"; el azul sigue prohibido).

**PDF de cotización — tabla compacta y rebalanceada** (22-jul-2026, **PR #28**, commit de merge **`5bddb6f`**, iterado en 3 rondas con Giovanny — cambio VISIBLE en producción, F1 en vivo; solo `utils/sigp/cotizacionPdf.ts`): cuerpo de tabla 8→7.4pt / interlineado 11→9.2 / padding de fila 10→6; encabezados de grupo 37→26pt; **columnas rebalanceadas** (CÓDIGO 54→40, UND 40→34, VR. UNITARIO 70→58, VR. TOTAL 92→74 → DESCRIPCIÓN +24 %); títulos de la banda verde TODOS centrados sobre su columna (y códigos de fila centrados); **centrado VERTICAL de todas las celdas** respecto del centro de la fila (bloques multilínea como bloque); tope anti-desborde de descripción 20→40 líneas (la métrica compacta recortaba alcances largos — fidelidad); **piso especial de la firma** (100pt — puede acercarse al pie en vez de abrir hoja casi vacía); reserva del pie 118→108; condiciones comerciales SIGUEN como sección propia (se probó lado-a-lado del resumen y Giovanny lo descartó por amontonado); aire tras el cuadro informativo (+26pt) e introducción priorizando respiro sobre densidad (decisión explícita de Giovanny: el caso típico de 3 renglones puede ir a 2 páginas). Resultado con COT-2026-013 real: 2 páginas con la firma acompañada en la 2ª. Validado con 6 casos renderizados página a página + E2E en emulador (envío desde el panel, `pdf_hash` coincidente). Intactos: cuadro ISO, fidelidad LPU, iconografía, marca, QR, pie.

**Asunto canónico enlazado solicitud ↔ cotización — Bloque B** (22-jul-2026, **PR #29**, commit de merge **`2d02c9c`**, validado E2E — cambio VISIBLE en producción, F1 en vivo; sin cambios en reglas): el asunto vive en la **solicitud** (`solicitudes.asunto`, nuevo, opcional, retrocompatible) y las cotizaciones enlazadas llevan un ESPEJO escrito SOLO vía **`utils/sigp/asunto.ts`** (batch atómico solicitud + todas sus cotizaciones — editable desde cualquiera de los dos lados sin divergir; planificador puro testeable `planPropagacionAsunto`). Solicitud: campo opcional al registrar + edición inline en el detalle. Cotización: precarga al crear desde solicitud (y escribe de vuelta), indicador 🔗, propagación al guardar borrador. Proyecto: `snapshot.asunto` ya se congelaba al nacer — editar después NO lo toca (verificado). **PDF**: con PDF enviado vigente, el cambio de asunto marca `pdf_desactualizado` (badge ámbar) — el PDF enviado NO se regenera (evidencia inmutable con hash, regla 8; el reenvío pasa por Nueva versión); la marca se limpia al enviar / nueva versión / aprobar. Preventivos no usan asunto (título de matriz). Tests 132 → **137**.

**Transporte automático por zona en correctivos IHS — Bloque C** (22-jul-2026, **PR #30**, commit de merge **`a69294f`**, validado E2E — cambio VISIBLE en producción, F1 en vivo; sin cambios en reglas/functions/PDF): en el constructor de cotización, la línea de transporte deja de teclearse. **Hallazgo Paso 0**: el LPU real de IHS NO tiene grupo "TRANSPORTE" — las 8 filas de zona viven en ESTRUCTURAS (51-54) y OBRA CIVIL (163-166); reconocimiento por el DATO (unidad `%` + descripción "Zona N…", verificado contra las 536 filas del LPU vigente) + flag `es_transporte` al insertar. **Selector "🚚 Transporte por zona"** (solo borradores, aparece si el LPU vigente trae filas de zona — IHS de facto, nada cableado por cliente): elegir zona = única línea de transporte (cambiar reemplaza; el buscador rechaza una segunda con toast); **sugerencia por el sitio de la solicitud** leyendo los departamentos de las descripciones del propio LPU (frontera de palabra). **Única lógica nueva** (`aplicarTransporte` en `types/sigp/cotizacion.ts`, pura): cantidad = Σ(demás)/100 a 2 decimales EXCLUYÉNDOSE a sí misma, recalculada en vivo y siempre al persistir; cantidad bloqueada en la fila (⚙) y en `patchInstancia`; factor solo lectura (fidelidad LPU). Tests 137 → **151** (incl. réplica exacta de la COT-2026-013: cantidad 28.051,15 → $442.647; cierre E2E $592.647 + IVA $112.603 = $705.250).

**F2 COMPLETO (F2.1 a+b+c+d + F2.2 + F2.3 ligero) — LISTO PARA GO-LIVE.** El ciclo de Gerencia de Proyectos cubre: cotización aprobada O preventivo IHS aceptado → proyecto → asignación → permisos → preliquidación → anticipo → ejecución (con entregables IHS en preventivos) → entrega → soporte → handoff a facturación + evaluación del contratista. Siguiente: go-live (lista de abajo — reglas YA desplegadas el 20-jul; falta el parámetro Remote Config); luego avance por actividad / informe fotográfico (futuro) o el módulo de Administrativa.

**APARCADO hasta el go-live de F2** (lista CONFIRMADA al cierre de F2.2 — no ejecutar antes):
1. Crear el parámetro Remote Config **`sigp_f2_enabled`** (boolean, default `false`) en la consola — lo hace Giovanny.
2. **Deploy de la regla `proyectos`** en `firestore.rules` (read `accesoSIGP`, write `puedeGestionarProyectos`) — con OK explícito y verificación pre-deploy (prod == HEAD). Hasta ese deploy, las escrituras a `proyectos` fallarían en producción — coherente con el flag apagado.
3. **Deploy de `storage.rules`**: bloque `proyectos/**` auth-only (adjuntos de permisos de ingreso y evidencias de anticipo; 2.1.b/c).
4. **Regla Firestore de segregación (2.1.c)**: `gerencia_administrativa` puede `update` de `proyectos` SOLO sobre `preliquidacion`/`estado`/`historial`/`fecha_actualizacion` (patrón `hasOnly`, como `contratistas.estado`) — ya escrita en `firestore.rules`, va en el mismo deploy del punto 2.
5. Functions: **nada** — el prefijo `PRY` ya está en la `generarConsecutivo` desplegada desde F0.

El merge de 2.1.a a `main` **NO requiere deploy alguno**: el código queda invisible tras el flag y no toca reglas ni functions en producción.

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

*Última actualización de este archivo: 21 de julio de 2026 — **F2 COMPLETO** (F2.1: proyecto de la aprobación al handoff · F2.2: preventivos IHS con matriz y cliente fijo · F2.3 ligero: entregables IHS con gate en la entrega; todo tras `sigp_f2_enabled` default false). **Reglas Firestore (`proyectos` + segregación gerencia) y Storage (`proyectos/**`) YA DESPLEGADAS en producción (20-jul, prod == HEAD verificado)** — el go-live solo espera que Giovanny cree el parámetro Remote Config `sigp_f2_enabled` y decida el flip. F1 sigue EN PRODUCCIÓN con el piloto comercial activo. Pendientes: módulo Administrativa (factura/pagos/saldo con gate), ajustes del piloto, aviso de "versión nueva del panel", campo `celular`, H-008. UX: LPU en el detalle de Cliente + historial de contactos en Solicitudes (20-jul). Panel SIGP de indicadores HECHO (21-jul) y regla `indicadores` DESPLEGADA en producción (21-jul) — el registro manual del ind. 5 ya opera. PDF de cotización compactado y rebalanceado (22-jul, PR #28). Asunto canónico solicitud ↔ cotización (22-jul, PR #29). Transporte automático IHS (22-jul, PR #30). Versión: 2.4.4.*
