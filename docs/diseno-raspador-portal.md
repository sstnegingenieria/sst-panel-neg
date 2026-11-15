# Diseño del bloque R — el raspador del portal

*Diseñado el 14-nov-2026. **Esto no es una implementación y no se despliega.**
Es el diseño para que Giovanny lo apruebe o lo mate. Va **después de la
sentada** y **después del cambio A** (el aviso por modalidad de
`docs/ventana-util-radar.md` §10).*

Qué compra el raspador y por qué vale la pena está medido en
`docs/ventana-util-radar.md` §8 y no se repite acá: el calendario competitivo
completo, la hora, la categoría UNSPSC del 26,2 % que llega sin código, y los
2 días de latencia.

---

## 1 · Las condiciones, al día

| | estado |
|---|---|
| el detalle y su cronograma **se ven sin iniciar sesión** | **verificado** — observación directa de Giovanny Montes, 14-nov-2026, en ventana de incógnito |
| en **navegador normal una sola verificación cubre la sesión**; en incógnito pide varias | **verificado** — misma observación. Sin cookies, cada petición parece un visitante nuevo |
| **cuántas aperturas de detalle aguanta una verificación** | **SUPUESTO A VERIFICAR EN LA CONSTRUCCIÓN.** No medido. El diseño de abajo no asume un número: asume que el número existe y que puede ser menor que el presupuesto |

### El criterio de corte, vigente y no revisable

> **Si al construir resulta que el portal pide verificación por página, el
> bloque se descarta.** Un sitio que verifica en cada página está declarando
> que no quiere recorridos automáticos, y rodearlo sería frágil además de
> incorrecto.

En ese escenario el camino es el que ya existe y ya funciona: **conjunto
abierto para detectar + apertura manual de los que pasan el léxico.**

---

## 2 · La forma del bloque: dos capas que no se pueden confundir

| | **capa de abastecimiento** | **capa de auditoría** |
|---|---|---|
| fuente | el **portal** (raspador) | el **conjunto abierto** (`p6dx-8zbt`) |
| para qué | **traer el calendario** de lo que hay que trabajar hoy | **medir la fuente y verificar lo traído** |
| quién la habilita | **Karen**, resolviendo la verificación a las 7:00 | nadie: corre sola |
| si Karen no está | **se cae, y lo declara** (§3) | **sigue corriendo** |
| le afecta el retraso de 2 días | no (lee el portal en vivo) | **no importa**: auditar la semana pasada no necesita el dato de hoy |

**La consecuencia de diseño que importa: la auditoría no pasa por Karen, así
que Karen no la puede apagar.** Un bloque donde la verificación y la auditoría
dependen de la misma persona no audita nada — se calla junto con ella.

---

## 3 · R0 · La declaración de la falla

**Esta es la primera pieza que se construye y la única que sirve sola.** No
depende del raspador: se puede construir, desplegar y usar aunque el raspador
nunca exista o se descarte por el criterio de corte.

### El problema que resuelve

Un cero silencioso es indistinguible de la verdad. «Hoy no hay menores cuantías
nuevas» y «hoy no pude entrar al portal» se ven **idénticos** en una pantalla
que solo muestra filas. Es la misma asimetría de todo este frente, y la que ya
nos costó el `>=` que fabricaba pérdidas.

### La forma

Un documento de estado por corrida — `corridas_portal/{AAAA-MM-DD}` — con lo
que el panel necesita para decir una frase cierta:

| campo | para qué |
|---|---|
| `acceso` | `'si'` · `'no'` · `'parcial'` |
| `aperturas_intentadas` / `aperturas_logradas` | el presupuesto y lo que alcanzó |
| `motivo` | `'verificacion_pedida'` · `'sin_sesion_humana'` · `'cambio_de_pantalla'` · `'error_de_red'` |
| `hora_inicio` / `hora_fin` | para «a las 7:05», no «hoy» |
| `huella_estructura` | el conjunto de etiquetas del cronograma que vio (ver §6) |

