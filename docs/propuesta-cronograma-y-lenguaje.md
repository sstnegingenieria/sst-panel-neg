# Dos propuestas: el cronograma de menor cuantía, y el lenguaje del módulo

Las dos nacen de lo que Giovanny vio en la pantalla el 12-nov-2026. **Nada de
esto está implementado**: es lo que se propone, con lo que se midió debajo.

---

# PARTE 1 · El cronograma de menor cuantía

## 1.1 Lo primero: mi diagnóstico de arranque era falso

Al abrir el dataset parecía que el problema estaba resuelto: hay una fila por
**fase**, y una de las fases se llama «Manifestación de interés (Menor
Cuantía)». La conclusión fácil era que `fecha_de_recepcion_de` sobre esa fila es
el límite de manifestación.

**Lo medí y no es así.** Sobre 10.421 procesos de 2026 con las dos fases:

| campo | ¿igual en la fila de manifestación y en la de oferta? |
|---|---|
| `fecha_de_publicacion_del` | **distinto en 99,8 %** → es de la fase |
| `fecha_de_recepcion_de` | **igual en 85,8 %** → NO es de la fase |
| `fecha_de_apertura_de_respuesta` | igual en 85,9 % |
| `proveedores_que_manifestaron` | igual en 100 % |

Un proceso real, fila por fila:

```
  portafolio CO1.BDOS.10354414
    Manifestación de interés    publicada 2026-07-03   recepcion_de 2026-07-09
    Presentación de oferta      publicada 2026-07-08   recepcion_de 2026-07-09
```

`fecha_de_recepcion_de` vale **lo mismo en las dos**: es el límite de la
OFERTA, estampado también sobre la fila de manifestación. El límite de la
manifestación cae en algún punto entre el 3 y el 8 de julio, y **no se publica**.

> **La respuesta a tu pregunta, entonces: el límite de manifestación de interés
> NO existe en datos abiertos. La fecha de sorteo tampoco.** Lo que sí existe
> alcanza para reconstruir el cronograma — ver 1.3.

## 1.2 Qué fechas publica realmente el dataset

El dataset `p6dx-8zbt` tiene **59 columnas, 11 de ellas de fecha**. Relleno
medido sobre todo lo publicado desde 2025:

| campo | mínima cuantía (n=116.435) | menor cuantía (n=71.194) | menor sin manifestación (n=484) |
|---|---|---|---|
| `fecha_de_publicacion_del` | 100 % | 100 % | 100 % |
| `fecha_de_publicacion` *(manifestación)* | **0 %** | **31,3 %** | **0 %** |
| `fecha_de_recepcion_de` ← hoy = `cierre` | 100 % | 100 % | 100 % |
| `fecha_de_apertura_de_respuesta` | 100 % | 100 % | 97,3 % |
| `fecha_de_apertura_efectiva` | 93,1 % | 98,3 % | 97,3 % |
| `fecha_adjudicacion` | 78,2 % | 29,2 % | 47,5 % |
| `proveedores_que_manifestaron` *(número)* | 100 % | 100 % | 100 % |

Las otras cuatro de fecha son publicaciones de fases de precalificación y
borrador, sin uso acá.

**`fecha_de_publicacion` es una trampa de nombre** —ya anotada en el código— y
resulta ser el dato más informativo de la tabla: existe **solo** en menor
cuantía con manifestación, en ninguna otra modalidad. Es la publicación de esa
fase, no su límite.

## 1.3 El cronograma sí se reconstruye, por otra vía

Hay una fila por fase. En menor cuantía, desde 2025:

| fase | filas |
|---|---|
| Presentación de oferta | 23.683 |
| Presentación de observaciones | 20.801 |
| Manifestación de interés (Menor Cuantía) | 20.211 |
| Clarification submission | 2.361 |
| Pré-Calificación de competidores | 2.081 |
| Fase de ofertas | 2.033 |

**Las filas de un mismo proceso NO comparten `id_del_proceso`** (cruzan 0 de
11.463). Comparten **`id_del_portafolio`**: cruzan **10.421 de 11.463 (90,9 %)**.
Esa es la llave, y no estaba identificada en ninguna parte.

Con ella, el cronograma real de una menor cuantía (10.421 procesos de 2026):

