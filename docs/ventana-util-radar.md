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
interés (Menor Cuantía)», «Presentación de oferta»…). Un proceso en fase de
oferta que antes pasó por manifestación es uno cuya puerta ya se cerró; eso no
es estimación, es el origen diciendo por dónde pasó. De los 729 persistibles de
hoy, **574 traen fase** (79 %).

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

## 4 · La puerta de la manifestación, en números de hoy

De los **34 procesos de menor cuantía vivos y trabajables o casi** del pozo de
hoy, la fase dice que la puerta ya cerró en **3**:

```
2026-11-18  TMSA-SAM-11-2026              fase = Presentación de oferta
2026-11-17  SAMC-019-2026                 fase = Presentación de oferta
2026-11-17  FDLT-SAMC-035-2026 (160714)   fase = Presentación de oferta
```

Los tres tienen plazo de cierre **futuro** y son intrabajables: es exactamente
el caso que Giovanny describió, y el panel lo nombra con esas palabras. Pero son
**3 de 34**, no todos.

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

Lo que el raspador **no** arregla: la puerta de la manifestación sigue sin
publicarse en datos abiertos. Esa fecha solo entra si alguien la lee del pliego,
y hoy el único lugar del mundo donde puede quedar escrita es nuestro propio
documento (`patchCronogramaManual`).

**Y lo que ningún raspador arregla: si los 58 vivos de hoy no están en la
bandeja, el problema no es la fuente.** Esa es la medición que sigue, y es la
que decide si este bloque continúa o se replantea.

---

## Cómo se midió

- `p6dx-8zbt` vía SoQL 2.1 (`date_diff_d` + pipe `|>` para agrupar por proceso
  antes de distribuir), 30 peticiones. **Ningún `>=` ni `<=` sobre una columna
  de fecha**, en ninguna consulta de este documento.
- Percentiles exactos sobre el histograma completo de días (no muestreo).
- El pozo vivo del §5 se trajo filtrando por estado, se pasó por
  `ingerirSecop()` con el léxico v1.1 real y se juzgó con `porQueNoAlcanza()` —
  en un harness temporal que **no queda en la suite** (lee un archivo de
  `_datos/`, gitignoreado).
- Alcance: territorio **Distrito Capital de Bogotá + Cundinamarca** y las
  **4 modalidades** de `MODALIDADES_INGESTA`. No es el país: es el universo del
  radar. Los literales se verificaron contra el dataset antes de usarlos
  (`Distrito Capital de Bogotá` lleva tilde; una modalidad mal escrita devuelve
  menos filas sin error).
