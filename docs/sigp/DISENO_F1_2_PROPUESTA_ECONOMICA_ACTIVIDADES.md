# F1.2 — Propuesta económica en PDF para Actividades (DISEÑO)

**Estado: DISEÑO APROBABLE — no implementado.** Bloque aparte del PR C (evidencias
fotográficas). Autor: Code, 18-ago-2026, a pedido de Giovanny.
**Rev. 2 (18-ago)**: pregunta de agrupación RESUELTA por Giovanny (N actividades →
1 propuesta, §6); principio de los dos ejes independientes (§6b); pregunta nueva
de VERSIONES planteada con hallazgos, sin resolver (§6c).
**Rev. 3 (18-ago)**: versiones RESUELTAS por Giovanny — mismo PEA por negociación;
mecanismo elegido por Code: **patrón LPU** (vigente/histórica + `reemplaza_a` con
swap atómico), no la subcolección del cotizador (§6c).

## 1. Contexto

Toda actividad —normal o emergencia— pasa por una **propuesta económica** que se
envía al gestor de Claro antes de (o junto con) su aprobación. Giovanny confirmó
que se usa **el mismo formato de cotización del panel (CM-FT-CT-19)**, alimentado
con las líneas del LPU de la actividad.

## 2. Decisión rectora: reusar el GENERADOR, jamás la entidad `cotizaciones`

**Por qué no la entidad:** la CF `crearProyectoAlAprobar` (functions/crearProyecto.js)
dispara sobre docs de `cotizaciones` cuando transicionan a `aprobada` — si las
propuestas de actividades fueran cotizaciones, Claro generaría **30–40 proyectos
vacíos al mes**. Además el ciclo de estados, el versionado en subcolección y el
consecutivo COT tienen semántica comercial que no aplica aquí.

**Qué tan reusable es el generador (verificado en código):** MUY reusable.
`generarPdfCotizacion(datos, assets)` en `utils/sigp/cotizacionPdf.ts` **no recibe
la entidad `Cotizacion`** — recibe el objeto plano `DatosPdfCotizacion`:

```
consecutivo · versionNum · asunto · clienteNombre · clienteNit? · contacto? ·
fechaEmision · validezDias · esquema · aiu? · ivaPct · items: ItemCotizacion[] ·
totales: TotalesCotizacion · modo: ModoAgrupacion · actividades? · condiciones ·
observaciones? · firmante
```

