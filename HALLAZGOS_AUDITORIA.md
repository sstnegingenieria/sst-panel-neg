# Hallazgos de auditoría — Sistema SST / Panel Web

Este archivo registra brechas, inconsistencias o riesgos detectados durante la construcción del módulo SIGP (Sistema Integral de Gestión de Proyectos) sobre el panel SST existente. Su propósito es que estos hallazgos no se pierdan y puedan atenderse formalmente, ya sea como parte de la implementación del SIGP o en el ciclo de mantenimiento del SST.

Cada hallazgo tiene: identificador, severidad (Alta / Media / Baja), descripción, evidencia técnica, y estado actual.

**Fecha del primer registro**: 05 de julio de 2026.
**Fuente**: Reconocimiento del codebase (Fase 0.0) + validación con el equipo original + consulta al proyecto Firebase real (`neg-sst-app`).

---

## H-001 · Colección `contratistas` con lectura pública sin autenticación

**Severidad**: Alta
**Estado**: Abierto

### Descripción

La regla actual de Firestore para la colección `contratistas` es:

```javascript
match /contratistas/{contratistaId} {
  allow read: if true;   // ⚠️ público sin auth
  allow create, update, delete: if isSST();
}
```

Esto permite que **cualquier persona en internet, sin autenticarse**, lea la lista completa de contratistas de NEG Ingeniería con sus datos comerciales (nombre, NIT o cédula, tipo, estado). Basta con conocer o adivinar el `projectId` de Firebase para acceder vía API REST.

### Por qué existe

Es intencional: el formulario de registro de nuevos colaboradores en la app Flutter necesita listar contratistas antes de que el usuario esté autenticado. La regla se abrió para habilitar ese flujo.

### Riesgo real

Exposición de datos de negocio (relaciones comerciales, aliados) que podrían ser útiles para competencia, phishing dirigido a contratistas de NEG, o mapeo de la cadena de proveedores. No hay PII grave (los NITs de personas jurídicas son públicos), pero sí hay cédulas de contratistas persona natural — eso sí es dato personal protegido por Ley 1581/2012 de Colombia.

### Solución propuesta

Reemplazar la lectura pública por una Cloud Function callable (`listarContratistasPublico`) que:
- No requiera autenticación.
- Devuelva solo campos seguros (id + nombre) — sin NIT, sin cédula, sin datos comerciales.
- Aplique rate limiting.

Luego, cerrar la regla de `contratistas` a `allow read: if isAuthed()`.

**Impacto**: toca la app Flutter (`registro_service.dart` en el flujo pre-login). Debe probarse en Firebase Emulator Suite antes de tocar producción.

### Vinculación ISO

- ISO 9001 cláusula 7.5 (control de la información documentada — datos de partes interesadas).
- ISO 27001 (si NEG lo cita como referencia): control A.13.2.1 (transferencia segura de información).
- Ley 1581/2012 (Colombia): tratamiento de datos personales de contratistas persona natural.

---

## H-002 · Doble campo `rol` / `role` en la colección `users` sin consolidación

**Severidad**: Media
**Estado**: Resuelto — 05-jul-2026 (parte de datos). El mantenimiento cosmético del fallback `?? role` en código Flutter queda como refinamiento post-F0 no bloqueante.

### Descripción

Las reglas Firestore actuales validan el rol del usuario contra **dos campos distintos** con lógica OR:

```javascript
function isSST() {
  return isAuthed() && (
    userData().get('rol',  '') in ['sst', 'admin'] ||
    userData().get('role', '') in ['sst', 'admin']
  );
}
```

Esto indica que los documentos en `users` tienen los datos de rol repartidos entre dos nombres de campo:
- `rol` (español) — canónico, usado por el panel web actual (`AuthContext.tsx`).
- `role` (inglés) — legacy de una versión temprana de la app Flutter.

El código Flutter también lo lee defensivamente: `data['rol'] ?? data['role']`.

### Riesgo real

- **Consistencia**: no se sabe cuántos usuarios tienen uno, cuántos el otro, cuántos ambos, cuántos con valores distintos entre ambos campos.
- **Migración incompleta**: si algún día se elimina `role`, hay que garantizar antes que 100% de los usuarios tengan `rol` con valor válido.
- **SIGP amplía el problema**: el SIGP introduce 8 roles nuevos (`gerencia_general`, `director_proyectos`, etc.). Si se escriben solo en `rol` mientras el código legacy sigue leyendo `role`, algunos flujos verán al usuario "sin rol".

