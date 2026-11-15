# ¿Con cuánta ventana real llega el radar?

*Medido el 14-nov-2026 sobre `p6dx-8zbt`, **histórico completo**, sin un solo
filtro de fecha. Fuente: PORTAL DE DATOS ABIERTOS - SECOPII.*

Giovanny navegó la bandeja y no vio ningún proceso vigente: todas las menores
cuantías ya habían pasado la fecha de manifestación de interés. Su hipótesis es
que el conjunto abierto publica los procesos cuando ya terminaron o están por
terminar.

**La hipótesis, en su forma general, no se sostiene.** Hoy, con el criterio
real del radar y el veredicto real de la bandeja, el conjunto abierto tiene
**58 procesos trabajables** en el territorio — 31 menores cuantías, 23 mínimas
y 4 de régimen especial — publicados hace una mediana de **4 días**. Solo
**3** son el caso que él describe (plazo vivo con la manifestación ya cerrada).

Eso no refuta lo que él vio: lo reubica. Si el pozo tiene 58 y la bandeja
estaba vacía de vigentes, el problema no está en la fuente, y **dónde está es
exactamente lo que esta medición no puede ver** (§5).

---

## Lo que esta medición contesta, y lo que no

Las preguntas **1, 2 y 3** son sobre el conjunto abierto: medidas acá, completas.

Las **4 y 5** son sobre lo que el radar **trajo** y sobre lo que la bandeja
**muestra**, y las dos viven en Firestore de producción. **Esta sesión no tiene
credenciales de producción** —ni llave de lectura, ni
`GOOGLE_APPLICATION_CREDENTIALS`, ni ADC de `gcloud`— así que **no las
contesto**: no las estimo, no las modelo y no las deduzco. Quedan con el
comando exacto que las contesta (§6) y con lo que sí se puede afirmar sin
leerlas (§7).

El **§5 es un añadido** que no estaba en el pedido y que terminó siendo lo que
más dice: el pozo vivo de hoy, medido con el código real.

---

## 1 · Los campos de fecha reales — y el que no existe

El dataset tiene **59 columnas**; **11 son `calendar_date`**. Listadas del
endpoint de metadatos, no de memoria:

| campo | nombre que le da el publicador |
|---|---|
| `fecha_de_publicacion_del` | Fecha de Publicacion del Proceso |
| `fecha_de_ultima_publicaci` | Fecha de Ultima Publicación |
| `fecha_de_publicacion_fase` | Fecha de Publicacion (Fase Planeacion Precalificacion) |
| `fecha_de_publicacion_fase_1` | Fecha de Publicacion (Fase Seleccion Precalificacion) |
| `fecha_de_publicacion` | **Fecha de Publicacion (Manifestacion de Interes)** |
| `fecha_de_publicacion_fase_2` | Fecha de Publicacion (Fase Borrador) |
| `fecha_de_publicacion_fase_3` | Fecha de Publicacion (Fase Seleccion) |
| `fecha_de_recepcion_de` | **Fecha de Recepcion de Respuestas** |
| `fecha_de_apertura_de_respuesta` | Fecha de Apertura de Respuesta |
| `fecha_de_apertura_efectiva` | Fecha de Apertura Efectiva |
| `fecha_adjudicacion` | Fecha Adjudicacion |

De los tres que pediste:

- **Fecha de publicación → `fecha_de_publicacion_del`.** Existe.
- **Fecha de cierre / recepción de ofertas → `fecha_de_recepcion_de`.** Existe,
  y **verificado que es un PLAZO y no un hecho**: agrupando por estado del
  procedimiento (sobre las dos modalidades principales), las filas en estado
  `Publicado` la tienen en el **futuro** en **397 de 803 con fecha** — una
  fecha que ya hubiera ocurrido no podría estar por venir en la mitad de los
  procesos abiertos. En los estados terminales está siempre en el pasado
  (`Seleccionado` 131.403 · `Evaluación` 55.128 · `Cancelado` 20.956).
  Matiz anotado: hay 99 filas en `Evaluación` y 3 en `Cancelado` con cierre
  futuro — inconsistencias del origen, y de todos modos no cazables (las
  ofertas ya se cerraron o el proceso se canceló). Por eso el §5 filtra por
  estado y excluye esos tres.
- **Fecha límite de manifestación de interés → NO EXISTE.** No la sustituí por
  ninguna otra.

### El campo que parece serlo y no lo es

`fecha_de_publicacion` se llama *«Fecha de Publicacion (Manifestacion de
Interes)»*: **es la fecha en que se publicó esa fase, no su límite.** Está a un
sufijo de distancia de `fecha_de_publicacion_del`, lo que lo vuelve el
sustituto más tentador del dataset. La trampa ya estaba anotada en nuestro
propio mapeo —*«Ídem — no confundir con `fecha_de_publicacion_del` (trampa de
nombre)»*— y la ausencia del límite ya estaba medida sobre **10.421 procesos de
2026**:

> `fecha_de_recepcion_de` **vale lo mismo en la fila de manifestación y en la
> de oferta en el 85,8 %**: es el límite de la OFERTA, estampado también sobre
> la fila de la manifestación. No hay fecha que comparar.