Cero duplicación de layout: el módulo nuevo solo **arma ese objeto** desde una
actividad. Piezas que ya calzan sin tocar el generador:
- El subtítulo del documento ya es "Propuesta económica" (M1).
- La introducción institucional es genérica ("…presentamos para su consideración
  la siguiente propuesta económica…").
- El cuadro ISO pinta `CM-FT-CT-19` — el MISMO formato, confirmado por Giovanny.
  (Si el SGI algún día quisiera código propio, el punto de cambio es el patrón
  `isoControl.ts`; frente Trinorma con Ingrid, fuera de este diseño.)
- `doc.setTitle` ya dice "— Propuesta económica NEG Ingeniería".

**Cambios al generador: NINGUNO.**

## 3. Mapper actividad → DatosPdfCotizacion (módulo nuevo `utils/sigp/propuestaActividad.ts`)

- **Líneas**: `LineaActividad → ItemCotizacion` campo a campo (codigo, descripcion,
  unidad, valor_unitario, cantidad, total→valor_total, `origen: 'lpu'`). La línea
  ya es snapshot del LPU del alcance — misma filosofía de fidelidad.
- **Agrupación**: `modo: 'actividad'` con una entrada `Actividad {id, nombre}` por
  actividad fuente; nombre del grupo = `sede · zona · descripción corta`. Esto hace
  NATURAL tanto la propuesta de una actividad como la agrupada (pregunta abierta §6).
- **Totales**: `calcularTotales(items, esquema, aiu, ivaPct, {modo:'actividad', actividades})`
  con `esquema = cliente.condiciones_comerciales.esquema_impuestos` y sus
  `aiu_defaults` — el mismo redondeo a peso del snapshot comercial.
- **Cabecera**: cliente/NIT del doc de `clientes`; `contacto` = `solicitante` de la
  actividad; `asunto` = descripción de la actividad (o título editable); `firmante`
  = usuario actual (perfil); `condiciones` con los presets existentes; `validezDias`
  editable (default 30).
- ⚠ **Línea negociada**: la propuesta imprime la cantidad DESPEJADA con precisión
  completa — es exactamente el número criticado del acta de julio. La decisión
  pendiente de F2 sobre cómo mostrar cantidades negociadas **aplica también aquí**
  y este diseño la hereda cuando exista (no se resuelve en este bloque).

## 4. Consecutivo propio, server-side (control documental Trinorma)

La ficha interna de la actividad NO lleva consecutivo (decidido en F1 PR A), pero
un documento con código ISO que **sale hacia el cliente** debe ser numerado y
rastreable:

- **Prefijo nuevo `PEA`** (Propuesta Económica de Actividad), formato `PEA-YYYY-NNN`,
  contador anual `consecutivos/PEA_{año}` — un string más en `PREFIJOS_VALIDOS`
  de la CF `generarConsecutivo` (functions/consecutivos.js). El nombre del prefijo
  queda a ratificación de Giovanny.
- ⚠ **Cambio de Cloud Function ⇒ requiere OK explícito para deploy** (restricción 5.6).
- Se quema **al EMITIR** el PDF (contigüidad ISO, patrón COT/VIS: los borradores no
  queman número; preservación del consecutivo ante fallo — cero huecos).

## 5. Persistencia mínima (colección nueva `propuestas_actividad`)

Un doc por VERSIÓN emitida (ver mecanismo completo en §6c): `consecutivo`,
`version`, `estado: vigente|historica`, `reemplaza_a`, `cliente_id` (eje
`esResidenteDe`), `actividad_ids[]`, snapshot congelado de items+totales+asunto,
`fecha_emision`, `firmante`, `pdf_hash` (SHA-256, regla 8) y `pdf_url`.
**Lo emitido es inmutable** — cada PDF que salió conserva su snapshot y su hash.

**Sinergia con el hito de aprobación**: al marcar la aprobación de la actividad,
el campo `referencia` puede precargar el consecutivo `PEA-…` — la cadena
propuesta → aprobación queda referencial, criterio Trinorma.

**Deploys cuando se implemente** (todos con OK aparte): regla Firestore de la
colección (read internos + `esResidenteDe`; create según rol; sin delete) +
ruta de Storage + prefijo en la CF. Orden aditivo: reglas/CF antes del merge.

## 6. ✅ RESUELTO (Giovanny, 18-ago): N actividades → 1 propuesta

Una propuesta puede cubrir varias actividades — el cotizador ya agrupa así
(modo 'actividad'). Consecuencias de diseño:

- **Selección múltiple → un documento, un solo consecutivo PEA.** Cada actividad
  fuente es un grupo del PDF (nombre = sede · zona · descripción corta) con su
  subtotal; el resumen económico consolida el total del documento.
- **Puntero en la actividad**: `actividad.propuesta_id` + `propuesta_consecutivo`
  (denormalizado para pintar el chip sin lecturas extra), escritos por un patch
  builder al emitir (`patchVincularPropuesta`, con entrada de historial — la UI
  no improvisa writes). El puntero apunta a la propuesta VIGENTE que la cubre;
  una re-emisión lo actualiza y el historial conserva la cadena.
- **La aprobación SIGUE SIENDO POR ACTIVIDAD, no por propuesta.** El gestor puede
  aprobar dos de tres: cada actividad lleva su propio hito `aprobacion` con SU
  fecha y SU `referencia` (que puede citar `PEA-… + correo/FAD`). **El doc de la
  propuesta NO tiene estado de aprobación** — jamás se colapsa la decisión por
  actividad a un estado del documento; su único ciclo documental es
  `emitida → reemplazada` (si aplica §6c).

## 6b. 📐 PRINCIPIO: dos ejes de agrupación INDEPENDIENTES (propuesta ≠ acta)

El mismo patrón aparece dos veces, en ejes distintos:

- La **propuesta** agrupa por **lo que el gestor pidió en un momento**.
- El **acta** (F2) agrupa por **mes de cierre** — la regla del §7: la actividad
  entra al acta del mes en que queda COMPLETA.

Una actividad puede estar en la propuesta PEA-X y caer en el acta de un mes
distinto al de sus hermanas de propuesta (aprobada después, ejecutada después).
**Las dos relaciones NO se encadenan**: el acta jamás se arma "desde propuestas"
ni la propuesta restringe a qué acta entra la actividad. En el modelo, la
actividad lleva DOS punteros independientes: `propuesta_id` (este bloque) y el
futuro puntero al acta (F2) — ninguno se deriva del otro.

## 6c. ✅ RESUELTO (Giovanny, 18-ago): la propuesta SE VERSIONA bajo el mismo PEA

**Decisión**: una negociación es un evento comercial y tiene UN número
(`PEA-YYYY-NNN`), con las versiones que haga falta. **Fundamento (para la
bitácora)**: los formatos del SGI ya se versionan bajo un código fijo — es la
práctica de control documental de la casa — y quemar un consecutivo por ronda
haría que el conteo de la serie sobre-reporte la cantidad de propuestas emitidas.

### Mecanismo elegido (Code): patrón LPU — vigente/histórica + `reemplaza_a` con swap atómico

**NO se copia la subcolección del cotizador** (allá la versión es dueña de los
ítems y se edita ahí; acá el documento es fotografía derivada de las
actividades). El patrón LPU (C1.1) calza exacto y ya está probado:

- **Cada versión es SU PROPIO doc plano e inmutable** en `propuestas_actividad`,
  con id determinístico **`pea-YYYY-NNN_v{n}`** (reintentar una re-emisión no
  duplica — patrón doc-id de obra-espejo/proyectos): `consecutivo` (el MISMO en
  todas las versiones de la serie), `version: n`, `estado: 'vigente'|'historica'`,
  `reemplaza_a` (id de la versión anterior), `actividad_ids[]` DE ESA versión
  (el conjunto puede cambiar entre rondas), snapshot items+totales+asunto,
  `fecha_emision`, `firmante`, `pdf_hash`, `pdf_url`.
- **Consecutivo: se quema UNA vez, al emitir la v1.** Re-emitir NO llama la CF —
  el contador de la serie cuenta negociaciones, no rondas (el fundamento).
- **Re-emisión = UN `writeBatch` atómico** (el swap endurecido de C1.1):
  crear `_v{n+1}` como `vigente` + patch de `_v{n}` → `historica` + los patches
  de punteros en las actividades (ver abajo). Jamás dos vigentes ni cero.
  **La consecuencia conocida de C1.1 (subcolección huérfana si muere a mitad)
  AQUÍ NO EXISTE**: la propuesta no tiene subcolección — el batch es completo o
  no es (límite 500 writes; una propuesta cubre pocas actividades, sobra).
- **La vigente se identifica sin ambigüedad** por `estado == 'vigente'` dentro
  del `consecutivo`, con helper canónico **`propuestaVigenteDe()`** (calco de
  `lpuVigente()` — única resolución, nada de `.find()` sueltos). Las históricas
  se conservan con su PDF y su hash — nada se borra (restricción 5.1).
- **Punteros de la actividad tras re-emitir** (requisito): `propuesta_consecutivo`
  denormalizado **no cambia nunca** dentro de la serie (propiedad del mismo-PEA:
  sigue apuntando bien por construcción); `propuesta_id` apunta al doc de la
  versión VIGENTE y se re-apunta DENTRO del mismo batch del swap. Actividades
  que SALEN del conjunto en la ronda nueva → puntero limpiado en el mismo batch
  (ya no las cubre la vigente); las que entran → puntero fijado. Todo vía patch
  builders (`patchVincularPropuesta`/`patchDesvincularPropuesta`) con entrada de
  historial — la UI no improvisa writes.
- **PDF**: `versionNum` del generador pinta "Versión N" bajo el consecutivo y en
  el encabezado corrido (soporte nativo, costo cero — hallazgo de la rev. 2);
  etiqueta de cara al gestor con `etiquetaVersion` (v1 sin sufijo). Un PDF
  inmutable por versión en Storage (`propuestas_actividad/{docId}/documento.pdf`).
- **Re-emitir solo desde la vigente** (una histórica no se corrige — la
  corrección siempre nace de la última foto). La aprobación por actividad (§6)
  no se toca: re-emitir no borra hitos ya marcados; qué actividades siguen en la
  ronda nueva lo decide la negociación, no una regla del sistema.

## 7. 📌 REGLA DEL ACTA — decisión registrada para el diseño de F2

**La actividad entra al acta del MES EN QUE QUEDA COMPLETA (aprobada Y ejecutada),
no del mes en que se ejecutó.** Resuelve el arrastre entre meses que describió
Giovanny: lo que no alcanza el corte simplemente cae en el acta siguiente, sin
nada especial que hacer. (También registrada como comentario en
`types/sigp/actividad.ts`; F1.1 muestra la antigüedad de las pendientes con el
umbral `UMBRAL_PENDIENTE_ACTA_DIAS` para vigilar las que envejecen.)