### Solución propuesta

**Paso 1** (pendiente): correr un script de auditoría sobre `users` que reporte:
- Cuántos docs tienen solo `rol`, solo `role`, ambos, ninguno.
- Valores distintos encontrados en cada campo.
- Docs con conflicto (`rol` y `role` con valores distintos).

**Paso 2**: consolidar todos los docs a un solo campo `rol` con el valor correcto, eliminando `role`. Antes de este paso, actualizar toda referencia de código a `role` para que solo lea `rol`.

**Paso 3**: en la Iteración 0.5 de F0 (migración de roles del SIGP), asignar los nuevos roles SIGP a los usuarios existentes sobre el campo consolidado.

> **Resultado de la auditoría de datos (05-jul-2026)**:
>
> Corrida del script de auditoría sobre la colección `users` en producción
> (`neg-sst-app`) devolvió:
> - Total de usuarios: 17
> - Con campo `rol`: 17 (100%)
> - Con campo `role` (legacy): 0
> - Roles huérfanos o typos: 0
> - Conflictos `rol` ≠ `role`: 0
> - Distribución: `tecnico` = 12, `admin` = 3, `sst` = 2
>
> **Conclusión**: el campo `rol` ya está consolidado al 100%. No se requiere
> migración de datos. La deuda restante es solo cosmética: simplificar el
> fallback `data['rol'] ?? data['role']` en el `UserModel` de Flutter y el
> chequeo doble en `firestore.rules`. Se agenda como tarea de mantenimiento
> post-F0, junto con H-004.

### Vinculación ISO

- ISO 9001 cláusula 7.5.3 (control de información documentada — integridad).
- Riesgo operativo: usuarios podrían perder acceso durante una migración mal ejecutada.

---

## H-003 · Cinco Cloud Functions versionadas en el código, nunca desplegadas en producción

**Severidad**: Media (documental) / Baja (operacional)
**Estado**: Resuelto — 05-jul-2026 (commit F0 0.3.c-bis)

### Descripción

El archivo `functions/index.js` declara cinco Cloud Functions:
- `setCustomClaimsOnUserCreate`
- `updateCustomClaimsOnRoleChange`
- `removeCustomClaimsOnUserDelete`
- `processNewRecord`
- `refreshCustomClaims`

Verificado con `npx firebase functions:list --project neg-sst-app`: **cero funciones desplegadas** en producción.

El sistema de custom claims que describen estas funciones (propagar el rol del usuario a los tokens de Auth para optimizar reglas Firestore) **nunca operó**. Las reglas leen el rol directamente de Firestore vía `get()`, no de `request.auth.token`.

Además, `processNewRecord` está mal configurada: apunta a la colección `registros/{recordId}` y valida campos (`user_id`, `descripcion`) que **la app Flutter no escribe** (escribe `uid_usuario`, `nombre_usuario`, etc.). Si se desplegara, fallaría en cada escritura.

### Riesgo real

- **Documental**: `DEPLOYMENT_GUIDE.md` y otros artefactos describen custom claims como si estuvieran operando. Un auditor que compare documentación contra realidad encuentra la brecha inmediatamente.
- **Operacional**: código muerto que confunde a nuevos desarrolladores. Genera dudas sobre qué está vivo y qué no.
- **Riesgo de despliegue accidental**: un `firebase deploy --only functions` (sin `--only` específico) desplegaría las cinco. `processNewRecord` empezaría a romper el flujo de la app Flutter en producción.

### Solución propuesta

Eliminar el bloque de las cinco funciones legacy de `functions/index.js`, dejando solo `generarConsecutivo` (la única activa y funcional). Se ejecuta como **Iteración 0.3.c-bis** de F0, en un commit dedicado con mensaje claro, antes del deploy a producción de `generarConsecutivo`.

Actualizar `DEPLOYMENT_GUIDE.md` para reflejar que el rol se lee de Firestore directamente, no de custom claims.

### Vinculación ISO

- ISO 9001 cláusula 7.5.3 (información documentada debe estar actualizada y precisa).
- Riesgo de configuración: código muerto es un vector de despliegue accidental.