**Lo que sí dice por dónde va el proceso es la FASE** («Manifestación de
interés (Menor Cuantía)», «Presentación de oferta»…). De los 729 persistibles
de hoy, **574 traen fase** (79 %).

Que la fase sea lo único disponible tiene una consecuencia que hay que decir
antes de usarla: **«está en fase de oferta» no es «el plazo de manifestación
venció»**. Lo primero es un hecho del origen; lo segundo es una inferencia del
flujo normativo. El §4 desarma ese paso y dice exactamente qué sostiene y qué
no.

---

## 2 · La ventana que da la entidad

**Unidad: el PROCESO, no la fila.** El dataset trae una fila por fase (1,14 a
5,36 filas por proceso según modalidad), así que contar filas infla. Por
proceso se toma `min(fecha_de_publicacion_del)` y `max(fecha_de_recepcion_de)`
— **la lectura más generosa posible** de «la ventana que da la entidad». Si
incluso así sale corta, la conclusión es más fuerte.

Ventana = cierre − publicación, en **días calendario**, histórico completo:

| modalidad | procesos | con las dos fechas | mín | p25 | **mediana** | p75 | máx |
|---|---|---|---|---|---|---|---|
| **Mínima cuantía** | 106.881 | 104.367 (97,6 %) | −83 | 4 | **6** | 7 | 1.387 |
| **Selección Abreviada de Menor Cuantía** | 78.307 | 77.265 (98,7 %) | −22 | 7 | **11** | 19 | 392 |
| Sel. Abr. Menor Cuantía *Sin Manifestación* | 1.071 | 1.050 (98,0 %) | 0 | 8 | **14** | 20 | 54 |
| Contratación régimen especial (con ofertas) | 15.937 | 15.309 (96,1 %) | −199 | 4 | **7** | 12 | 819 |

Son ventanas distintas y no se promedian: **la mínima cuantía da 6 días y la
menor cuantía 11.**

### Los nulos, contados y no descartados

| modalidad | sin publicación | sin cierre | sin ninguna | **suma = procesos** |
|---|---|---|---|---|
| Mínima cuantía | 2.116 (2,0 %) | **0** | 398 (0,4 %) | ✓ 106.881 |
| SA Menor Cuantía | 656 (0,8 %) | 1 | 385 (0,5 %) | ✓ 78.307 |
| SA MC Sin Manifestación | 21 (2,0 %) | 0 | 0 | ✓ 1.071 |
| Régimen especial | 549 (3,4 %) | 0 | 79 (0,5 %) | ✓ 15.937 |

Los cuatro baldes cuadran con el total de procesos en las cuatro modalidades, y
el balde nulo del histograma coincide exactamente con la suma de los tres —
verificación incluida en la corrida. **No hay un 30 % sin fecha límite**: el
cierre está en el 96–99 % de los procesos, y de hecho **en mínima cuantía no
falta ni uno**. Lo que falta, cuando falta, es la publicación.

### Dos rarezas del origen, medidas

- **Ventana negativa** (cierre ANTES de publicar): 38 en mínima (0,04 % de
  104.367), 7 en menor (0,01 % de 77.265), 10 en régimen (0,07 % de 15.309),
  0 en sin-manifestación. Es inconsistencia del origen; el radar las mapea
  verbatim y no corrige ninguna a mano.
- **Ventana de 0 días** (cierra el mismo día que se publica): 30 en mínima,
  188 en menor (0,24 %), 224 en régimen (1,46 %), 1 en sin-manifestación.

---

## 3 · La ventana útil, restando el retraso de la fuente

El retraso medido de la fuente es de **2 días** (`HALLAZGOS_AUDITORIA.md`, y
con su salvedad explícita: *«supuse un retraso parejo de dos días; no medí su
variación»*). Por eso acá va la banda de 1, 2 y 3 días en vez de un número
solo:

| modalidad | mediana útil −1d | **−2d** | −3d | muertos al nacer −1d | **−2d** | −3d |
|---|---|---|---|---|---|---|
| Mínima cuantía | 5 | **4** | 3 | 2.431 (2,3 %) | **13.701 (13,1 %)** | 24.806 (23,8 %) |
| SA Menor Cuantía | 10 | **9** | 8 | 2.035 (2,6 %) | **4.889 (6,3 %)** | 7.585 (9,8 %) |
| SA MC Sin Manifestación | 13 | **12** | 11 | 1 (0,1 %) | **5 (0,5 %)** | 14 (1,3 %) |
| Régimen especial | 6 | **5** | 4 | 865 (5,7 %) | **2.182 (14,3 %)** | 3.247 (21,2 %) |

*Denominadores: 104.367 · 77.265 · 1.050 · 15.309 procesos con las dos fechas.
«Muertos al nacer» = ventana útil ≤ 0 días, o sea que la fila llega al radar el
día del cierre o después.*

**Con el retraso de 2 días: la mínima cuantía llega con 4 días de mediana y el
13,1 % llega muerta. La menor cuantía llega con 9 y pierde el 6,3 %.**

Dos cosas que este número NO es:

1. **No es el 11,4 % ya medido.** Ese mide otra cosa —los que no se pueden
   ARMAR con el umbral de `evaluarVentana` (1 día hábil para mínima, 2 para
   menor)— sobre los 255 procesos del mes anterior que califican con el léxico.
   El 13,1 % de acá es «ventana ≤ 0» sobre el histórico completo. El primero es
   más exigente y más chico; los dos son correctos sobre su propio denominador.
2. **No incluye la puerta de la manifestación**, que en menor cuantía es la que
   manda. Medido antes: la manifestación se abre, **5 días después (mediana) se
   abre la fase de oferta** y 4 días después vence. En un proceso de ~9 días la
   puerta se cierra sobre el día 5 — y al día 6 el cierre todavía muestra 3 o 4
   días por delante. **Para la menor cuantía, los 9 días de ventana útil son
   unos 3 reales**, y esa resta no se puede hacer con un campo porque el campo
   no existe (§1).

---

## 4 · Los 3 de la manifestación — y sobre qué base se afirman

> **Corregido el 14-nov, por una pregunta del revisor:** si el límite de
> manifestación no existe como campo (§1), ¿sobre qué base se afirma que esos 3
> «la tienen cerrada»? La primera versión de esta sección decía *«la fase dice
> que la puerta ya cerró»* sin declarar que **es un proxy de fase, no una
> fecha**. Se declara ahora, y el número cambia de significado.

**Lo que mide el 3, literalmente.** La condición es
`manifestacionCerrada()`, y no compara ninguna fecha:

```
fase === 'Presentación de oferta'
  && fases_previas incluye 'Manifestación de interés (Menor Cuantía)'
```

Y de dónde sale cada parte, verificado en el código y en el dato:

- **`fases_previas` se deriva SOLO del texto de `referencia_del_proceso`.** El
  origen acumula los sufijos de fase en la referencia:
  `"TMSA-SAM-11-2026 (Manifestación de interés (Menor Cuantía)) (Presentación de oferta)"`.
  No se mira ninguna otra fila.
- **`fase` sale de la fila representante, que es la primera del grupo** por
  `id_del_proceso` — sin criterio de fase más avanzada ni de fecha. Que eso
  equivalga a «la fase ACTUAL» es cierto **en este pozo** porque **0 de 5.957
  procesos tienen más de una fila**; no es una garantía general del dataset.

**Las filas crudas de los 3.** Una sola fila cada uno, ya en fase de oferta,
con la publicación de la fase de manifestación (`fecha_de_publicacion`) en
**None** y `fecha_de_recepcion_de` = `fecha_de_apertura_de_respuesta` = el
plazo de la OFERTA:

```
TMSA-SAM-11-2026             pub 2026-11-05  ·  recepción 2026-11-18
SAMC-019-2026                pub 2026-11-10  ·  recepción 2026-11-17
FDLT-SAMC-035-2026 (160714)  pub 2026-11-11  ·  recepción 2026-11-17
```

**No hay ninguna fecha de manifestación que comparar.** Por lo tanto:

| | |
|---|---|
| **qué es el 3** | un **conteo de procesos cuya fase actual dice que ya pasaron la manifestación** |
| **qué NO es** | una medición de que un plazo venció |
| **de dónde sale el salto** | de que el flujo normativo de la menor cuantía va manifestación → sorteo → oferta. Eso es **inferencia del flujo**, no un dato de la tabla |

**Y no toca los 58.** El proxy solo EXCLUYE: si fuera demasiado estricto, el
número de trabajables sería **61 en vez de 58** — nunca menos. La conclusión
general del documento no depende de él.

**Un pendiente que esto destapa, de texto y no de dato:** la frase que la
bandeja muestra en esas filas afirma más de lo que el proxy sostiene —
*«La manifestación de interés ya cerró — no se puede presentar aunque el plazo
siga abierto»* (`bandejaLicitaciones.ts`, un solo lugar, con tests que la
fijan). Lo que el dato sostiene es *«ya pasó a fase de presentación de
oferta»*. Queda anotado como candidato de redacción, sin cambiar: es texto que
lee Karen.

---

## 5 · EL POZO VIVO DE HOY — medido con el código real

Esto no estaba en el pedido y es lo que más dice. Las filas se trajeron
filtrando **por ESTADO del procedimiento** (`Publicado`, `Abierto`, `Borrador`,
`En aprobación`, `Aprobado`, `Suspendido`) — **ningún filtro de fecha**, la
futuridad se calcula después — y se pasaron por `ingerirSecop()` y
`porQueNoAlcanza()`, las funciones REALES del radar y de la bandeja. Sin
segunda implementación de ningún criterio.

| | |
|---|---|
| filas en estados vivos | 6.913 |
| procesos distintos que representan | **5.957** |
| veredicto del léxico v1.1 | `si` 518 · `probable` 211 · `no` 5.228 |
| **persistibles** (`si` + `probable`) | **729** |
| de esos, con fecha de cierre | 725 |
| sin ninguna fecha del origen | 4 *(balde aparte, no descartados)* |
| cierre en el **futuro** | **61** (8,4 % de 725) |
| cierre ya pasado | 664 (91,6 % de 725) |
| días por delante de los 61 | mín 3 · p25 4 · **mediana 5** · p75 12 · máx 166 |

