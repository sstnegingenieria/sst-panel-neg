# F1.2 — Propuesta económica en PDF para Actividades (DISEÑO)

**Estado: DISEÑO APROBABLE — no implementado.** Bloque aparte del PR C (evidencias
fotográficas). Autor: Code, 18-ago-2026, a pedido de Giovanny.

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

Doc por propuesta emitida: `consecutivo`, `cliente_id` (eje `esResidenteDe`),
`actividad_ids[]`, snapshot congelado de items+totales+asunto, `fecha_emision`,
`firmante`, `pdf_hash` (SHA-256, regla 8) y `pdf_url` (Storage
`propuestas_actividad/{id}/v1.pdf`). **Inmutable una vez emitida** — corrección =
propuesta nueva con `reemplaza_a` (versionado por reemplazo, no subcolección).

**Sinergia con el hito de aprobación**: al marcar la aprobación de la actividad,
el campo `referencia` puede precargar el consecutivo `PEA-…` — la cadena
propuesta → aprobación queda referencial, criterio Trinorma.

**Deploys cuando se implemente** (todos con OK aparte): regla Firestore de la
colección (read internos + `esResidenteDe`; create según rol; sin delete) +
ruta de Storage + prefijo en la CF. Orden aditivo: reglas/CF antes del merge.

## 6. ⚠ PREGUNTA ABIERTA (planteada, NO resuelta — la consulta Giovanny)

**¿Una propuesta cubre UNA actividad o puede agrupar VARIAS en un solo documento?**

El diseño soporta ambas (`actividad_ids[]` + agrupación por actividad). Implicaciones:
- **1:1** — trazabilidad simple (una PEA por hito de aprobación), más consecutivos.
- **Agrupada** — menos documentos y el gestor decide en bloque, pero la aprobación
  se registra POR actividad: la misma `referencia PEA-…` se repetiría en N hitos
  (válido y auditable), y una aprobación PARCIAL del grupo obligaría a decidir si
  la PEA se considera parcialmente aceptada o se re-emite por las restantes.

## 7. 📌 REGLA DEL ACTA — decisión registrada para el diseño de F2

**La actividad entra al acta del MES EN QUE QUEDA COMPLETA (aprobada Y ejecutada),
no del mes en que se ejecutó.** Resuelve el arrastre entre meses que describió
Giovanny: lo que no alcanza el corte simplemente cae en el acta siguiente, sin
nada especial que hacer. (También registrada como comentario en
`types/sigp/actividad.ts`; F1.1 muestra la antigüedad de las pendientes con el
umbral `UMBRAL_PENDIENTE_ACTA_DIAS` para vigilar las que envejecen.)