Y el panel **deriva la frase del dato, no de una constante** — el mismo patrón
que ya usa `hastaDondeLlegaLaCola` y `avisoDeCobertura`, que dicen la cobertura
real en vez de una frase escrita a mano que envejece sin que nadie se entere:

- `acceso: 'no'` → **«Hoy no he tenido acceso a búsquedas en el portal: las
  fechas de manifestación de hoy no están.»**
- `acceso: 'parcial'` → **«Alcancé 6 de 10 procesos: el portal pidió
  verificación otra vez.»**
- sin documento del día → **«Todavía no he mirado el portal hoy.»**
- `acceso: 'si'` → nada. Lo normal no se anuncia.

**Nunca un cero sin una frase.** Y la frase dice de qué tamaño es el hueco, no
solo que lo hay.

---

## 4 · R1 · Qué se captura exactamente, y dónde se guarda

### Qué

**Las 21 filas del cronograma, verbatim, y nada interpretado en el camino.**
Capturar solo las tres fechas que el modelo usa hoy sería optimizar contra el
presente: el día que el proceso necesite la fecha de adendas o la del informe
de evaluación, habría que volver a abrir 10 páginas por día durante semanas
para tener historia. Las 21 caben en un documento y cuestan lo mismo que tres.

Además de las 21: los **códigos UNSPSC** que el portal publica (el 26,2 % que
el conjunto abierto deja en `UNSPECIFIED`), la **URL** exacta y el **momento**
de la captura.

### Dónde

En un **sub-documento propio con su propia procedencia**, no mezclado en los
campos del documento:

```
licitaciones/{id}/fuentes/portal
```

| campo | contenido |
|---|---|
| `capturado_en`, `capturado_por`, `corrida` | cuándo, con qué versión del raspador, en qué corrida |
| `url` | la del detalle, tal como se abrió |
| `cronograma_crudo` | **array de `{etiqueta, valor_texto}`, verbatim** — 21 entradas, sin parsear |
| `cronograma_parseado` | las fechas con hora como `Timestamp`, **cada una con la etiqueta de la que salió** |
| `categoria_unspsc` | los códigos que publica el portal |
| `huella_estructura` | el conjunto ORDENADO de etiquetas encontradas (§6) |

**Por qué el crudo Y el parseado.** El crudo es la evidencia: si mañana el
parseo resulta equivocado, se re-parsea sin volver al portal. El parseado es lo
que consume el panel. Guardar solo el parseado convierte un error de lectura en
una pérdida de dato; guardar solo el crudo obliga a parsear en cada render.

**Por qué un sub-documento y no campos nuevos en la licitación.** Tres razones,
y las tres tienen precedente en este repositorio:

1. **Procedencia separable.** `radar: ProcedenciaRadar` ya existe para decir de
   dónde vino lo que trajo la ingesta. El portal es otra fuente y merece su
   propio bloque, con su propia fecha y su propia versión.
2. **Confidencialidad de la estructura, por costumbre sana.** El patrón
   `privado/datos_bancarios` y la proyección `verificaciones_sst` ya separan lo
   que no todos necesitan leer. Acá no hay secreto, pero sí hay volumen: 21
   fechas + crudo no tienen por qué viajar en cada lectura de la bandeja.
3. **Se apaga sin romper.** Un sub-documento que deja de actualizarse es un
   sub-documento viejo. Un campo que deja de actualizarse dentro del documento
   vivo es una mentira silenciosa.

### Lo que NO se escribe

**El raspador no escribe `cronograma.manifestacion` del documento vivo.** Ese
campo significa hoy *«una persona leyó el pliego y anotó esto»* —lo dice
`patchCronogramaManual`— y si una captura automática lo llena, el campo pierde
su significado y nadie puede volver a distinguir quién lo puso.

El panel **lee los dos y dice cuál está mostrando**: primero el de la persona,
si no hay, el del portal, con la etiqueta de su origen. Es el mismo criterio
que la obra-espejo: **completa si falta, jamás reescribe.**