Y el veredicto REAL de la bandeja sobre esos mismos 729:

| | |
|---|---|
| **TRABAJABLES** (`porQueNoAlcanza` → `null`) | **58** |
| no alcanzan · plazo vencido | 664 |
| no alcanzan · manifestación cerrada | 3 |

**Los 58, por modalidad:** menor cuantía **31** · mínima cuantía **23** ·
régimen especial **4**.

### Y se publicaron hace poco

De los 58 trabajables, 49 traen fecha de publicación (9 no):

| días desde que se publicó | |
|---|---|
| mín 2 · p25 3 · **mediana 4** · p75 8 · máx 653 | |
| publicados hace más de 7 días | 16 (33 % de 49) |
| publicados hace más de 14 días | 4 (8 % de 49) |
| publicados hace más de 30 días | 2 (4 % de 49) |

**Dos tercios se publicaron dentro de la última semana.** El radar lleva 7 días
corriendo dos veces al día, así que la ventana de ingesta los cubría.

> **Esta cifra se recalcula con un comando**, y no hay que creerle a la fecha de
> este documento: `npx vitest run --config vitest.pozo.config.ts`. Ver «La cifra
> del día se recalcula» al final.

---

## 6 · Preguntas 4 y 5 — NO MEDIDAS, con el comando que las mide

No las estimo. Las dos salen de dos campos que ya están en cada documento
—`creado_en` y `cronograma.cierre`— así que **se calculan hacia atrás** en
cualquier momento; lo que falta es poder leer `licitaciones` en producción.

Queda el extractor listo, de **solo lectura**, con la llave de lectura que ya
existe y ya se usa para los censos:

```bash
node scripts/sigp/censo-ventana-radar.mjs --llave <ruta de la llave de LECTURA>
```

Escribe `_datos/censo-ventana-radar.json` con los campos crudos de cada
documento (`estado`, `migrado`, `modalidad`, `creado_en`, `cronograma`,
`radar.fase`, `radar.fases_previas`, `radar.origen_fecha`) y **no juzga nada**:
el veredicto lo calcula después el código real (`nacioVencida`,
`vencioEsperando`, `repartirRadar`, `porQueNoAlcanza`) sobre ese JSON. Un
script que reimplementara el criterio sería una segunda implementación de la
invariante — el defecto que A.2b vino a eliminar.

**Con el §5 medido, ese censo tiene una PREDICCIÓN que contrastar:** si la
bandeja está sana, hoy debería tener del orden de **58 procesos trabajables**.
Si tiene cero, lo que falla está entre la fuente y la colección, y es un
defecto nuestro — no un límite del dato.

---

## 7 · Las tres causas: dos descartadas, una viva

**(a) «El conjunto publica los procesos cuando ya terminaron».** **Descartada
como explicación general.** El 8,4 % de los persistibles tiene cierre futuro y
**58 son trabajables hoy**, publicados hace 4 días de mediana. Lo que sí es
cierto —y es otra cosa— es que el conjunto es abrumadoramente un ARCHIVO: el
91,6 % de lo persistible ya cerró. Un radar que mire el acervo sin filtrar por
plazo ve un cementerio con 58 vivos adentro.

**(b) «El retraso de la fuente lo mata».** **Descartada como causa de lo que
Giovanny vio.** Cuesta caro —13,1 % de las mínimas muertas al nacer, 4 días de
mediana útil en vez de 6— pero no deja la bandeja en cero: los 58 de hoy
sobreviven al retraso de 2 días *por definición*, porque están vivos hoy.

**(c) «Es un problema de pantalla».** **Es la única que queda viva, y hay que
partirla en dos**, porque una mitad ya está descartada por el código:

- **Cómo se muestran: descartado.** Desde el commit `fc5cc0e` (12-nov, en
  `main` y por lo tanto en Vercel) la sección del radar se reparte en **tres
  grupos** (`repartirRadar`): **vigentes** arriba, **sin fecha** aparte, y
  **no alcanza** atenuados al final **con el motivo en cada fila**
  (`plazo_vencido`, `manifestacion_cerrada`, `ventana_insuficiente`). La página
  además imprime cuántos se vencieron esperando y cuántos llegaron ya
  cerrados. Si Giovanny vio menores cuantías con la manifestación cerrada, la
  pantalla se lo estaba diciendo con esas palabras.
- **Qué llegó a la colección: NO MEDIDO.** Si el grupo «vigentes» estaba vacío
  y la fuente tiene 58, entonces esos 58 **no están en Firestore** o **no están
  en `detectada`**. Eso es el censo del §6.

Una causa candidata que sí pude descartar sin producción: **el cambio de
léxico no es la explicación.** v1.1 solo **quitó** 5 términos (`CIVILES`,
`FISICA`, `FISICAS`, `REALIZAR ACTIVIDADES`, `REPARACION`) y **agregó un
negativo** (`SOFTWARE`); no agregó ninguno. Es estrictamente más estrecho que
v1.0, así que el léxico viejo habría traído estos 58 también — y los 58 pasan
v1.1.

---

## 8 · ¿Sirve el radar para cazar? ¿Vale el raspador?

**El radar sirve para cazar, con una condición: el trabajo tiene que ocurrir en
días, no en semanas.**

