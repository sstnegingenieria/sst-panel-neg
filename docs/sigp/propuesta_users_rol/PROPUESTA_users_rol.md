# Propuesta — cerrar la escalada de privilegios por `users.rol`

**Estado:** PROPUESTA lista para el SIGP. **No hay ningún cambio de reglas aplicado** (esta rama solo trae documentos).
**Dueños:** SIGP / Giovanny (colección `users` compartida con la app Flutter — CLAUDE.md exige consultar antes).
**Origen:** revisión de seguridad (Opus) del aval SST por formatos físicos (PR #154); hallazgo verificado en las reglas y reproducido en el emulador.

## 1. El hallazgo

En `firestore.rules`, `match /users/{userId}` (≈ línea 281):

```
allow create, update, delete: if puedeAdministrarSST();
```

`puedeAdministrarSST()` = `sst`, `admin`, `gestion_integral`. La regla **no restringe qué documento se toca ni qué valor de `rol`/`role` se escribe**, y los `allow` se suman: la denylist de la rama de auto-edición (que bloquea `rol`, `role`, `estado`, `aprobado`, `obras_asignadas`, `contratista_*`, `empleador_verificacion`) **no aplica** a estos roles.

**Consecuencia:** un usuario `sst` o `gestion_integral` puede
- escribir `users/{cualquiera}.rol` (incluido el suyo) como `admin` / `gerencia_general` / cualquiera,
- crear cuentas nuevas con cualquier rol,
- editar, desactivar o **borrar** a cualquier persona del personal.

Y todo lo que autoriza por `rolActual()` (que lee `users.rol`) queda debilitado: aval físico de GI, preliquidaciones, liquidaciones, compras, etc. Además la CF `sincronizarClaims` copia el rol nuevo al token (Storage). **No requiere ninguna herramienta especial:** es un `updateDoc` desde el navegador.

### Evidencia (emulador)
Batería `usersRolFirestoreRules.test.ts.txt` (en esta carpeta), corrida contra las reglas ACTUALES: los 12 casos `[VULN]` (2 roles × 6 vías) **PASAN** — es decir, el hueco existe:

| Vía | sst | gestion_integral |
|---|---|---|
| Cambiarse el propio rol a `admin` | ✅ permitido | ✅ permitido |
| Promover a un técnico (`rol: 'admin'`) | ✅ | ✅ |
| Promover vía el campo legado `role` | ✅ | ✅ |
| Crear una cuenta nueva con rol `admin` | ✅ | ✅ |
| Editar/desactivar personal (no técnico) | ✅ | ✅ |
| Borrar un usuario | ✅ | ✅ |

## 2. Qué escrituras a `users` hace hoy el panel (mapa de flujos legítimos)

| Flujo | Archivo | Quién (UI) | Documento objetivo |
|---|---|---|---|
| Aprobar / rechazar (con traza) / restaurar técnico | `pages/Usuarios.tsx`, `pages/Contratistas.tsx` | admin, sst, gestion_integral | **técnico** |
| Desactivar / activar técnico | idem | idem | **técnico** |
| Asignar obras + empleador (`contratista_id/nombre`, `deleteField`) | idem + `AsignarObrasModal` | idem | **técnico** |
| Documentos del técnico | `EditarDocumentosModal` | idem | **técnico** |
| Cambiar rol (⇄ Rol) | `Usuarios.tsx:179` | **solo admin** (UI: `UsuariosPanel` gateado por `isAdmin`) | personal |
| Editar firma (cargo/celular) | `EditarFirmaModal` | **solo admin** | personal |
| Activar/desactivar personal | `UsuariosPanel` | **solo admin** | personal |
| Invitar usuario (`setDoc` con rol) | `InvitarUsuarioModal` | **solo admin** | nuevo |
| Registro propio en la app Flutter | app (create self) | el propio usuario | propio — **no cambia** (regla `create self` aparte) |
| Auto-edición de `documentos` (app) | app | el propio usuario | propio — **no cambia** |
| CFs (`sincronizarClaims`, `emparejarNomina`, scripts `functions/scripts/*`) | Admin SDK | — | bypass de reglas, **no cambia** |

Conclusión del mapa: **ningún flujo legítimo de sst/gestion_integral escribe un rol distinto de `tecnico` ni toca un documento del personal.** Todo lo que toca personal ya es solo-admin en la UI.

## 3. Cierre propuesto (mínimo)

Reemplazar la línea `allow create, update, delete: if puedeAdministrarSST();` por:

```
      // create/update/delete administrativo:
      //  · admin: sobre cualquier doc (invitar, ⇄ Rol, ✎ Firma, activar/desactivar personal).
      //  · sst / gestion_integral (puedeAdministrarSST): SOLO cuentas de TÉCNICOS (aprobar,
      //    rechazar, asignar obras/empleador, documentos): ni escriben un rol que no sea
      //    'tecnico' (ni `role` legado), ni tocan docs del personal, ni borran.
      allow create, update, delete: if isAuthed() && rolActual() == 'admin';
      allow create, update: if puedeAdministrarSST()
                            && request.resource.data.get('rol', 'tecnico') == 'tecnico'
                            && request.resource.data.get('role', 'tecnico') == 'tecnico'
                            && (resource == null
                                || (resource.data.get('rol', 'tecnico') == 'tecnico'
                                    && resource.data.get('role', 'tecnico') == 'tecnico'));
```

### Cambios de comportamiento (explícitos)
- `sst` / `gestion_integral` **dejan de poder**: editar/desactivar personal, borrar usuarios, crear cuentas no-técnico, escribir cualquier rol ≠ `tecnico`. La UI ya les oculta todo eso (solo-admin); el cambio solo cierra el acceso por API.
- `admin` conserva todo. `puedeAdministrarSST()` **no cambia** (otras reglas lo usan).
- Documentos de técnicos legados con solo `role: 'tecnico'` siguen funcionando (defaults `'tecnico'`).

### Riesgos a revisar antes de aplicar
1. **Datos en producción:** correr `functions/scripts/audit-users-rol.js` (solo lectura) y confirmar que no hay técnicos con `rol` raro/ausente que la regla nueva dejaría sin poder editar (p. ej. un doc de personal con `rol` vacío).
2. **App Flutter:** el registro propio (`create self`) y la auto-edición de `documentos` NO cambian (reglas separadas); verificar contra el código Dart (solo lectura) que la app no escribe `users` de otros.
3. **Orden de despliegue:** es una regla RESTRICTIVA → bundle/UI primero (no hay cambio de UI necesario) y **reglas al final**; pre-verificación `prod == HEAD` normalizando CRLF/LF y post byte-idéntica, como siempre.
4. **Revisión Opus** del diff antes de aplicar (CLAUDE.md: decisiones que afectan Firestore/Auth en producción).

### Validación hecha (emulador)
La batería (`usersRolFirestoreRules.test.ts.txt`, 34 casos) se corrió contra:
- **reglas actuales:** los `[VULN]` pasan (hueco confirmado), los `[FLUJO]`, `[ADMIN]` y `[SIN CAMBIO]` pasan;
- **reglas propuestas:** los `[VULN]` se **rechazan**; los `[FLUJO]` (aprobar, rechazar+restaurar con dot-path, activar/desactivar, obras+empleador con `deleteField`, documentos, técnico legado), `[ADMIN]` (invitar, ⇄ Rol, firma, activar personal) y `[SIN CAMBIO]` (director no escribe users, auto-edición y create-self) siguen pasando — **34/34**.

## 4. Relación con el aval físico (PR #154)

El aval físico y varias reglas por rol asumen que `users.rol` es confiable. **El deploy del PR #154 está condicionado a que este cierre esté aplicado.** Hallazgo relacionado (no verificado todavía): la regla de `asignaciones` no consulta `sst_gate` al liquidar (solo `proyectos` lo hace) — ver tarea aparte.

## 5. Para aplicar

1. Mover `usersRolFirestoreRules.test.ts.txt` → `src/hooks/sigp/__tests__/usersRolFirestoreRules.test.ts`.
2. Aplicar el bloque de la sección 3 en `firestore.rules`.
3. Correr la batería (emulador) y la suite; Opus sobre el diff; deploy con OK de Giovanny + verificación `prod == HEAD` + aviso al frente SIGP.