---

## 5 · R2 · Quién gana cuando los dos tienen el mismo campo y difieren

No hay una regla sola, porque no todas las diferencias son del mismo tipo. Son
**tres casos y se resuelven distinto** — y esa distinción es la parte del
diseño que hay que aprobar o corregir:

### Caso 1 · Truncamiento → gana el preciso, y no se guarda dos veces

**La hora.** Medido: el conjunto abierto trae **una sola hora distinta**
(`00:00:00`) en 5.806 publicaciones y 6.873 recepciones. El portal trae
`9:00 PM`, `5:00:00 PM`.

Eso **no es un desacuerdo: es una pérdida de precisión conocida.** Donde una
fuente es una transformación con pérdida de la otra, **gana la que no perdió**,
y la diferencia no se registra como discrepancia porque no es una.

### Caso 2 · Ausencia → gana la presencia

**La categoría UNSPSC cuando el conjunto abierto dice `UNSPECIFIED`** (26,2 %
de las filas vivas). Eso es un hueco, no un conflicto: el portal lo llena.

### Caso 3 · Conflicto real → NADIE gana en silencio

**Dos valores distintos y los dos presentes.** Dos sub-casos:

- **UNSPSC distinto en cada fuente.** Acá la tentación es «gana el portal, es
  el sistema de registro». **No.** El código alimenta la clasificación
  (`si` / `probable`), y cambiarle la fuente a mitad de la serie vuelve la
  métrica incomparable con todo lo medido antes. Igual que el
  `vocabulario_version` se estampa en cada documento para que una corrida vieja
  siga siendo legible, acá: **se clasifica con el del conjunto abierto, se
  guardan los dos, y la discrepancia se cuenta y se muestra.** Si resultan ser
  muchas, eso es un hallazgo sobre el dataset y se decide con el número en la
  mano, no por intuición.
- **Fecha de cierre con día distinto.** **Gana el portal para ACTUAR** —es el
  sistema transaccional, es donde se presenta la oferta— **y la diferencia se
  guarda**, porque una diferencia de día significa que el conjunto abierto
  tiene una foto vieja: **la discrepancia misma es la medición de la latencia
  de la fuente**, que hoy se estima en 2 días sin haber medido su variación.

### El principio, en una línea

> **El portal manda para ACTUAR. El conjunto abierto manda para MEDIR. Donde
> difieren, se guarda la diferencia: la diferencia es el dato que audita la
> fuente.**

---

## 6 · R3 · El día que SECOP cambie la pantalla

Es cuándo, no si. Y el modo de fallar que hay que prohibir es el silencioso:
el raspador no encuentra la sección, no escribe fechas, y el panel muestra
«falta la fecha de manifestación» — **idéntico a un proceso que no tiene
puerta.**

### Tres defensas, de la más barata a la más informativa

1. **Afirmación de forma, por captura.** Antes de escribir nada, la captura
   verifica que la sección «Cronograma» existe, que trae al menos N filas y que
   —en una menor cuantía— la etiqueta `Plazo para manifestación de Interés`
   está presente. **Si la afirmación falla, no escribe un nulo: escribe un
   fallo** (`motivo: 'cambio_de_pantalla'`) y R0 lo declara.
2. **Huella de la estructura.** Se guarda el **conjunto ordenado de etiquetas**
   —no de valores, que cambian en cada proceso—. Cuando la huella difiere de la
   última conocida, eso **es** la señal: el portal cambió la pantalla. Cuesta
   una cadena por captura.
3. **La declaración, que ya existe.** R0 no necesita un mecanismo nuevo: el
   `motivo` ya está en su modelo y el panel ya sabe decir una frase.

**Lo que NO se hace:** reintentar con otro selector, adivinar la fecha por
posición, o caer a un parseo «más permisivo». Un raspador que se adapta solo a
una pantalla que cambió es un raspador que empieza a inventar.

---

## 7 · Qué sobrevive si el raspador se apaga para siempre