---

## H-004 · Runtime Node 18 y `firebase-functions` v5 desactualizados

**Severidad**: Baja
**Estado**: Parcialmente resuelto — 05-jul-2026 (Node 22 en 0.3.d; `firebase-functions` v6 pendiente)

### Descripción

- `functions/package.json` declara `engines.node: 18`.
- Dependencia `firebase-functions: ^5.0.0`.
- Estado actual de Google Cloud Functions (julio 2026): Node 18 en descontinuación; la versión recomendada es Node 20+ y `firebase-functions` v6.

### Riesgo real

- Node 18 dejará de recibir parches de seguridad. Cuando Google retire su soporte, los deploys de Cloud Functions fallarán con "unsupported runtime".
- Al momento de forzar la actualización, habrá que revisar sintaxis: las funciones legacy (que serán eliminadas por H-003) usan v1, `generarConsecutivo` usa v2. Con solo `generarConsecutivo` restante, la migración a v6 es trivial.

### Solución propuesta

Tarea de mantenimiento independiente, agendada para después de cerrar F0 (o antes de F2 si se acerca la fecha de retiro de Node 18 en Google Cloud):
1. Actualizar `functions/package.json` a `engines.node: 20`.
2. Actualizar `firebase-functions` a `^6.0.0`.
3. Revisar que `generarConsecutivo` (v2) siga compilando sin cambios (v6 mantiene v2 estable).
4. Re-correr los tests contra emulador.
5. Deploy con OK explícito.

**Actualización parcial (05-jul-2026)**: `engines.node` subido de 18 a 22 durante la Iteración 0.3.d de F0 (bloqueaba el deploy de `generarConsecutivo` porque Node 18 fue retirado por Google el 30-oct-2025). El bump de `firebase-functions` v5 → v6 queda pendiente y se abordará cuando el SIGP sume su segunda Cloud Function (probablemente en F1 con el envío de correos de cotización).

### Vinculación ISO

- ISO 9001 cláusula 7.1.3 (infraestructura). Runtime desactualizado es infraestructura no adecuada.

---

## H-005 · Ausencia de CI/CD para Cloud Functions

**Severidad**: Baja
**Estado**: Abierto — abordar cuando el SIGP tenga más de una Cloud Function

### Descripción

El deploy de Cloud Functions se hace manualmente vía `npm run deploy` (que ejecuta `firebase deploy --only functions`). El deploy del panel web sí tiene CI/CD vía Vercel (auto-deploy desde `main`), pero las Cloud Functions no.

### Riesgo real

- Con una sola función (`generarConsecutivo`) el riesgo es bajo.
- Cuando el SIGP tenga múltiples Cloud Functions (F1+ probablemente añada al menos: envío de correos de cotización, validación de saldo contratista, alertas de vencimiento SST), el deploy manual se vuelve fuente de errores.
- Sin CI/CD, no hay linter automático ni tests obligatorios antes del deploy. Un desarrollador con prisa puede desplegar código sin probar.

### Solución propuesta

Agregar workflow de GitHub Actions que:
1. En cada PR a `main` que toque `functions/`, corra los tests contra emulador.
2. En cada merge a `main`, si `functions/` cambió, dispare `firebase deploy --only functions` con un service account.

Requiere configurar credenciales de service account de Firebase en GitHub Secrets. Es tarea de una tarde de trabajo, con sus propias precauciones de seguridad.

**Prioridad**: agendar cuando F1 sume su primera Cloud Function nueva (probablemente envío de correo de cotización aprobada al cliente).

### Vinculación ISO

- ISO 9001 cláusula 8.1 (planificación y control operacional).
- Reduce el riesgo humano en el proceso de despliegue.

---

## H-006 · Gatekeeper global de App.tsx no actualizado durante refactor de roles

**Severidad**: Alta (funcional) / Baja (impacto)
**Estado**: Resuelto — 05-jul-2026 (commit F0 0.5.d)

### Descripción

Durante las Iteraciones 0.4, 0.5.a y 0.5.b, se introdujeron los 8 roles nuevos del SIGP (`gerencia_general`, `gerencia_administrativa`, `operacion_comercial`, `director_proyectos`, `residente_sst`, `gestion_integral`, `contratista`, `cliente_final`) y se crearon los helpers `accesoSST()` y `accesoSIGP()` para determinar acceso.