| tramo | mín | p10 | p25 | **mediana** | p75 | p90 |
|---|---|---|---|---|---|---|
| se abre la manifestación → se abre la fase de oferta | −1 | 2 | 3 | **5** | 6 | 8 |
| se abre la fase de oferta → límite para ofertar | −101 | 1 | 2 | **4** | 6 | 9 |
| se abre la manifestación → límite para ofertar | 1 | 5 | 7 | **9** | 12 | 15 |

La manifestación está abierta **4 a 7 días en el 57,5 %** de los casos, 1 a 3
días en el 31,3 %.

**Esto es exactamente lo que Giovanny describió**, con número: en un proceso de
unos 9 días, la puerta se cierra sobre el día 5. Al día 6 el `cierre` todavía
muestra 3 o 4 días por delante y el proceso **ya es inalcanzable**.

## 1.4 Y el registro de Karen tiene lo que el origen no tiene

372 licitaciones históricas en producción:

| campo | relleno |
|---|---|
| `cronograma.publicacion` | **0 %** |
| `cronograma.manifestacion` | 39,2 % (146) |
| `cronograma.sorteo` | 22,8 % (85) |
| `cronograma.cierre` | 68,0 % (253) |
| `cronograma.adjudicacion` | **0 %** |

Y se reparte por modalidad como Giovanny dijo:

| modalidad | total | con manifestación | con sorteo |
|---|---|---|---|
| menor cuantía | 225 | 133 (59 %) | 80 (36 %) |
| mínima cuantía | 124 | 13 (10 %) | 5 (4 %) |

**Distancias en el registro de Karen** (n entre paréntesis):

| tramo | p25 | mediana | p75 |
|---|---|---|---|
| manifestación → sorteo (80) | 1 | **1** | 3 |
| sorteo → presentación (82) | 3 | **4** | 6 |
| manifestación → presentación (142) | 4 | **6** | 7 |

> **Los dos registros concuerdan.** Karen mide 6 días desde el límite de
> manifestación hasta la presentación; datos abiertos mide 4 días desde que se
> abre la fase de oferta hasta su límite, y 5 días desde que se abre la
> manifestación hasta que se abre la oferta. Son el mismo cronograma visto
> desde dos puntos distintos, y por eso vale la pena creerle.

**Hallazgo menor, aparte**: hay valores de ±3.650 días en el registro —errores
de año al teclear—. Son pocos y no mueven la mediana, pero conviene corregirlos
cuando se toque ese dato.

## 1.5 Lo que ya está en producción, y lo que destapa

El radar escribió **24 documentos**: 14 mínima cuantía, 10 menor cuantía.

**Defecto 1 — doce de veinticuatro ya están vencidos.** Al momento de medir, 12
de los 24 tienen `cierre` en el pasado. Esto no necesita ninguna teoría de
fases: el radar trae procesos cuyo plazo ya terminó y la bandeja los muestra
como si estuvieran vivos.

**Defecto 2 — la fase viaja escondida dentro del número de proceso.** El
`numero_proceso` de uno de ellos es, literalmente:

```
SAMC-010-2026 (Manifestación de interés (Menor Cuantía)) (Presentación de oferta)
```

`referencia_del_proceso` acumula el nombre de cada fase por la que pasó, y se
mapea verbatim a `numero_proceso`. O sea: **el dato que falta ya está en el
documento**, en el peor lugar posible — dentro de una cadena que Karen lee como
el número del proceso.

Y es confiable: **el 99,8 %** de las filas en fase de oferta llevan
`(Manifestación de interés` en su referencia.

## 1.6 El diseño que propongo

Son dos necesidades distintas y conviene no mezclarlas.

### A · Que el radar no muestre lo inalcanzable

**A.1 — Guardar lo que hoy se tira.** `fase` e `id_del_portafolio` se descartan
en el mapeo (`fase` está anotada como «sin uso»). Pasan a `radar.fase` y
`radar.portafolio`. Sin esto no hay nada que decidir, y es el cambio más
pequeño del conjunto.

**A.2 — Limpiar `numero_proceso`.** Los sufijos de fase salen de la cadena y
pasan a ser el campo `fase`. Karen tiene que leer `SAMC-010-2026`.