- En **mínima cuantía** la entidad da 6 días y el radar recibe 4. Con 1 día
  hábil de armado, cabe — **y cabe justo**. El 13,1 % no cabe nunca.
- En **menor cuantía** la entidad da 11 y el radar recibe 9, pero la puerta de
  la manifestación se cierra sobre el día 5: **lo real son ~3 días**, y hacen
  falta 2 de armado. Cabe por un día.
- Hoy hay **58 objetivos reales** en el territorio. No es un pozo vacío.

**El raspador vale la pena, y ahora se puede decir cuánto vale.** No arregla
nada del lado nuestro: arregla los 2 días de la fuente. Eso, sobre una mediana
de 6 días en mínima cuantía, es **un tercio de la ventana**; y recupera los
**13.701 procesos históricos (13,1 %)** que hoy llegan muertos — del orden de
los 29 al mes ya estimados. En menor cuantía el retraso cuesta menos en
porcentaje (6,3 %) pero sobre una ventana real de ~3 días **cada día pesa más**.

### HALLAZGO · el portal publica el calendario competitivo completo; el conjunto abierto no

**La cuenta de arriba —«un tercio de la ventana»— subestima el raspador, y hay
que corregirla.**

> **Evidencia: observación DIRECTA del portal, no medición nuestra.**
> Giovanny Montes entró a SECOP II el **14-nov-2026** y trajo tres capturas de
> la pantalla de detalle de un proceso. Esto no se midió, no se raspó y no se
> dedujo del dataset: se vio.

En la sección **«Cronograma»** del detalle hay **21 fechas con hora exacta**,
entre ellas:

- **`Plazo para manifestación de Interés`** — por ejemplo `24/11/2026 5:00:00 PM`
- sorteo
- lista de precalificados
- plazo de adendas
- presentación de ofertas
- informe de evaluación
- adjudicación

**Ninguna de las 21 está en el conjunto abierto**, que trae publicación y
recepción de respuestas y nada más (§1).

Y dos cosas que **sí medí** sobre el conjunto abierto, que agravan la cuenta:

| lo que el conjunto abierto hace | medido sobre el pozo vivo |
|---|---|
| **trunca todas las fechas a medianoche** | **una sola hora distinta** en 5.806 publicaciones y en 6.873 recepciones: `00:00:00`. El portal da `9:00 PM`, `5:00:00 PM` |
| **deja la categoría sin código** | `codigo_principal_de_categoria` = `UNSPECIFIED` en **1.812 de 6.913 filas (26,2 %)** |

Lo segundo pega donde más duele: la clasificación del radar es híbrida —el
código manda cuando existe, el texto habla cuando no—, así que en **un cuarto
del pozo** el radar está decidiendo solo por texto, con `probable` como mejor
veredicto posible. El portal publica los UNSPSC de ese cuarto.

**Valuación corregida.** El raspador no vale 2 días sobre 6:

1. **el calendario competitivo completo** — incluido el único dato que decide
   si una menor cuantía es alcanzable, hoy inaccesible salvo que alguien lea el
   pliego a mano (y cuyo único lugar de registro en el mundo es nuestro propio
   documento, `patchCronogramaManual`);
2. **la hora**, que en una ventana de 4 días útiles vale hasta un día;
3. **la categoría UNSPSC** del 26,2 % que hoy llega sin código;
4. y además los **2 días** de latencia, que era lo único que la cuenta vieja
   contaba.

### Las dos restricciones de diseño que salen de las mismas capturas

**1 · El cronograma NO está en la lista de resultados, solo en el detalle.** La
lista trae entidad, referencia, descripción, fase actual y fecha de
publicación. Entonces el diseño correcto es:

> **la lista para DETECTAR; el detalle solo para lo que ya pasó el léxico.**

Eso es un orden de **~10 aperturas al día**, no 58 ni 729. **Cualquier diseño
que abra el detalle de todo queda descartado de entrada** — por volumen, por
cortesía con el portal y porque no hace falta: lo que decide si vale abrir un
proceso ya está en la lista.

**2 · CONDICIÓN ABIERTA Y BLOQUEANTE: en la captura el usuario tenía sesión
iniciada.** Está **sin confirmar** si el detalle es visible sin cuenta. No se
supone en ninguna dirección: ni que sí (el diseño entero dependería de algo no
verificado) ni que no (se descartaría un bloque viable por una suposición).
**Hasta que se confirme, el diseño del raspador no se cierra.**

**Y lo que ningún raspador arregla: si los 58 vivos de hoy no están en la
bandeja, el problema no es la fuente.** Esa es la medición que sigue, y es la
que decide si este bloque continúa o se replantea.

---

## 9 · LA PRUEBA PUNTUAL — `DSAJBO-SAMC-008-2026`, y va ANTES del censo

Un proceso concreto vale más que el censo completo y es inmediato. El elegido:

| | |
|---|---|
| referencia | **`DSAJBO-SAMC-008-2026`** |
| entidad | Rama Judicial — Dirección Seccional de Administración Judicial de Bogotá |
| objeto | impermeabilización sede Calle 72 (obra) |
| modalidad | Selección Abreviada de Menor Cuantía |
| precio base | **$564.337.823** |
| id interno del origen | `CO1.REQ.11355790` |