La prueba del diseño: **¿cómo se ve el día después de apagarlo?**

| pieza | sobrevive |
|---|---|
| **el cambio A** (el aviso por modalidad) | **sí, entero** — nunca dependió del portal |
| **R0, la declaración** | **sí** — cambia la frase: de «hoy no tuve acceso» a «no tengo raspador». Sigue siendo mejor que un cero callado |
| **las fechas ya capturadas** | **sí** — son snapshots con procedencia y fecha, no una dependencia viva. Siguen siendo verdad sobre el día que se capturaron |
| **la capa de auditoría** | **sí, intacta** — nunca necesitó el portal |
| **la lectura del panel** | **sí** — lee «primero la persona, si no el portal, y dice cuál»; con el portal apagado el segundo término queda vacío y la frase lo dice |
| **la captura** | **muere, y es lo único** |

> **Si el raspador se apaga, el panel vuelve exactamente a lo que es hoy, más
> las fechas que alcanzó a capturar.** Sin migración, sin limpieza, sin estado
> roto a medias.

Eso no es casualidad: es la razón de que lo capturado viva en su propio
sub-documento y se lea con respaldo. Un diseño donde apagar el raspador exige
una migración es un diseño que no se puede apagar — y algo que no se puede
apagar no se debería prender.

---

## 8 · Orden de construcción, y qué se puede matar sin matar el resto

| | qué | depende de | se puede matar solo |
|---|---|---|---|
| **R0** | documento de corrida + la frase del panel | de nada | — es el cimiento, y sirve solo |
| **R1** | la captura + el sub-documento con procedencia | R0 (para declarar sus fallos) | **sí**: sin R1, R0 dice «no tengo raspador» |
| **R2** | la lectura en el panel con origen declarado | R1 | **sí**: sin R2, lo capturado se queda guardado y no se muestra |
| **R3** | huella de estructura + afirmación de forma | R1 | **no debería**: R1 sin R3 es el raspador que falla callado |

**R0 va primero y se puede desplegar aunque el bloque se mate después.** Es,
además, la pieza que el revisor marcó como la que más importa — y la única que
no tiene nada que ver con raspar.

**R3 no es opcional.** Si se construye R1 sin R3, se está construyendo
exactamente el fallo silencioso que este documento existe para prevenir.

---

## 9 · Lo que este diseño NO hace, escrito para que no se proponga de nuevo

- **No corre sin un humano.** La verificación la resuelve Karen a las 7:00
  dentro de su rutina; el raspador no es un cron que asume acceso. Si no hubo
  persona, no hubo corrida, y R0 lo dice.
- **No abre todo.** La lista del portal basta para detectar; el detalle se abre
  **solo para lo que ya pasó el léxico** — orden de 10 al día. Cualquier
  variante que abra el detalle de todo queda descartada de entrada.
- **No rodea la verificación.** Si el portal verifica por página, el bloque se
  descarta (§1).
- **No inventa fechas.** Ni por regla normativa («día 5 de 9»), ni por
  posición en la pantalla, ni con un parseo permisivo cuando el estricto falló.
- **No escribe sobre lo que escribió una persona.** Completa si falta, jamás
  reescribe.
- **No se despliega con la sentada.** La sentada es censo, despliegue y los
  cuatro actos.

---

## 10 · Lo que hay que decidir para aprobarlo o matarlo

1. **¿Las 21 fechas o solo las tres que el modelo usa?** El diseño propone las
   21 por el costo de volver a abrir 10 páginas diarias durante semanas si
   mañana hace falta una cuarta.
2. **¿El UNSPSC del portal clasifica, o solo se guarda y se cuenta la
   discrepancia?** El diseño propone lo segundo, para no volver la serie
   incomparable. Es la decisión más discutible de todo el documento.
3. **¿R0 se construye ya, aunque el raspador no exista?** El diseño dice que sí
   y que vale sola.
4. **El presupuesto de aperturas por corrida** — queda pendiente del número que
   mida Giovanny (§1).