**A.3 — La regla de lo vencido, que no depende de nada de lo anterior:** con
`cierre` en el pasado, el proceso no va a la cola del radar. **No se oculta**:
va a una sección propia o entra descartado con motivo `PLAZO_IMPOSIBLE`, que ya
existe en el vocabulario. Hoy son 12 de 24.

**A.4 — La regla de la manifestación perdida.** Menor cuantía + fase
`Presentación de oferta` + NEG no manifestó → el proceso es inalcanzable aunque
el cierre esté vigente. Se marca, no se esconde, y se dice por qué.
`proveedores_que_manifestaron` da el número de quienes sí manifestaron, que es
además el dato de competencia.

> **Una cosa que no puedo resolver midiendo**: el radar no sabe si NEG
> manifestó interés. Eso lo sabe Karen. Propongo que por ahora la regla sea
> *«esta menor cuantía ya pasó la manifestación — si no manifestaste, no se
> puede presentar»*, con un botón para decir que sí manifestó. Convertirlo en
> automático exigiría cruzar el NIT de NEG contra otro dataset, y eso es un
> bloque propio.

### B · Los avisos una vez admitida — la «ventana fatal»

Una vez que Karen admite una licitación, las tres fechas tienen que avisar. Con
lo medido, propongo que el aviso **no se calcule sobre el cierre**:

- En **mínima cuantía** el cierre es el plazo real: no hay manifestación (0 %).
- En **menor cuantía** el plazo real de decisión es *«se abre la fase de
  oferta»*, que llega a los **5 días** de publicado, no a los 9 del cierre.

Propongo guardar las tres fechas en `cronograma` como ya están modeladas
—`manifestacion`, `sorteo`, `cierre`— y llenarlas así:

| fecha | de dónde sale |
|---|---|
| `manifestacion` | **a mano**, de la lectura del pliego. No está en datos abiertos |
| `sorteo` | **a mano**. Tampoco está |
| `cierre` | `fecha_de_recepcion_de`, como hoy |

Y que el aviso use la primera fecha presente en ese orden, no la última. Si
nadie llenó `manifestacion` en una menor cuantía, el aviso lo dice: *«falta la
fecha de manifestación — es la que manda en esta modalidad»*.

> **Lo que te toca decidir**: si las dos fechas que faltan se capturan a mano al
> admitir una menor cuantía (una pantalla más, pero el dato queda), o si el
> aviso se arma con la estimación medida (manifestación ≈ publicación + 5 días)
> y se marca como estimada. **Recomiendo la primera**: una fecha estimada que
> se presenta como fecha es el tipo de dato que después nadie recuerda que era
> estimado. La estimación sirve para ordenar la cola, no para avisar.

---

# PARTE 2 · El lenguaje del módulo

## 2.1 Las tres reglas

1. **Sin números de versión en texto de usuario.**
2. **Sin vocabulario de sistema**: criterio, discriminante, hipótesis,
   numerador, denominador, ventana medible, léxico, señal, término.
3. **Escribir como a un colega, no como se documenta un sistema.**

A la lista de palabras prohibidas agrego **léxico**, **señal** y **términos**,
que son de la misma familia y aparecen en la pantalla desde ayer.

## 2.2 El inventario completo

### a) El panel del rojo informado — `pages/licitaciones/LicitacionDetalle.tsx`

| hoy | problema |
|---|---|
| «El criterio **v1.0** frena este proceso» | versión + «criterio» |
| «Qué dice el criterio:» | «criterio» |
| «Antes de decidir, lo que el criterio NO cubre:» | «criterio» |
| «No se pudo leer el registro del criterio (**v1.0**)» | versión + «criterio» + «registro» |

Es el bloque de tu ejemplo. La reescritura que proponés es la dirección: nombrar
el hecho («NEG casi no ha ganado en esta modalidad»), después los casos
concretos con sus cifras, y cerrar reconociendo lo que no se sabe.

### b) El texto que NO está en el código — `configuracion/semaforo_versiones`

**Esto es lo más importante del inventario y es un acto de datos, no un cambio
de código.** `definicion` y `limitaciones` se leen de Firestore y se pintan tal
cual. Hoy dicen:

> «ROJO si modalidad ≠ mínima cuantía. AMARILLO si hay sorteo, limitación MiPyme
> fuera de Bogotá/Cundinamarca, o requiere lectura. VERDE en el resto. Sin banda
> de presupuesto.»