### Lo que YA está verificado, de este lado

**La fila existe en `p6dx-8zbt` y el criterio REAL del radar la admite como
trabajable.** Medido con el script versionado (`npx vitest run --config
vitest.pozo.config.ts`, corrida del 14-nov 00:33 UTC), aparece en la lista de
los 58:

```
2026-12-03 · 19 d · menor_cuantia · Rama Judicial- Dirección Seccional de
Administración Judicial de Bogotá · DSAJBO-SAMC-008-2026
```

**Consecuencia: la rama «ni siquiera está en el conjunto» queda descartada.**
Si no está en Firestore, la falla está **entre la fuente y la colección** — es
nuestra, no del dataset.

### Y el mismo proceso muestra el hallazgo del §8 en un solo caso

| | conjunto abierto | portal (capturas de Giovanny) |
|---|---|---|
| publicación | `2026-11-11 00:00:00` | **11/11/2026 9:00 PM** |
| **límite de manifestación** | **el campo no existe** | **24/11/2026 5:00:00 PM** |
| recepción de respuestas | `2026-12-03 00:00:00` | presentación de ofertas, en el cronograma |
| categoría UNSPSC | **`UNSPECIFIED`** | 72101500 · 72153204 · 81101500 |
| fase | `Presentación de observaciones` | — |

**El radar cree que quedan 19 días. La puerta real se cierra el 24-nov —
nueve días antes del plazo que el radar ve.** Ese es el daño del campo que no
existe, medido sobre un proceso con nombre y presupuesto.

### El comando — lo corre quien tenga la llave de LECTURA

```bash
node scripts/sigp/censo-ventana-radar.mjs --llave <ruta de la llave de LECTURA>
```

```bash
grep -i "DSAJBO-SAMC-008" _datos/censo-ventana-radar.json
```

### Qué dice cada resultado

| resultado | qué significa | dónde mirar |
|---|---|---|
| **está y es trabajable** | la bandeja está sana; lo que vio Giovanny era otra cosa | cerrar esta línea y volver al censo |
| **está, pero clasificada de forma que no se ve** | defecto de **criterio o de reparto** | el `estado` del documento, su `radar.senal` y `seccionDe`/`repartirRadar` |
| **no está** | defecto **entre la fuente y la colección** | la ventana de ingesta, la marca de la corrida y las guardas de `radarCorrida` — porque la fila SÍ está en el origen y SÍ pasa el léxico (verificado arriba) |

**Esto va antes que todo lo demás, incluido el censo**, y así quedó en el guion
de la sentada.

---

## 10 · Lo que el panel le muestra hoy a Karen sobre una fecha que no tenemos

*Dimensionado el 14-nov-2026 a pedido del revisor. **No construido**: acá está
lo que cuesta y lo que rompe, para decidirlo aparte. **No entra en la
sentada.***

### La asimetría, que es el argumento y no la precisión

Es la misma de siempre, la del léxico negativo:

> **Si el panel afirma que la puerta se cerró y no se cerró, Karen descarta y
> el error es INVISIBLE. Si el panel dice solo lo que el dato sostiene, Karen
> abre, mira, y el costo es un clic.**

Por eso la frase de la fila pasó de *«la manifestación de interés ya cerró — no
se puede presentar aunque el plazo siga abierto»* a **«ya pasó a fase de
presentación de oferta — si la manifestación era requisito, conviene abrirlo y
confirmar en el portal»**. Y por eso ese clic ahora tiene dónde terminar: el
portal publica el `Plazo para manifestación de Interés` con hora exacta (§8).

El mismo razonamiento, aplicado al número: para una menor cuantía el panel
muestra los días hasta la **recepción de ofertas**. El número es **correcto y a
la vez engañoso**, porque la fecha accionable es anterior y no está en la
fuente. En `DSAJBO-SAMC-008-2026` eso son **19 días mostrados contra una puerta
que cierra 9 días antes** (§9).

### Dónde vive el cálculo, y qué lo fija

| | |
|---|---|
| el cálculo | **un solo sitio**: `evaluarVentana()` en `src/utils/sigp/ventanaLicitacion.ts` (213 líneas). Recibe `cierreIso` (de `cronograma.cierre` ← `fecha_de_recepcion_de`), `modalidad`, `hoy` y `horas_utiles_dia` |
| tests que lo fijan | `ventanaLicitacion.test.ts` (37 casos) + `bandejaLicitaciones.test.ts` (83) |
| lugares que muestran un plazo **calculado** | **3**: la fila de la bandeja (`Licitaciones.tsx:662`), la ficha (`LicitacionDetalle.tsx:130`) y el alta manual (`LicitacionNueva.tsx:70` — ahí la fecha la teclea una persona) |
| lugares que muestran la fecha **cruda** | **4**: tooltip y «Cierra …» de la fila, el label de un selector, y el `Dato "Cierre"` de la ficha |

### ¿La distinción por modalidad ya existe? Sí, pero no donde hace falta

- **En el cálculo, sí**: `HORAS_ARMADO` es `Record<ModalidadLicitacion, number>`
  (mínima 4 h, menor 6 h) y `evaluarVentana` deriva de ahí los `necesarios`.