Sin embargo, el gatekeeper global inline `ProtectedRoutes()` en `src/App.tsx` no fue actualizado. Mantenía una constante local:

```typescript
const ALLOWED_ROLES = ['sst', 'admin']
```

Este gatekeeper es el primer filtro que evalúa todo usuario autenticado. Los roles no listados son rechazados con "Acceso no autorizado", sin importar si las rutas internas los aceptarían.

### Detección

El bug fue detectado en la validación funcional del sub-bloque 0.5.c (05-jul-2026), cuando Pedro Rodríguez intentó el primer login con rol `gerencia_general` recién asignado. La autenticación contra Firebase Auth fue exitosa, pero el panel mostró "Acceso no autorizado" al llegar al gatekeeper.

### Impacto real

Hasta que se aplicó el fix, 4 usuarios en producción no podían entrar al panel:
- Pedro Rodríguez (gerencia_general)
- Marcela Montoya (gerencia_administrativa)
- Karen Cartagena (operacion_comercial)
- Paula Moreno (director_proyectos — cambió desde admin en la misma iteración)

Los otros 4 usuarios de panel (Giovanny, Ingrid, Juan Carlos, Mabel) no fueron afectados porque mantuvieron roles `admin` o `sst`, ambos listados en `ALLOWED_ROLES`.

### Causa raíz

Refactor incompleto. Cuando se centralizaron los criterios de acceso en los helpers `accesoSST()` / `accesoSIGP()` (Iteración 0.5.a), no se propagó ese cambio a todos los puntos de decisión. El gatekeeper global `ProtectedRoutes()` en App.tsx quedó como isla con su propia lista hardcodeada.

### Solución aplicada

Reemplazar la constante local `ALLOWED_ROLES` por una llamada a los helpers ya centralizados en `types/sigp/roles.ts`:

```typescript
if (!accesoSST(user.rol as Rol) && !accesoSIGP(user.rol as Rol)) {
  // pantalla "Acceso no autorizado" (JSX inline existente)
}
```

Ahora los **8 roles** con acceso al panel web —la unión `accesoSST` ∪ `accesoSIGP`: `sst`, `admin`, `gerencia_general`, `gestion_integral`, `residente_sst`, `gerencia_administrativa`, `operacion_comercial`, `director_proyectos`— pasan el gatekeeper. Los roles solo-móvil (`tecnico`, `contratista`) siguen siendo rechazados correctamente.

**Sobre `cliente_final`**: queda **excluido del gatekeeper por diseño arquitectónico, no por bug**. `cliente_final` es un rol futuro (F5+) pensado para un **portal de cliente separado** (ver informes y actas de sus proyectos, aprobar entregas), no para el panel administrativo SST/SIGP. Por eso no está en `accesoSST` ni en `accesoSIGP`. Cuando se implemente ese portal tendrá su propio punto de acceso; no se agrega al gatekeeper del panel actual.

### Lecciones para futuras iteraciones

- Cuando se introduzcan cambios de roles, revisar TODOS los puntos de decisión de acceso (no solo las rutas), incluyendo gatekeepers globales, filtros de sidebar, y cualquier condicional que dependa de rol.
- Considerar un test automatizado que verifique que cada rol declarado en `types/sigp/roles.ts` tenga comportamiento esperado en el gatekeeper (F1+).

### Vinculación ISO

- ISO 9001 cláusula 8.5.1 (control de la producción y la provisión del servicio): el proceso de refactor debe garantizar consistencia en todos los puntos afectados.
- El hecho de que este bug se cazó en la validación funcional pre-uso operacional (no en producción operativa con usuarios reales trabajando) es un éxito del proceso de sub-bloques con OK explícito.

---

## Nota de configuración · APIs habilitadas en `neg-sst-app`

El 05-jul-2026, durante el pre-flight del deploy de `generarConsecutivo`, el CLI de Firebase habilitó automáticamente dos APIs de Google Cloud necesarias para Cloud Functions 2ª gen:

- `artifactregistry.googleapis.com`
- `cloudbuild.googleapis.com`

Estas habilitaciones son estándar y no incurren en cargo por sí mismas (solo el uso lo hace). Se documentan aquí como registro del cambio de configuración de producción, no como hallazgo.

---

