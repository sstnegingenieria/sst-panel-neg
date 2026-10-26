# Propuesta — proyección de verificación SST POR CONTRATISTA + registro del pago efectivo del saldo

**Estado:** PROPUESTA para co-diseño SIGP ⟷ frente SGI/SST. **Nada construido, nada desplegado.**
**Rev. 2 (26-oct):** las dos decisiones que estaban abiertas quedaron RESUELTAS por Giovanny (ver A.4 y B) y se sumó el requerimiento del **registro posterior** del pago `[R8]`.
**Contexto:** el gate por proyecto quedó desplegado el 26-oct ([PR #193](https://github.com/sstnegingenieria/sst-panel-neg/pull/193), ruleset `376b6fbb`) con su límite escrito: la proyección nombra UN contratista y un proyecto puede tener varios. Esta propuesta cierra ese límite y agrega el eslabón final de la cadena (el pago del saldo). Incorpora los **4 requerimientos del frente** y los **4 de Giovanny** (el R8 — registro posterior del pago — llegó con la rev. 2), cada uno marcado `[R1]..[R8]`.
**Datos que fijan el diseño** (censo 26-oct, prod): 16 proyecciones hoy · 35 proyectos en el tramo liquidable, 35/35 mono-contratista y alineados · 2 proyectos multi-contratista aguas arriba · **ya existe un contratista con 2 asignaciones vivas en el mismo proyecto** (Héctor ×2) · 1 sola administración directa en la historia (cancelada).

---

## Parte A — proyección por contratista

### A.1 Modelo

- Misma colección `verificaciones_sst`, **doc nuevo por (proyecto, contratista)** con id determinístico **`{proyectoId}__{contratistaId}`** `[R1]` — la regla hace `get()` directo sin query. El separador `__` no colisiona: los ids de Firestore de ambas colecciones no lo usan (verificable en la migración; si apareciera uno, la migración FRENA y reporta).
- Shape: la `VerificacionSst` de siempre (identidad del proyecto + `contratista_id`/`contratista_nombre` + `sst_gate` + `historial`) con dos campos nuevos:
  - **`contratista_id` CONGELADO al crear** `[R2]`: la CF lo escribe una vez y jamás lo cambia (además viaja en el doc id — dos anclas). El guardarraíl "PROHIBIDO agregar campos económicos" se conserva.
  - **`activa: boolean`** `[R6]`: mantenida por la CF — `true` mientras el contratista tenga ≥1 asignación VIVA (no cancelada/liquidada... ver A.4); la cola de SST filtra `activa == true`. **La proyección huérfana no se borra** (su historial es evidencia de avales dados): sale de la cola por el flag, patrón del campo `activa` de Tareas.
- **Un doc por contratista cubre sus N asignaciones** en el proyecto (dato: Héctor ×2): SST avala al CONTRATISTA en el proyecto, no a la asignación — semántica confirmada con el caso real.

### A.2 Escritor único (CF) — el que entra después `[R4]`

`sincronizarVerificacionSst` se amplía con un **trigger sobre `proyectos/{pid}/asignaciones/{aid}`** además del actual sobre `proyectos/{pid}`:

- Asignación de tipo `contratista` creada/cambiada → **upsert del doc `{pid}__{cid}`** (identidad + estado del proyecto + `activa`); el merge **JAMÁS toca `sst_gate` ni `historial`** (dueño: SST — invariante del 3a intacto).
- **El contratista que entra tarde recibe su proyección sola, sin tocar las existentes** — por construcción: cada upsert es a SU doc id. Nace con gate ausente (= pendiente de SST, que DENIEGA el pago — nunca "el que llega tarde cobra sin gate").
- Recalcula `activa` por contratista a partir de las asignaciones vivas del proyecto (recálculo-desde-cero idempotente, patrón comprasProyecto).
- La CF sigue creando/actualizando desde el tramo del proyecto que hoy dispara proyección (`facturado` en adelante) — la cola de SST no gana ruido de proyectos lejos de liquidar. *Punto de co-diseño: si el frente quiere la cola ANTES (p. ej. desde `en_ejecucion`) para revisar con tiempo, es un parámetro del trigger, no un rediseño.*

### A.3 Caso mixto — "no aplica" ≠ "falta el aval" `[R5]`

- Las **administraciones directas NO generan proyección** (cierran por la rama de gestores sin gate — decisión 04-sep ratificada 26-oct; no sale dinero a terceros). La distinción es **por construcción**: la proyección solo existe para `tipo: 'contratista'`.
- En pantalla, la distinción se DICE, no se infiere: la ficha pinta por asignación — directa → chip gris **"gate SST: no aplica (administración directa)"** · contratista con proyección → el estado real del gate · contratista SIN proyección (proyecto aún fuera del tramo) → **"pendiente de proyección"** (y la regla deniega el pago). **La ausencia jamás se lee como hueco NI como aval** — tres rótulos distintos para tres hechos distintos.

### A.4 La regla del gate (evolución de la desplegada)

`avalSstParaLiquidar()` cambia UNA cosa: el `get()` apunta al doc del contratista de la asignación que se liquida —

```
get(/databases/$(database)/documents/verificaciones_sst/$(proyectoId + '__' + resource.data.contratista_id))
```

- `contratista_id` se lee del **RESOURCE** (el doc existente), no del request — y la rama de gerencia no puede tocarlo (`hasOnly` no lo incluye): **no es suplantable en el mismo write**.
- Lo demás queda idéntico: tres términos, GA+admin, deniega sin doc. Una asignación `legacy` sin `contratista_id` → get falla → deniega (falla cerrado; la migración de P2-2 ya denormaliza contratista_id en las legacy — verificar en el paso 0 del build).
- **✅ DECISIÓN RESUELTA (Giovanny, 26-oct): la regla del PADRE** (`proyectos → liquidado_contratista`) deja de hacer su propio `get()` del gate cuando el doc por-proyecto deje de ser la fuente — **"la garantía vive donde sale el dinero"**: el padre solo exige que todas las asignaciones vivas estén liquidadas (coherencia del `resumen_asignaciones` del lote), y cada una ya pasó su propio gate por contratista. *"Duplicar la verificación arriba crearía dos verdades sobre lo mismo y la de arriba sería la menos precisa."* La alternativa del doc agregado queda DESCARTADA.

### A.5 Migración de las 16 actuales — se parten, no se rehacen `[R3]`

- Dry-run primero (disciplina de la casa): por cada proyección existente `{pid}` → crear `{pid}__{cid}` donde `cid` = el `contratista_id` que la proyección YA nombra, **copiando `sst_gate` + `historial` ÍNTEGROS** (el aval dado es un hecho histórico del contratista nombrado — no se re-pide); los contratistas ADICIONALES del proyecto (hoy: 0 en el tramo, medido) nacen con doc propio sin gate.
- El doc viejo `{pid}`: se conserva **congelado** como histórico (cero borrado físico, restricción 5.1) con marcador `migrada_a: ['{pid}__{cid}', …]`; la cola de SST y la regla dejan de leerlo.
- Secuencia de deploy (contractual): CF nueva → migración con dry-run y OK → bundle (UI nueva de cola/chips) → **regla al final** (restrictiva: re-apunta el get). Ventana avisada a los dos frentes (protocolo v2.5.82).

### A.6 Lo que cambia para cada pantalla

- **Cola de SST** (su pantalla — por eso el co-diseño): una fila por (proyecto, contratista) con filtro `activa`; el aval se marca por contratista. Su flujo ✔/⚠ no cambia de mecánica.
- **Bandeja GA**: el chip del gate pasa a ser el **peor estado entre los contratistas vivos** del proyecto (con desglose en tooltip); el botón Liquidar por asignación ya consulta por contratista.
- **Ficha**: chip de gate POR ASIGNACIÓN (A.3).

---

## Parte B — registro del pago efectivo del saldo `[R7]`

**El hueco**: `liquidada` registra la CONCILIACIÓN (cuánto se le debe) pero no el HECHO de que el dinero salió — fecha, medio, comprobante. Para la Trinorma es el eslabón final de la cadena y hoy no existe.

- **`asignacion.pago_saldo { fecha, valor, medio: transferencia|consignacion|cheque|otro, comprobante_url?, registrado_por, por_nombre, fecha_registro }`** — patrón EXACTO de `pago_cliente` (B2) y del anticipo; evidencia a Storage `proyectos/{pid}/pagos_saldo/{aid}/{uuid}`.
- Lo registra **gerencia_administrativa (+admin)** SOBRE una asignación ya `liquidada` — la vía "ya-liquidada se sigue editando" que la regla y la batería del gate ya fijan (casos C1/C2: editar una liquidada no re-evalúa el gate); reglas: **+`'pago_saldo'` al hasOnly de gerencia** (una palabra) + bloque de Storage.
- Valor prellenado con `saldo_final` de la liquidación + advertencia si difiere (patrón factura/pago); **sobre-giro y saldo $0 visibles, jamás recortados**.
- **Cola nueva en la bandeja GA: "Saldos por pagar"** (liquidadas sin `pago_saldo`) con antigüedad y umbral nombrado — el patrón de "Por facturar" (#145): listar no alcanza, tiene que doler verlo.
- **✅ DECISIÓN RESUELTA (Giovanny, 26-oct): el CIERRE del proyecto EXIGE el pago del saldo registrado** en todas las liquidadas con saldo > 0 — la simetría con `pago_cliente` es correcta: *"cerrar un proyecto con un saldo de contratista sin pagar sería cerrar sobre una mentira"*. Entra a `puedeCerrarseProyecto` (UI) + la regla del cierre (patrón del `pago_cliente != null` de la liquidación anticipada).
- **`[R8]` LA SALIDA — registro POSTERIOR del pago hecho por fuera del panel** (requerimiento de Giovanny, mismo criterio de las facturas de junio: *"el panel refleja lo que pasó, aunque se entere después"*): el formulario permite registrar el pago como **hecho pasado** — `fecha` = la fecha REAL del pago (no la del registro; `fecha_registro` ya es campo aparte) + marca **`registro_posterior: true`** cuando la fecha es anterior al día del registro, visible en ficha y bandeja como chip "registrado después" (rótulo honesto, no castigo — patrón del registro histórico de asignaciones del 03-sep). **Lo que no puede es faltar**: con la salida construida, el gate del cierre no tiene excepción.
- No cambia estados: el pago es el hecho final DENTRO de `liquidada` (como `pago_cliente` dentro de su estado en la anticipada).

## Fuera de alcance (nombrado)

- Los creates que nacen en `liquidada` (registro histórico / legacy) siguen sin gate — residual G1/G2 del PR #193, decisión aparte.
- La app Flutter no se toca; `verificaciones_sst` no la lee.
- `obras_asignadas` de técnicos directos (pregunta c del frente): respondida con dato en la bitácora v2.5.91 — su limpieza no nos rompe si excluye técnicos vinculados a contratistas con obras sigp activas (nuestra CF re-agrega) y si asumen que un técnico sin el campo deja de ver esas obras EN LA APP.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