- **En el aviso, no**: el aviso existente —`faltaFechaManifestacion()`, que ya
  pinta un chip ámbar *«Falta la fecha de manifestación»* en la fila y en la
  ficha— **se decide por el rastro de fase en la REFERENCIA**, no por la
  modalidad: `fase === 'Manifestación de interés…'` o ese literal dentro de
  `fases_previas`.

### El hueco, medido

El origen **no siempre escribe el sufijo de fase en la referencia.** De las
**323** menores cuantías reales frescas del pozo (`Publicado`, publicadas en
2026):

| | |
|---|---|
| con el sufijo en la referencia → el panel **puede** declarar | 86 (**27 %**) |
| **sin** sufijo → el panel **no declara nada** | **237 (73 %)** |

Y esos 237 caen **entre los dos mecanismos**: no disparan
`faltaFechaManifestacion` (no hay rastro en la referencia) ni
`manifestacionCerrada` (su fase es `Presentación de observaciones`, no
`Presentación de oferta`). `DSAJBO-SAMC-008-2026` es uno de ellos — por eso el
panel le muestra «19 días» sin decir nada.

### Por qué no es «una frase en un sitio»

La versión fácil sería declarar **por modalidad**: toda menor cuantía tiene
puerta por norma. Choca con un dato:

> **`'Seleccion Abreviada Menor Cuantia Sin Manifestacion Interes'` mapea al
> mismo `menor_cuantia`** (35 filas vivas; 4.817 en el histórico) y **por
> definición no tiene puerta**. El string crudo de la modalidad se calcula al
> ingerir (`crudo`) pero **no se persiste** en el documento.

Así que hay dos caminos y la diferencia de tamaño es grande:

| camino | qué toca | tamaño |
|---|---|---|
| **A · declarar por modalidad y aceptar la sobre-declaración** en las «Sin Manifestación» | 1 predicado en `bandejaLicitaciones.ts` + su render en 2 lugares (fila y ficha) + tests en 1 archivo | **chico** |
| **B · distinguirlas de verdad** | persistir la modalidad cruda al ingerir → toca el mapeo y los documentos ya escritos | **otro bloque** |

**A no es deshonesto**, y es la razón de que la frase nueva ya esté redactada
en condicional: *«si la manifestación era requisito…»*. Sobre-declarar una
puerta en 35 procesos cuesta un clic; callarla en 237 cuesta el proceso. Es la
misma asimetría de arriba.

**Lo que NO se va a hacer, y queda escrito para que nadie lo proponga de
nuevo:** inventar la fecha de manifestación por regla normativa («día 5 de 9»).
Una fecha estimada mostrada como fecha es exactamente el patrón que este
documento viene desarmando — el mismo del `>=` que fabricaba pérdidas y el del
proxy de fase que afirmaba un cierre.

**No toca el reparto ni el orden** de la bandeja (`repartirRadar`,
`ordenarPorCierre`): es un chip más, al lado del que ya existe. Si en algún
momento se quisiera que esto cambie el ORDEN —que una menor cuantía sin fecha
de manifestación baje o suba—, eso sí es otro bloque y va después.

### Dónde va el aviso — la decisión, y por qué

**Camino A aprobado.** Antes de construirlo hay que decidir dónde se muestra,
porque un aviso que aparece en todas las filas de una modalidad deja de ser
información: **es papel tapiz, y Karen deja de verlo en una semana.**

**El criterio que separa las dos cosas: si la marca se puede APAGAR.**

| | se apaga | entonces es | y va |
|---|---|---|---|
| «en menor cuantía hay una puerta anterior cuya fecha no publica el conjunto abierto» | **nunca** — es verdad de toda menor cuantía, siempre | una **propiedad de la modalidad** | **una vez**, en el encabezado y en la etiqueta |
| «de ESTA licitación nadie anotó la fecha de manifestación» | **sí** — el día que alguien la escribe (`patchCronogramaManual`), desaparece de esa fila | **trabajo pendiente** | **en la fila** |

Una marca que no se puede apagar es una propiedad y va arriba. Una que se apaga
con una acción es una lista de pendientes que se vacía — y eso no es papel
tapiz, es la cola.

Así que **las dos cosas, con pesos distintos**:

1. **La invariante, una sola vez**, en los dos lugares donde ya se mira para
   saber de qué tipo es el proceso: el `title` del **chip de modalidad** que la
   fila ya pinta (`MODALIDAD_LICITACION_LABEL`), y **una línea en el encabezado
   del grupo** del radar. Hay precedente exacto para eso: el grupo «sin fecha»
   ya lleva su propia línea explicativa. **Cero elementos visuales nuevos
   repetidos.**
2. **El faltante accionable se queda como chip por fila** — el que ya existe,
   *«Falta la fecha de manifestación»* — con el disparador cambiado de
   rastro-de-fase a modalidad.
3. **Y un recorte que baja la repetición sin perder nada: el chip solo donde se
   puede actuar.** En el grupo «no alcanza» (hoy **664 de 725**) un aviso de
   puerta no aporta: ese proceso ya está fuera. Con ese recorte el chip pasa de
   «todas las menores cuantías» a **las del grupo trabajable: 31 de 58 filas de
   hoy**, y cada una se apaga cuando alguien anota su fecha.