> «El criterio está validado sobre 2022, 2024, 2025 y 2026, donde existen
> **numerador y denominador**…»

Están escritos para quien calibró el semáforo. Hay que reescribirlos **en el
documento**, con dry-run y autorización como cualquier acto de datos — y de paso
decidir si el campo que Karen lee debe ser el mismo que guarda la justificación
técnica, o si son dos campos distintos: uno que ella lee y otro que sostiene la
calibración para una auditoría.

**Recomiendo dos campos.** Son dos lectores distintos y hoy comparten uno.

### c) Los modales

| archivo | hoy |
|---|---|
| `ModalOverride.tsx` | «El criterio **v1.0** marca este proceso en rojo» · «Lo que el criterio NO midió:» |
| `ModalPresentar.tsx` | «El nivel de competencia real: el dato que falta para medir una **v1.1** del criterio» |
| `ModalDescartar.tsx` | «El **léxico** lo trajo y no nos sirve…» · «¿El **léxico** se equivocó, o acertó…?» · «saber con número si el **léxico** está trayendo basura» |

### d) Las etiquetas de motivo — `types/sigp/licitacion.ts`

`MOTIVO_DESCARTE_LABEL` está casi toda en el idioma de Karen (viene de su
registro). La excepción es **`RUIDO_LEXICO: 'El léxico lo trajo por error'`**.

`MOTIVO_SEMAFORO_LABEL` son cuatro etiquetas telegráficas —«Modalidad sin
historial de NEG»— que funcionan como chip pero no como explicación.

### e) La pantalla del radar — `pages/licitaciones/Licitaciones.tsx`

Escrita ayer, y **rompe la regla 1 en el peor lugar**: el chip de cada fila dice
**«léxico v1.0»**. Un número de versión, en la fila, en la pantalla principal.

| hoy | problema |
|---|---|
| chip «**léxico v1.0**» | versión + palabra de sistema |
| «El objeto coincide con el **léxico**» | palabra de sistema |
| «Código con adjudicación probada — el texto no dice nada» | habla del sistema, no del proceso |
| «**términos**: redes · media tensión» | palabra de sistema |
| el aviso de las sin-fecha: «entraron por un **barrido autorizado**, no por la corrida de todos los días» | describe la máquina, no el hecho |
| «No compite por el cupo de la semana» | «cupo» sí es de Karen; se conserva |

### f) El onboarding — `docs/onboarding-licitaciones.md`

244 líneas. Hay que leerlo entero con las tres reglas; es el documento con el
que Karen empieza y hoy está escrito desde el sistema hacia afuera.

### g) Lo que NO hay que tocar

Los mensajes de bloqueo de presentación (`utils/sigp/cumplimiento.ts`) ya están
bien: «El checklist del pliego está vacío — no hay nada verificado», «3
requisitos sin verificar», «1 requisito que no cumple». Son hechos en el idioma
del trabajo. Los dejo como referencia de a dónde tiene que llegar el resto.

## 2.3 Orden propuesto

1. **`configuracion/semaforo_versiones`** (acto de datos) — es lo que más se lee
   y lo único que no se arregla con un deploy.
2. **El panel del rojo** y los tres modales — el recorrido de una decisión.
3. **La pantalla del radar** — lo que Karen ve primero, y lo más reciente.
4. **Las etiquetas de motivo** — pequeñas y de bajo riesgo.
5. **El onboarding** — al final, cuando el producto ya diga lo que el documento
   va a describir.

---

# Lo que no preguntaste y conviene que sepas

**El acto de la marca se hizo con `solape_dias: 4`, no 14.** Está en
`configuracion/radar_secop`, verificado hoy. Las consecuencias:

- La primera cosecha trajo **24 documentos en vez de los ~111** que se midieron
  para 14. El circuito quedó probado igual —dos corridas, las dos escribieron—
  pero con menos material del previsto.
- Y lo que importa más: **4 quedó como el solape permanente**. Su valor de
  diseño es 45, porque el dataset completa los registros semanas después de
  publicarlos. Con 4, el radar solo ve lo de los últimos cuatro días y pierde
  todo lo que el origen complete después.

El acto de restitución a 45 deja de ser un ajuste fino: es una corrección. Se
hace con el mismo guion (§3-bis del estado del radar), editando un solo campo.
