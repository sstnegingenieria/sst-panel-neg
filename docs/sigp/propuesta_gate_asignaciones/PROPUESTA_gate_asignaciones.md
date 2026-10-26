# Propuesta — gate SST en la liquidación de `asignaciones` (solo vivía en la UI)

**Estado:** PROPUESTA para el frente SIGP. **No hay ningún cambio de reglas aplicado** en esta rama: solo documentos de referencia.
**Dueño:** frente SIGP (Giovanny) — `proyectos/{id}/asignaciones` y la liquidación al contratista son módulos del SIGP. El frente SST/SGI **no** despliega esto: el SIGP lo revisa, decide, rebasa y despliega en sus módulos.
**Base vieja:** el diff y el test se escribieron sobre `firestore.rules` en el blob `69ad640` (rama de trabajo en `af1ac1c`, anterior a #153–#160). **Requieren rebase sobre `main` antes de usarse**; el diff `.txt` NO se aplica tal cual.
**Verificación:** no se re-corrió el test en esta tarea de respaldo. Antes de usarlo, correrlo en el emulador sobre el `firestore.rules` rebasado (ver §6).

## 1. El hallazgo

La regla de `match /asignaciones/{asignacionId}` (dentro de `proyectos/{proyectoId}`) tiene una rama de **GERENCIA** que aprueba, gira y **liquida**:

```
rolActual() in ['gerencia_administrativa', 'admin', 'gerencia_general', 'gestion_integral']
&& request.resource.data.diff(resource.data).affectedKeys()
     .hasOnly(['estado', 'preliquidacion', 'liquidacion', 'compras_reembolsos', 'historial', 'fecha_actualizacion'])
&& (!fijaAprobacionPreliq() || rolActual() == 'gerencia_administrativa' || salvedadPreliq() != '')
```

Esa rama **no consulta `verificaciones_sst/{proyectoId}.sst_gate`**. El gate "no esquivable" (aval SST de que el contratista está al día en formatos antes de liquidar) solo se aplicaba en la UI (`AsignacionesProyecto`). La regla de `proyectos` sí lo exige para `liquidado_contratista`; la de `asignaciones` no.

**Consecuencia:** un usuario de gerencia (actor mínimo del bypass: `gerencia_administrativa`, que no está en `puedeCrearProyectos`) podía llevar una asignación de contratista a `liquidada` con el gate `pendiente`, `con_novedad`, sin campo `sst_gate`, o con aval de **otro** proyecto, escribiendo directo a Firestore. El estado `liquidada` es el que habilita pagar el saldo al contratista.

## 2. Cierre propuesto

Función nueva `avalSstParaLiquidar()` dentro de `match /asignaciones/...` y un `&& avalSstParaLiquidar()` en la rama de gerencia (diff completo: `firestore.rules.diff.txt`):

```
function avalSstParaLiquidar() {
  return request.resource.data.get('estado', '') != 'liquidada'
      || resource.data.get('estado', '') == 'liquidada'
      || (rolActual() != 'gestion_integral'
          && get(/databases/$(database)/documents/verificaciones_sst/$(proyectoId))
               .data.get('sst_gate', {}).get('estado', '') == 'al_dia');
}
```

Lectura de los tres términos:

| Término | Efecto |
|---|---|
| `request.estado != 'liquidada'` | Lo que **no llega** a `liquidada` (cancelar, aprobar, girar anticipo…) no pide gate. |
| `resource.estado == 'liquidada'` | Un doc que **ya** está liquidada no re-evalúa la transición (se sigue editando — p. ej. un reembolso posterior — sin pedir el aval otra vez). |
| `rolActual() != 'gestion_integral' && gate == 'al_dia'` | Para **llegar** a `liquidada` hace falta el aval `al_dia` de la proyección del proyecto, y quien liquida no puede ser `gestion_integral` (ver decisión 1). |

**Falla cerrada:** si no existe proyección `verificaciones_sst/{proyectoId}` (la CF solo la crea desde `facturado`), el `get()` falla y la regla deniega — el mismo resultado que el builder de la UI, que solo liquida con el proyecto en `pagado_cliente`/`facturado`.

**Sin exención por `tipo`.** La administración directa la cierran los **gestores** por su propia rama (sin gate — decisión del 04-sep) y la gerencia no tiene función ahí; eximirla en la rama de gerencia dejaría a una etiqueta editable (`tipo`) como único candado de una vía que admite anticipo/liquidación con saldo. El test E3/E3b lo cubre.

## 3. Cambios de comportamiento (explícitos)

- Gerencia **deja de poder** llevar una asignación a `liquidada` sin aval `al_dia` del **mismo proyecto** (por API). La UI ya lo exigía; el cambio cierra el acceso directo.
- `gestion_integral` **deja de poder** liquidar por la rama de gerencia (ver decisión 1).
- Sin cambios para: cancelar, aprobar, girar anticipo, editar una asignación ya liquidada, la rama de gestores (director/auxiliar/GG/admin como gestores) ni la administración directa.

## 4. Decisiones que le tocan al SIGP

**Decisión 1 — ¿`gestion_integral` liquida? (la propuesta dice que no).**
`gestion_integral` puede **escribir el gate** (regla de `verificaciones_sst`), así que si también pudiera liquidar podría avalarse a sí misma y liquidar. La UI (`puedeLiquidarUI`) y la regla del padre `proyectos` ya la excluyen de liquidar; la propuesta alinea `asignaciones`. Su respaldo sigue siendo la aprobación de preliquidación (con salvedad). Casos A9/A10 del test. *Si el SIGP quiere que GI pueda liquidar, hay que replantear quién puede escribir el gate — no basta con quitar el `!= 'gestion_integral'`.*

**Decisión 2 — ¿qué pasa con `cancelada → liquidada` en un proyecto CANCELADO?**
Un proyecto con cierre anticipado (estado `cancelado`) no tiene proyección `verificaciones_sst` → con esta regla la liquidación de lo ya incurrido queda **cerrada** por la rama de gerencia. Hoy también está cerrada en la UI (el builder exige `pagado_cliente`/`facturado`), así que no hay regresión funcional; pero si el negocio necesita liquidar lo incurrido de un proyecto cancelado, hace falta una **vía explícita** (con su propia autorización/traza), no un hueco por ausencia de proyección. Caso B7 del test (marcado "decisión pendiente del dueño"). Con proyecto vivo y gate `al_dia`, `cancelada con incurrido → liquidada` sí pasa (A7/B5).

## 5. Residuales conocidos (la propuesta NO los cierra)

El gate **no queda total** mientras existan estos dos nacimientos directos en `liquidada` por `create` (otra vía, sin cambios en esta propuesta):

1. **Registro histórico retroactivo** de gerencia (afirmar "se pagó por fuera del panel", con motivo — condición de Giovanny 03-sep). Caso G1.
2. **Migración con id fijo `legacy`**. Caso G2 — seguimiento anotado: pedir el aval o prohibir saldo en estos creates.

Además, la **administración directa** se cierra sin gate por la rama de gestores (decisión 04-sep); la propuesta lo preserva (E1–E3c) pero el SIGP debería confirmar que sigue siendo la decisión vigente.

## 6. Cómo aplicar (para el SIGP)

1. **Rebasar** sobre `main` (trae #153–#160; `firestore.rules` cambió en `horarios_personales`, `ausentismos`, `jornadas`, etc. — la zona de `asignaciones` puede haberse movido). Aplicar a mano el bloque de `firestore.rules.diff.txt`: la función `avalSstParaLiquidar()` y el `&& avalSstParaLiquidar()` en la rama de gerencia.
2. Mover `asignacionesGateFirestoreRules.test.ts.txt` → `src/hooks/sigp/__tests__/asignacionesGateFirestoreRules.test.ts` (extensión `.txt` aquí para que no entre al `npm test`; requiere emulador). Correr:
   `npx firebase emulators:exec --project demo-neg --only firestore "npx vitest run --config vitest.emulator.config.ts src/hooks/sigp/__tests__/asignacionesGateFirestoreRules.test.ts"`
3. Cobertura del test (por grupos): **A** bypass denegado (gate pendiente / con_novedad / sin campo / sin proyección / aval de otro proyecto / GI / cancelada con incurrido / lote atómico) · **B** regresión del flujo normal con `al_dia` · **B7** proyecto cancelado sin proyección · **C** asignación ya liquidada no re-evalúa · **D** cancelar no pide gate · **E** administración directa · **F** actores de control (anti-falso-403) · **G** residuales de creación.
4. Revisión Opus del diff rebasado (CLAUDE.md: reglas de producción), y luego deploy con OK de Giovanny + verificación `prod == HEAD` (normalizando CRLF/LF) + post byte-idéntica. Es una regla **restrictiva**: bundle/UI primero (no hay cambio de UI), reglas al final.
5. Un solo ejecutor a la vez sobre `firestore.rules` (archivo compartido).

## 7. Relación con otros frentes

- Va en la misma familia que `sigp/propuesta-users-rol` (escalada por `users.rol`): ambas debilitan lo que autoriza por rol/aval. Sin `users.rol` cerrado, un `sst`/`gestion_integral` podría reescribirse el rol y sortear cualquier gate por rol; conviene cerrar `users.rol` primero.
- **No depende** del PR #154 (aval físico en Verificación SST), pero comparte el campo `sst_gate`: el aval físico cambia *cómo* SST avala, esta propuesta exige *que exista* el aval `al_dia` al liquidar.