### La sobre-declaración de las 35 NO es gratis — y el punto 2 es lo que la retira

Confirmado en pantalla: **`MODALIDAD_LICITACION_LABEL` se deriva del enum**, y
`'Seleccion Abreviada Menor Cuantia Sin Manifestacion Interes'` mapea a
`menor_cuantia`. O sea que la fila dice **«Menor cuantía» en las dos** y
**Karen no puede distinguirlas leyendo**. El clic que cuesta la
sobre-declaración se paga: abre, no encuentra puerta, y nada en la fila le
había dicho que ahí no había.

Eso cambia el orden de los dos trabajos: **persistir la modalidad cruda no es
solo para que el camino B deje de ser un bloque en tres meses — es lo que hace
que A no tenga ruido.** Con el crudo guardado, la etiqueta puede decir «Menor
cuantía (sin manifestación)» y el predicado puede saltárselas.

### Lo que cuesta persistir la modalidad cruda — y el único costo real

Los tres costos que se sospechaban, verificados uno por uno:

| sospecha | verificado |
|---|---|
| **el mapeo explícito** | `CAMPO_SECOP` es `Record<DestinoMapeado, CampoSecop>`: las claves son DESTINOS y los valores COLUMNAS, así que **dos destinos pueden apuntar a la misma columna**. Agregar `modalidad_cruda: 'modalidad_de_contratacion'` es una línea, y el `satisfies` la verifica |
| **el test textual de `secopMapeo.ts`** | **no se rompe ninguno.** Los dos chequeos estructurales trabajan sobre conjuntos: `huerfanos` sale de las columnas sin destino —y esa columna ya tenía uno— y `ambos` sale de las que están traducidas Y justificadas, y `modalidad_de_contratacion` no está en `CAMPOS_NO_MAPEADOS`. El `expect(CAMPOS_SECOP).toHaveLength(59)` cuenta columnas del DATASET, que no cambian |
| **el tamaño** | una cadena de ~45 caracteres por documento |

Y el valor ya está calculado y se tira: el resolvedor de modalidad devuelve
`{ modalidad, crudo, imprevista }` y solo se usa el primero. Guardarlo es
escribir lo que ya se midió.

**El único costo real, y hay que decidirlo:** el campo empieza a viajar **en el
próximo despliegue del radar**, porque lo escribe la Cloud Function. Y el
**PASO 2 de la sentada es justamente un despliegue del radar**, que sube lo que
`main` tenga. Entonces:

- si esto se mergea **antes** de la sentada, el despliegue del paso 2 lo lleva;
- si la sentada tiene que desplegar **solo `#278`**, esto se mergea **después**.

**No lo decido yo**: es exactamente la puerta de atrás que se pidió no usar. Lo
que sí vale decir es que no hay deploy de **reglas** involucrado — el radar
escribe con `firebase-admin`, así que las reglas de Firestore no aplican a esa
escritura.

---

## Cómo se midió

- `p6dx-8zbt` vía SoQL 2.1 (`date_diff_d` + pipe `|>` para agrupar por proceso
  antes de distribuir), 30 peticiones. **Ningún `>=` ni `<=` sobre una columna
  de fecha**, en ninguna consulta de este documento.
- Percentiles exactos sobre el histograma completo de días (no muestreo).
- El pozo vivo del §5 se trajo filtrando por estado, se pasó por
  `ingerirSecop()` con el léxico v1.1 real y se juzgó con `porQueNoAlcanza()`.

### La cifra del día se recalcula — el 58 no es folclore

El pozo cambia todos los días, así que el número de arriba sin forma de
recalcularlo se vuelve una cita vieja en tres semanas. **Queda versionado**, y
lo corre cualquiera:

```bash
npx vitest run --config vitest.pozo.config.ts
```

`scripts/sigp/pozo-vivo.pozo.ts`. Trae las filas él mismo (territorio + las 4
modalidades + estados vivos, **sin ningún filtro de fecha**), usa
`ingerirSecop()` y `porQueNoAlcanza()` reales —cero reimplementación del
criterio— e **imprime la fecha y hora de la medición al lado de cada número**,
con su denominador. Deliberadamente **fuera de la suite** (extensión `.pozo.ts`
y config propia): el pozo cambia a diario y la consulta sale a la red, así que
en la suite sería una prueba que falla por el mundo, no por el código.
Verificado: `npx vitest run` sigue en **122 archivos / 2.309 tests**.

Corrida de control del 14-nov-2026 (reproduce exacto lo de este documento):
6.913 filas · 5.957 procesos · 729 persistibles · 61 futuros · **58
trabajables** · 3 manifestación cerrada · 664 plazo vencido.
- Alcance: territorio **Distrito Capital de Bogotá + Cundinamarca** y las
  **4 modalidades** de `MODALIDADES_INGESTA`. No es el país: es el universo del
  radar. Los literales se verificaron contra el dataset antes de usarlos
  (`Distrito Capital de Bogotá` lleva tilde; una modalidad mal escrita devuelve
  menos filas sin error).