## Nota de configuración · Política de limpieza de Artifact Registry

El 05-jul-2026, tras el deploy inicial de `generarConsecutivo`, el CLI configuró una política de retención de 1 día para las imágenes de contenedor en `us-central1/gcf-artifacts` (default de firebase-tools en primer deploy). Se ajustó posteriormente a 7 días como colchón razonable para permitir rollback rápido en caso de detectar un bug tras un redeploy.

---

## Validación funcional de `generarConsecutivo` en producción

El 05-jul-2026 se validó manualmente la función `generarConsecutivo` desplegada en `neg-sst-app` invocándola contra producción real desde Google Cloud Shell, autenticando con un usuario del panel (rol `admin`).

Resultado: la función respondió con `OFR-2026-001` en la primera invocación. Se creó el documento `consecutivos/OFR_2026` en Firestore de producción con los campos esperados (`actualizado`, `actualizado_por`, `año`, `prefijo`, `ultimo: 1`).

El documento de prueba se eliminó manualmente después de la validación para dejar producción en estado limpio: cuando F1 emita la primera cotización real, el consecutivo será `OFR-2026-001` como corresponde.

Esta validación confirma end-to-end: autenticación con Firebase Auth, invocación del callable de 2ª gen, transacción atómica en Firestore, y respuesta correcta al cliente.

---

## Migración de roles a modelo SIGP (05-jul-2026)

Ejecutada como parte del sub-bloque 0.5.c de F0.

**Ámbito**:
- 5 usuarios existentes: 1 actualización (Paula Moreno: `admin` → `director_proyectos`), 4 confirmaciones sin cambio (Giovanny, Ingrid, Juan Carlos, Mabel).
- 3 usuarios nuevos creados en Firebase Auth + Firestore:
  - Pedro Rodríguez (`pedro.rodriguez@negingenieria.com`) — `gerencia_general`
  - Marcela Montoya (`marcelamontoya@negingenieria.com`) — `gerencia_administrativa`
  - Karen Cartagena (`licitaciones@negingenieria.com`) — `operacion_comercial`

**Estado post-migración**:
- Colección `users`: 20 documentos totales (12 técnicos + 8 usuarios de panel).
- Distribución de roles: `tecnico` (12), `admin` (2 — Giovanny, Ingrid), `sst` (2 — Juan Carlos, Mabel), `director_proyectos` (1), `gerencia_general` (1), `gerencia_administrativa` (1), `operacion_comercial` (1).
- Campo `role` (legacy): 0 documentos.
- Conflictos `rol` vs `role`: 0.

**Método**: script `functions/scripts/migrar-usuarios-sigp.js` con Admin SDK. Ejecutado primero en `--dry-run` para validar el plan (0 errores), luego en `--apply` con autorización explícita. Duración total del `--apply`: 8.0 s.

**Seguridad**: el password temporal se pasa vía variable de entorno `PASSWORD_TEMPORAL_NUEVOS`; no queda persistido en el repo. Los 3 usuarios nuevos deben cambiar su contraseña en el primer login (recordatorio operacional al momento de entregar credenciales).

**Impacto en H-002**: este proceso cierra formalmente el hallazgo H-002 (doble campo `rol` / `role`). Cero documentos con `role` legacy en la colección al momento del cierre.

---

## Bitácora de resolución

| Hallazgo | Fecha detección | Estado | Fecha resolución | Commit / referencia |
|---|---|---|---|---|
| H-001 | 05-jul-2026 | Abierto | — | — |
| H-002 | 05-jul-2026 | Resuelto (datos; fallback Flutter cosmético post-F0) | 05-jul-2026 | commit F0 0.5.c |
| H-003 | 05-jul-2026 | Resuelto | 05-jul-2026 | commit F0 0.3.c-bis |
| H-004 | 05-jul-2026 | Parcialmente resuelto — 05-jul-2026 (Node 22 en 0.3.d, `firebase-functions` v6 pendiente) | 05-jul-2026 (parcial) | commit F0 0.3.d.2-bis |
| H-005 | 05-jul-2026 | Abierto (agendar en F1) | — | — |
| H-006 | 05-jul-2026 | Resuelto | 05-jul-2026 | commit F0 0.5.d |

Cuando cada hallazgo se resuelva, actualizar esta bitácora con la fecha y el commit/PR que lo cerró.
