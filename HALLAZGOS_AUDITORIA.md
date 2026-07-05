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
**Estado**: Abierto — mantenimiento cosmético post-F0

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
**Estado**: Abierto — abordar como tarea de mantenimiento post-F0

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

## Bitácora de resolución

| Hallazgo | Fecha detección | Estado | Fecha resolución | Commit / referencia |
|---|---|---|---|---|
| H-001 | 05-jul-2026 | Abierto | — | — |
| H-002 | 05-jul-2026 | Abierto (mantenimiento cosmético post-F0) | — | — |
| H-003 | 05-jul-2026 | Resuelto | 05-jul-2026 | commit F0 0.3.c-bis |
| H-004 | 05-jul-2026 | Abierto (mantenimiento post-F0) | — | — |
| H-005 | 05-jul-2026 | Abierto (agendar en F1) | — | — |

Cuando cada hallazgo se resuelva, actualizar esta bitácora con la fecha y el commit/PR que lo cerró.
