# Especificación — proyección de verificación SST POR CONTRATISTA + registro del pago efectivo del saldo + anticipos múltiples

**Estado:** **DISEÑO CERRADO con los dos frentes (28-oct) — A CONSTRUIR.** Mandato de Giovanny: todo lo observado por el frente SGI/SST entra salvo C1(a); prioridad de construcción: **el anticipo adicional primero** (hay un contratista esperando el segundo giro).
**Rev. 4 (28-oct):** incorpora la revisión del frente SGI/SST tal como quedó ACORDADA en el ida y vuelta con Giovanny — `[A1]..[A7]`, `[B1]..[B5]`, `[C1]..[C3]`, `[F1]` integrados en su sección; **C1(a) descartado** (no existe porcentaje de anticipo pactado en la casa — se negocia caso por caso; inventar el número sería fijar una política que la empresa no tiene; el aviso queda contra el valor acordado TOTAL). Se suma el **hallazgo del `tipo` ausente** (paso 0 del 27-oct, abajo) y el censo actualizado.
**Rev. 3 (27-oct):** Parte C — anticipos múltiples `[R9]..[R14]` (caso real: un contratista pidió un segundo anticipo y el modelo actual es de campo único — los dos caminos alternativos MIENTEN: "corregir al alza" pierde la fecha y el comprobante del segundo giro, y registrarlo como reembolso produce DOBLE PAGO e infla el indicador #3). Criterio de Giovanny: *"anticipo, ajustes y saldo son la misma cadena de dinero"* — un solo bloque.
**Rev. 2 (26-oct):** decisiones resueltas por Giovanny (A.4 y B) + registro posterior del pago `[R8]`.
**Contexto:** el gate por proyecto quedó desplegado el 26-oct ([PR #193](https://github.com/sstnegingenieria/sst-panel-neg/pull/193), ruleset `376b6fbb`) con su límite escrito: la proyección nombra UN contratista y un proyecto puede tener varios. Este bloque cierra ese límite y completa la cadena de dinero: giros de anticipo → ajustes/liquidación → saldo → pago del saldo.
**Datos que fijan el diseño** (censos 26/27-oct, prod): **35 proyecciones hoy** (la base de la migración creció de 16 — el barrido de Marcela; `[A6]` el conteo se hace AL CORRER y el dry-run muestra esperado vs encontrado) · 35 proyectos en el tramo liquidable, 35/35 mono-contratista y alineados · 2 multi-contratista aguas arriba · **ya existe un contratista con 2 asignaciones vivas en el mismo proyecto** (Héctor ×2) · 1 sola administración directa en la historia (cancelada) · **79 asignaciones, 74 con anticipo girado, 0 con más de un giro por cualquier camino** (0 correcciones al alza, 3 reembolsos legítimos) · **0 ids con `__`** en proyectos y contratistas (separador verificado) · ⚠ **HALLAZGO del paso 0: 78 de 79 asignaciones NO traen campo `tipo`** (solo la administración directa lo trae explícito) — **la CF debe tratar la AUSENCIA de `tipo` como contratista (`tipo !== 'administracion_directa'`)** o saltaría casi todas las asignaciones y la cola de SST nacería vacía; confirmado con el frente porque afecta qué aparece en SU pantalla.

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
- Recalcula `activa` por contratista a partir de las asignaciones vivas del proyecto (recálculo-desde-cero idempotente, patrón comprasProyecto). ⚠ **Hallazgo del paso 0 integrado**: el filtro de la CF es `tipo !== 'administracion_directa'` — 78 de 79 asignaciones de prod NO traen el campo `tipo` y la ausencia ES contratista; filtrar por `tipo === 'contratista'` dejaría la cola vacía.
- **`[A1 — BLOQUEA, RESUELTO]` La CF arranca en `enviado_a_facturacion`** (decidido por Giovanny el 23-oct — SST gana una etapa de margen antes de que el proyecto sea liquidable). Escrito así, no abierto.

### A.3 Caso mixto — "no aplica" ≠ "falta el aval" `[R5]`

- Las **administraciones directas NO generan proyección** (cierran por la rama de gestores sin gate — decisión 04-sep ratificada 26-oct; no sale dinero a terceros). La distinción es **por construcción**: la proyección solo existe para `tipo: 'contratista'`.
- En pantalla, la distinción se DICE, no se infiere: la ficha pinta por asignación — directa → chip gris **"gate SST: no aplica (administración directa)"** · contratista con proyección → el estado real del gate · contratista SIN proyección (proyecto aún fuera del tramo) → **"pendiente de proyección"** (y la regla deniega el pago). **La ausencia jamás se lee como hueco NI como aval** — tres rótulos distintos para tres hechos distintos.

### A.4 La regla del gate (evolución de la desplegada)

`avalSstParaLiquidar()` cambia UNA cosa: el `get()` apunta al doc del contratista de la asignación que se liquida —

```
get(/databases/$(database)/documents/verificaciones_sst/$(proyectoId + '__' + resource.data.contratista_id))
```

- `contratista_id` se lee del **RESOURCE** (el doc existente), no del request — y la rama de gerencia no puede tocarlo (`hasOnly` no lo incluye): **no es suplantable en el mismo write**.
- **`[A3 — BLOQUEA]` `contratista_id` INMUTABLE en la asignación desde su CREACIÓN, fijado en reglas y con caso en la batería** — el riesgo que cierra: mover una asignación viva al contratista que está al día y liquidar con el aval equivocado. Guard de update: `request.resource.data.contratista_id == resource.data.contratista_id` en TODAS las vías (no solo la de gerencia).
- **`[A7]`** El `contratista_id` congelado que el frente pedía era además el del FORMULARIO de la app (lo construyen ellos, con su backfill de los 203); congelarlo también en la proyección — como ya estaba en A.1 — les parece bien. Dos congelamientos, dos superficies, mismo criterio.
- Lo demás queda idéntico: tres términos, GA+admin, deniega sin doc. Paso 0 verificado 27-oct: **las 79 asignaciones de prod traen `contratista_id`** — ningún legacy al que el get le falle por ausencia (y si apareciera, falla cerrado).
- **✅ DECISIÓN RESUELTA (Giovanny, 26-oct): la regla del PADRE** (`proyectos → liquidado_contratista`) deja de hacer su propio `get()` del gate cuando el doc por-proyecto deje de ser la fuente — **"la garantía vive donde sale el dinero"**: el padre solo exige que todas las asignaciones vivas estén liquidadas (coherencia del `resumen_asignaciones` del lote), y cada una ya pasó su propio gate por contratista. *"Duplicar la verificación arriba crearía dos verdades sobre lo mismo y la de arriba sería la menos precisa."* La alternativa del doc agregado queda DESCARTADA.

### A.5 Migración de las proyecciones actuales — se parten, no se rehacen `[R3]` `[A2]` `[A4]` `[A6]`

- Dry-run primero (disciplina de la casa): por cada proyección existente `{pid}` → crear `{pid}__{cid}` donde `cid` = el `contratista_id` que la proyección YA nombra, **copiando `sst_gate` + `historial` ÍNTEGROS** (el aval dado es un hecho histórico del contratista nombrado — no se re-pide); los contratistas ADICIONALES del proyecto (hoy: 0 en el tramo, medido) nacen con doc propio sin gate.
- **`[A6]` El conteo se hace AL CORRER** — el dry-run muestra **esperado vs encontrado** (el censo del 27-oct dice 35; si al correr son más, la diferencia se ve antes de aplicar, no se descubre después).
- **`[A4]`** El doc viejo `{pid}`: se conserva **congelado** como histórico (cero borrado físico, restricción 5.1) con marcador `migrada_a: ['{pid}__{cid}', …]` y **NO acepta más escrituras de `sst_gate`/`historial`** — ese bloque de reglas (denegar el write sobre docs con `migrada_a`) **lo agregan ellos** (la regla de escritura de la proyección es suya). El doc nuevo marca su origen con **`migrada_desde: '{pid}'`** y **no toca el historial copiado**.
- **`[A2 — BLOQUEA] Orden de despliegue: CF → migración → REGLA → bundle.`** La razón, escrita para que nadie la reordene: con la regla AL FINAL, la UI nueva marcaría gates en los docs `{pid}__{cid}` mientras la regla aún lee el `{pid}` congelado con el aval viejo — **la ventana fallaría ABIERTA** (se liquida contra un aval desactualizado). Con la regla ANTES del bundle, la ventana **falla CERRADA**: la regla ya lee el doc nuevo (que existe por la migración) y el bundle viejo solo deja de poder marcar gates hasta propagarse. **Durante la ventana, Ingrid NO marca gates** (aviso previo — parte del protocolo de ventanas v2.5.82, avisada a los dos frentes, con la enmienda del 26-oct en vigor: verificación byte-idéntica en el mismo acto de cada deploy).

### A.6 Lo que cambia para cada pantalla — y qué construye cada frente

- **Cola de SST** (`[A5]` — LA CONSTRUYEN ELLOS): una fila por (proyecto, contratista) con filtro `activa`, **sección de retirados** y el **aviso de pendientes** que resuelven en su pantalla — los retirados con gates pendientes no piden cambio a la CF. El aval se marca por contratista; su flujo ✔/⚠ no cambia de mecánica.
- **Bandeja GA** (nuestra): el chip del gate pasa a ser el **peor estado entre los contratistas vivos** del proyecto (con desglose en tooltip); el botón Liquidar por asignación ya consulta por contratista.
- **Ficha** (nuestra): chip de gate POR ASIGNACIÓN (A.3).
- **También construyen ellos**: el bloque de reglas que congela los docs migrados (A.5), el guard `fecha == request.time` en su rama de reglas del aval físico, y el `contratista_id` en el formulario de la app con su backfill de los 203.

---

## Parte B — registro del pago efectivo del saldo `[R7]` `[B1]..[B5]`

**El hueco**: `liquidada` registra la CONCILIACIÓN (cuánto se le debe) pero no el HECHO de que el dinero salió — fecha, medio, comprobante. Para la Trinorma es el eslabón final de la cadena y hoy no existe.

- **`[B1 — BLOQUEA, RESUELTO]` `asignacion.pagos_saldo[]` como LISTA** — cada pago `{ fecha, valor, medio: transferencia|consignacion|cheque|otro, comprobante_url, comprobante_nombre?, registrado_por, por_nombre, fecha_registro, registro_posterior? }`, con **helper de suma** y predicado **"saldo pagado" = Σ pagos ≥ `saldo_final`**. Giovanny confirma que el saldo hoy se paga de UNA sola vez — va lista igual: los helpers de suma ya existen para los giros, el costo marginal es casi cero, **y acabamos de pagar exactamente este error con el anticipo** (el campo único que el caso real desbordó). Evidencia a Storage `proyectos/{pid}/pagos_saldo/{aid}/{uuid}`.
- **`[B2 — BLOQUEA]` Comprobante OBLIGATORIO en todo pago** — y para el registro posterior es cuando MÁS se necesita (es lo único que lo ancla al hecho).
- **`[B3 — BLOQUEA]` Impuestos POR REGLA, no por builder**: `registrado_por == request.auth.uid` (nadie firma un pago con el nombre de otro) · `fecha_registro == request.time` (el momento del registro no lo decide el cliente) · `fecha <= request.time` (**no se registra un pago futuro**) · **`registro_posterior` se DERIVA** (fecha anterior al día del registro), no lo decide el cliente — el builder lo deriva y la regla valida la coherencia.
- **`[B4 — BLOQUEA]` Un pago registrado NO se sobrescribe**: se corrige o se anula con traza — mismo tratamiento que los giros de anticipo (C.1): corrección por-pago conservando fecha/comprobante/registrado_por, anulación con motivo, traza solo-crecer.
- **`[B5 — BLOQUEA]` Estrechamiento post-liquidación**: tras `liquidada`, **solo `gerencia_administrativa`/`admin` editan, y solo `compras_reembolsos` y pagos** (`pagos_saldo`); **`saldo_final` queda FIJO una vez exista un pago** (pagar contra un saldo y recalcularlo después dejaría el pago sin base). Hoy GI y GG pueden reescribir una liquidada por la rama compartida — salen.
- Lo registra **gerencia_administrativa (+admin)** SOBRE una asignación ya `liquidada` — la vía "ya-liquidada se sigue editando" que la regla y la batería del gate ya fijan (editar una liquidada no re-evalúa el gate), ahora acotada por `[B5]`.
- Valor prellenado con `saldo_final` + advertencia si difiere (patrón factura/pago); **sobre-giro y saldo $0 visibles, jamás recortados**.
- **Cola nueva en la bandeja GA: "Saldos por pagar"** (liquidadas con Σ pagos < saldo_final) con antigüedad y umbral nombrado — el patrón de "Por facturar" (#145): listar no alcanza, tiene que doler verlo.
- **✅ El CIERRE del proyecto EXIGE el saldo pagado** (Σ pagos ≥ saldo_final en todas las liquidadas con saldo > 0) — *"cerrar un proyecto con un saldo de contratista sin pagar sería cerrar sobre una mentira"*. Entra a `puedeCerrarseProyecto` (UI) + la regla del cierre (patrón del `pago_cliente != null` de la anticipada).
- **`[R8]` Registro POSTERIOR del pago hecho por fuera del panel** (*"el panel refleja lo que pasó, aunque se entere después"*): `fecha` = la fecha REAL del pago + `registro_posterior: true` DERIVADO (`[B3]`), chip "registrado después" en ficha y bandeja (rótulo honesto, no castigo). **Lo que no puede es faltar**: con la salida construida, el gate del cierre no tiene excepción.
- No cambia estados: el pago es el hecho final DENTRO de `liquidada` (como `pago_cliente` dentro de su estado en la anticipada).

---

## Parte C — anticipos múltiples: la lista de giros `[R9]..[R14]`

**El hueco** (diagnóstico 27-oct, solo lectura): `preliquidacion.anticipo` es un OBJETO ÚNICO `{fecha, valor, evidencia_url?, registrado_por}`. No existe camino honesto para un segundo giro: `patchGirarAnticipo` solo corre una vez (la transición a `anticipo_girado` lo agota) y `patchCorregirAnticipo` solo toca el `valor` — "corregir al alza" tras una segunda transferencia dejaría la suma correcta pero **la fecha y el comprobante del segundo giro no tienen dónde vivir** (el anti-patrón de las facturas de junio: un campo absorbiendo dos hechos). El rodeo peligroso es `compras_reembolsos`: un anticipo metido ahí **suma al costo del indicador #3 Y al `total_final` de la liquidación sin restarse del saldo → doble pago al contratista**.

### C.1 El modelo `[R9]`

- **`preliquidacion.giros: AnticipoGirado[]`** — cada giro con **fecha, valor, evidencia propia y quién lo registró** (mismo shape de hoy; evidencia a la ruta existente `proyectos/{pid}/anticipo/`, un archivo por giro). Append por `patchGirarAnticipo` (primer giro, desde `preliquidacion_aprobada`) y un builder nuevo `patchGirarAnticipoAdicional` (giros siguientes, desde `anticipo_girado`); ambos exigen `valor > 0` y evidencia según el flujo actual.
- **`[C1(b)]` El giro ADICIONAL exige MOTIVO y SOPORTE de la insuficiencia** — por qué el anticipo girado no alcanzó, con el comprobante del giro nuevo; el motivo viaja en el giro y en el historial. (`[C1(a)]` DESCARTADO: no hay porcentaje de anticipo pactado contra el cual avisar — se negocia caso por caso; `[C1(c)]` el aviso queda contra el valor acordado TOTAL, ver C.4.)
- **`[C2]` Giran y corrigen `gerencia_administrativa`/`admin` — EXPLÍCITO en reglas y UI; `gestion_integral` FUERA: quien avala no paga.** Hoy la vía acotada de GI (aprobar preliquidación con salvedad) podría tocar giros por el mismo `hasOnly` — se cierra con guard por-campo (si `giros` cambia → rol GA/admin), misma familia de `fijaAprobacionPreliq()`.
- **Acceso canónico retrocompatible**: helper `girosDe(pre)` = `giros ?? (anticipo ? [anticipo] : [])` y `anticipoTotalDe(pre)` = Σ valores de giros no anulados — TODO consumidor lee por los helpers, nunca el campo directo. Con esto el bundle tolera ambas formas antes, durante y después de la migración (patrón C2.1 paso 5: bundle tolerante → datos → cierre).
- **Corrección/anulación POR GIRO** (`patchCorregirAnticipo` evoluciona): corrige el valor de UN giro identificado (conserva su fecha/evidencia/registrado_por) o lo ANULA con motivo; **anular el último giro vivo revierte a `preliquidacion_aprobada`** (comportamiento actual); anular uno de varios no toca el estado. Solo gerencia (`[C2]`).
- **`[C3]` La traza de correcciones es SOLO-CRECER y SE VE en el PDF del contratista**: cada giro lleva `correcciones[]` append-only (`{fecha, por, por_nombre, valor_anterior, valor_nuevo, motivo}`) — nada se reescribe en el lugar; el PDF de preliquidación pinta los giros con sus fechas Y sus correcciones (el contratista ve exactamente qué recibió, cuándo, y qué se corrigió).

### C.2 La suma como valor efectivo — los cuatro consumidores `[R10]`

`anticipoTotalDe()` reemplaza a `pre.anticipo?.valor` en TODOS los puntos que hoy leen el valor único (enumerados con línea en el diagnóstico):

1. **Saldo de la liquidación** (`saldo_final = total_final − Σ giros − retenciones`).
2. **Guarda de sobre-giro del ajuste de átomos** (#130): el valor confirmado se compara contra la SUMA — con giros múltiples, comparar contra uno solo avisaría de menos.
3. **Incurrido del cierre anticipado** (suma de las no liquidadas).
4. **PDF de preliquidación del contratista**: anticipo = la suma; con N>1 el PDF lista los giros con sus fechas (el contratista ve exactamente qué recibió y cuándo).

`resumen_asignaciones.anticipos_girados` y el **gate de ejecución** siguen contando por PRESENCIA (≥1 giro) — semántica intacta. Prefill de corrección y advertencias de la ficha pasan a los helpers.

### C.3 `anticipo_girado` = hito del PRIMER giro `[R11]`

El estado deja de ser "el anticipo" y pasa a ser "**hubo primer giro**": el primer giro transiciona (como hoy), los siguientes se registran DENTRO del estado sin moverlo (patrón `pago_cliente` dentro de su estado). Nada aguas abajo cambia de disparador: la ejecución abre con el primer giro, que es lo que siempre significó.

### C.4 Aviso de giro sobre el valor acordado `[R12]` — **también para el giro único: hoy no existe**

`patchGirarAnticipo` solo exige `valor > 0` — **nada frena hoy registrar un anticipo mayor al valor acordado**, y con varios giros la suma cruza el límite sin que nadie lo note. Se construye el aviso en el REGISTRO (girar, girar adicional y corregir al alza): si la **suma resultante** supera el `valor_contratista` vigente, el formulario lo dice **con las dos cifras a la vista** (suma tras el giro vs valor acordado) — **advertencia, jamás bloqueo** (puede haber razón) — y la entrada de historial deja constancia de que **se registró sabiéndolo** ("⚠ registrado con sobre-giro a la vista: Σ X sobre acordado Y"). Mismo patrón de la guarda de sobre-giro del #130 y de la guarda de facturas del #145: el panel no se interpone, pero nadie puede decir que no lo vio.

### C.5 El camino del reembolso se cierra con palabras, no con bloqueos `[R13]`

La pantalla de `compras_reembolsos` gana una nota permanente: **"Un anticipo NO se registra aquí"** con el porqué en una línea — un reembolso SUMA al costo del proyecto (indicador #3) y al total a pagar de la liquidación; un anticipo registrado como reembolso se pagaría DOS VECES (como reembolso y dentro del saldo) e inflaría el costo. No se bloquean conceptos por texto (frágil y falso-positivo); la defensa es que quien está por hacerlo lea por qué no. Hoy la única defensa es que a nadie se le haya ocurrido (censo: 0 casos).

### C.6 Migración de los 74 anticipos existentes `[R14]`

- Dry-run → OK → aplicación → post-verificación (disciplina de la casa): por cada preliquidación con `anticipo`, escribir **`giros: [anticipo]`** — el objeto ÍNTEGRO en posición 0, **conservando fecha, valor, evidencia y quién lo registró; nada se pierde y nada se reinterpreta** — y retirar el campo singular en el MISMO write. Post-verificación: 74/74 con `girosDe()` ≡ al objeto previo, byte a byte campo por campo.
- **Orden contractual**: bundle con helpers retrocompatibles PRIMERO (sirviéndose, verificado por marcador) → migración → (opcional) retiro del fallback en un PR posterior. Un bundle viejo leyendo `anticipo.valor` tras la migración vería vacío — por eso el orden no es sugerencia.
- **Reglas**: el guard del PR #125 que conserva la PRESENCIA del anticipo para gestores (que nadie borre un giro por la puerta de atrás) se EXTIENDE al array `giros` — un gestor no puede vaciarlo ni acortarlo; corrección/anulación siguen siendo de gerencia con traza. Va en el deploy de reglas del bloque (ventana avisada, enmienda del 26-oct aplicada: verificación byte-idéntica en el mismo acto del deploy).

### C.7 Encaje con la Parte B

El pago del saldo (`pago_saldo`, B) y los giros (C) son los dos extremos de la misma cadena: **giros (suma) → ajustes/liquidación → saldo → pago del saldo**. La cola "Saldos por pagar" y el cierre-exige-pago de B quedan correctos por construcción con C: el `saldo_final` que B paga ya descuenta la suma de giros.

---

## Parte F — los creates que nacen en `liquidada` entran a la MISMA ventana de reglas `[F1]`

El residual G1/G2 del PR #193 deja de ser residual: **el CREATE directo en `liquidada` (registro histórico) queda acotado a `gerencia_administrativa`/`admin`, con MOTIVO obligatorio, y SOLO para proyectos anteriores al 26-oct-2026** (la fecha en que el gate existe — un "histórico" de un proyecto posterior sería un bypass con otro nombre); **la vía `legacy` NO nace liquidada**. Va en la misma ventana de reglas del bloque.

---

## Parte D — SOLICITUD de anticipo adicional (DISEÑADA 28-oct, EN PAUSA — entra después de A y B)

**El cambio**: el giro adicional pasa de UN paso (quien registra decide y gira) a DOS, con dos
personas — **Proyectos solicita, Marcela evalúa y gira o devuelve**. Sin paso de aprobación
intermedio (decisión explícita de Giovanny: la evaluación de Marcela ES el segundo par de ojos;
una aprobación formal sería trámite sin control nuevo). Calca el flujo de órdenes de compra, que
ya funciona. **Solo aplica al giro ADICIONAL** — el primer anticipo viene pactado desde la
preliquidación y se queda exactamente como está.

### D.1 Modelo — en la asignación, lista append-only (misma doctrina que giros y pagos)

```ts
asignacion.solicitudes_anticipo?: SolicitudAnticipo[]

interface SolicitudAnticipo {
  estado: 'solicitada' | 'devuelta' | 'girada'
  monto_propuesto: number
  /** El motivo de la insuficiencia (C1b) — por qué lo girado no alcanza. */
  motivo: string
  /** SOPORTE 1 — del CONTRATISTA: prueba POR QUÉ hace falta (obligatorio).
   *  Storage proyectos/{pid}/solicitudes_anticipo/{aid}/{uuid}.
   *  ⚠ DISTINTO y SEPARADO del comprobante del giro (soporte 2, que prueba
   *  que SE PAGÓ y vive en giros[].evidencia_url) — jamás un campo compartido. */
  soporte_contratista_url: string
  soporte_contratista_nombre?: string
  solicitado_por: string
  por_nombre?: string
  fecha_solicitud: Timestamp
  /** Devolución NO terminal (patrón OC rechazada): vuelve a quien la hizo con
   *  el motivo VISIBLE; editable y reenviable — cada vuelta queda en el
   *  historial de la asignación. */
  devolucion?: { fecha: Timestamp; por: string; por_nombre?: string; motivo: string }
  /** Al girar: puntero al giro RESULTANTE en giros[] (la solicitud no guarda
   *  el dinero — lo guarda la lista de giros, con la maquinaria de la Parte C
   *  tal cual: fecha real + comprobante de la transferencia + suma + aviso
   *  sobre-acordado). */
  giro_indice?: number
  girada?: { fecha: Timestamp; por: string; por_nombre?: string }
}
```

### D.2 El flujo

1. **Proyectos solicita** (roles que gestionan proyectos, botón en la tarjeta del contratista,
   estado `anticipo_girado`): monto propuesto + motivo de la insuficiencia + soporte del
   contratista → `solicitada`. Builder puro `patchSolicitarAnticipo` (valida y ejecuta — monto > 0,
   motivo, soporte obligatorios).
2. **Marcela evalúa desde su bandeja** (cola nueva "Solicitudes de anticipo" en Gestión
   Administrativa, patrón de la cola de revisión de OCs — contador + lo que se evalúa a la vista:
   monto propuesto, motivo, soporte del contratista, Σ ya girada y valor acordado):
   - **Gira**: registra con la FECHA REAL y el COMPROBANTE de la transferencia →
     `patchGirarDesdeSolicitud` ejecuta el giro por la maquinaria de la Parte C
     (`giros[]` append, aviso sobre-acordado, historial) Y marca la solicitud `girada` con
     `giro_indice` — un solo writeBatch. El monto girado puede diferir del propuesto (gira lo
     que giró tesorería); si difiere, queda dicho en el historial con las dos cifras.
   - **Devuelve con motivo** (como devuelve una OC): `devuelta`, no terminal — el solicitante la
     ve con el motivo, la edita y la reenvía (`solicitada` otra vez, historial encadenado).
3. **"Nadie solicita y gira"**: el builder de girar rehúsa si `girada_por == solicitado_por`
   (cubre también a admin, que está en los dos lados por respaldo); los roles ya separan el caso
   normal (gestores no giran — C2; gerencia no gestiona proyectos).
4. **El giro adicional DIRECTO (un paso) se retira de la UI** al entrar este flujo — el botón
   "➕ Anticipo adicional" de gerencia se reemplaza por la cola; `patchGirarAnticipoAdicional`
   queda como la maquinaria interna que `patchGirarDesdeSolicitud` invoca. Como con la OC: el
   camino de dos pasos ES el camino.

### D.3 Reglas — UNA palabra, y en LA MISMA ventana única

- `'solicitudes_anticipo'` entra al hasOnly de la rama de GERENCIA de asignaciones **ya en la
  ventana única del bloque** (aditiva e INERTE hasta que exista el flujo) — así la Parte D
  posterior NO abre otra ventana sobre el archivo. Los gestores escriben la solicitud por su
  rama (campo nuevo, sin hasOnly de gestores); el guard de que un gestor no toque `giros` sigue
  intacto — solicitar no es girar.
- La máquina de la solicitud (solicitada/devuelta/girada, quién-no-gira-lo-suyo) la imponen los
  builders + UI, como la máquina de cotizaciones y la de OCs — las reglas no la codifican.

### D.4 Lo que NO cambia

- El primer anticipo (pactado en la preliquidación): flujo actual intacto, sin solicitud.
- Los giros YA registrados: este flujo entra después y no toca lo registrado.
- El caso real de hoy se resolvió con el giro directo que ya está en producción.

**Estado: DISEÑO EN PAUSA — se construye con OK, después de las Partes A y B.**

## Fuera de alcance (nombrado)

- La app Flutter no se toca; `verificaciones_sst` no la lee.
- `obras_asignadas` de técnicos directos (pregunta c del frente): respondida con dato en la bitácora v2.5.91 — su limpieza no nos rompe si excluye técnicos vinculados a contratistas con obras sigp activas (nuestra CF re-agrega) y si asumen que un técnico sin el campo deja de ver esas obras EN LA APP.

## Secuencia de construcción (mandato 28-oct)

1. **PR C-1 — anticipos múltiples** (PRIORIDAD: hay un contratista esperando el segundo giro): motor + consumidores + aviso + guard de reembolsos + UI; migración de los 74 con bundle tolerante primero; reglas del guard de presencia + `[C2]` en la ventana coordinada.
2. **PR A — proyección por contratista**: CF → migración → regla → bundle (`[A2]`, falla cerrada; Ingrid sin marcar gates en la ventana).
3. **PR B — pagos del saldo** + `[B5]` estrechamiento post-liquidada + `[F1]` creates en liquidada (misma ventana de reglas).
4. **PR D — solicitud de anticipo adicional** (diseñada 28-oct, EN PAUSA — se construye con OK de Giovanny después de A y B). Su única palabra de reglas ('solicitudes_anticipo' al hasOnly de gerencia, aditiva e inerte) entra YA en la ventana única del bloque para no abrir otra ventana sobre el archivo.
5. **Coordinación**: la reunificación de Licitaciones va PRIMERO que cualquier deploy de reglas nuestro; ventanas avisadas a los dos frentes; enmienda del 26-oct en vigor en cada deploy.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
