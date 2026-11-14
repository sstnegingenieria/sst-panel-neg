# ¿Se pierden procesos, o solo llegan tarde?

*Medido el 14-nov-2026, entre las 14:00 y las 15:00 de Bogotá.*
*Fuente: PORTAL DE DATOS ABIERTOS - SECOPII (dataset `p6dx-8zbt`, datos.gov.co).*
*15 peticiones en total: 14 respondidas, 1 caída por handshake TLS.*

---

## La respuesta, y lo que vale

**Con lo que se puede medir hoy no hay evidencia de pérdida permanente.** Las
siete ausencias del forense están **en la punta de su serie**, que es la firma
del retraso; el único hueco interior que apareció **sí estaba en el dataset**
desde el principio.

Y ahora la salvedad, que importa tanto como la respuesta: **la pregunta de
Giovanny no se puede cerrar con esta medición.** No porque falte trabajo, sino
porque el dataset no puede atestiguar lo que no tiene. Eso está en §5.

---

## 1 · Primera corrección: no han pasado varios días. Han pasado cinco horas

El forense se midió **hoy**, 14-nov-2026 — su commit `ed03192` tiene fecha
`2026-11-14 09:25 -0500`. Son las 14:00 del mismo día.

Eso **inhabilita la prueba tal como está diseñada**, y conviene ver por qué
antes de leer cualquier número de abajo:

> El retraso medido es de **dos días hábiles**. Los procesos en cuestión se
> publicaron el 11, 12 y 13 de noviembre. Un proceso del 13 no debería estar en
> el dataset hasta el **17 o 18**. Así que una referencia que hoy siga ausente
> **no dice nada**: es exactamente lo que predice la hipótesis del retraso.

El riesgo no es perder el tiempo, es el contrario: medir hoy y leer «cinco
siguen sin aparecer» como evidencia de pérdida, cuando es evidencia de que la
medición se hizo temprano. **Una prueba corrida antes de su plazo no da un
resultado débil: da un resultado falso en la dirección más alarmante.**

**La fecha para correrla es el martes 18 de noviembre o después** — tres días
hábiles después de la última publicación en juego. Con una salvedad más: el
retraso se midió una vez, no es una constante garantizada.

## 2 · Segunda corrección, y es mía: el Banco de la República y EPM **sí** publican en SECOP II

El forense dice —son mis palabras— que *«el Banco de la República y EPM
contratan por régimen propio y no publican en SECOP II como los demás»*, y de
ahí salió el «esos no cuentan». **Lo afirmé sin medirlo.** Medido ahora, en todo
el historial del dataset:

| entidad | filas en el dataset | primera | última |
|---|---|---|---|
| BANCO DE LA REPUBLICA | **31.780** | 2019-02-01 | **2026-11-12** |
| EMPRESAS PUBLICAS DE MEDELLIN E.S.P. | **27.593** | 2022-06-17 | **2026-11-10** |
| TRANSMILENIO S.A. | 13.916 | 2017-10-11 | 2026-11-12 |
| SENA TOLIMA 1 | 7.320 | 2019-08-28 | 2026-11-10 |

Las cuatro publican, y las cuatro publicaban **esta semana**. La exclusión que
yo introduje y que se repitió como asunto cerrado **queda sin efecto: la muestra
útil son 7 casos, no 5.**

Lo que el dato sí deja en pie, con precisión: una entidad de régimen propio
puede llevar **parte** de su contratación a SECOP II y parte a su propio portal.
Que publique no prueba que ESTE proceso debía estar ahí. Pero **«esa entidad no
usa SECOP II» dejó de ser una explicación disponible**, y era la que descartaba
dos de los siete casos sin mirarlos.

> `CW404232` sigue teniendo forma de identificador del portal de EPM y no de
> referencia de SECOP. Esa observación era sobre la **forma del código** y se
> sostiene; lo que no se sostiene es la conclusión que le colgué.

## 3 · La medición que sí se puede hacer hoy: huecos con vecinos

Si una entidad numera sus procesos en serie y el dataset tiene el `n−1` y el
`n+1` pero no el `n`, **el retraso queda descartado para ese caso**: un proceso
posterior llegó y uno anterior no. No hace falta esperar.

Eso se puede medir hoy, con el dataset solo. Resultado:

| referencia buscada | serie en el dataset (2026) | dónde cae | lectura |
|---|---|---|---|
| `TMSA-MIN-14-2026` | 01–13 completos | **en la punta** (máx. 13) | compatible con retraso |
| `MC-CIC-9226-446-2026` | máx. 442 | **en la punta** | compatible con retraso |
| `IECR-008-2026` | 001–007 de Costa Rica | **en la punta** de esa entidad | compatible con retraso |
| `IEGM-015-2026` | 001–012 | **en la punta** (máx. 12) | compatible con retraso |
| `4143.091.26.30.2026` | formato distinto a todos los vistos | sin serie comparable | no concluyente |
| `53025223` | sin serie legible | — | no concluyente |
| `CW404232` | formato de otro portal | — | no concluyente |

**Ninguna de las siete cae en un hueco interior.** Las cuatro que tienen serie
legible están todas en la punta, que es exactamente dónde las pone la hipótesis
del retraso.

### Dos trampas que casi fabrican una pérdida

**(a) `IECR-008` parecía el caso bueno.** El dataset tiene `IECR-001` a `007` y
tiene `IECR-012`: un hueco con vecinos a los dos lados. Se cae al mirar de quién
es cada número:

| referencia | entidad | depto |
|---|---|---|
| IECR-001…007-2026 | INSTITUCIÓN EDUCATIVA **COSTA RICA** | Sucre |
| IECR-012-2026 | INSTITUCIÓN EDUCATIVA **CRISTO REY** | Arauca |

Tres entidades distintas comparten el prefijo `IECR`. La serie de Costa Rica va
001→007 y el 008 es **su siguiente**. El «hueco interior» era el artefacto de
juntar tres entidades — **la trampa 10 de `secopMapeo.ts`: `referencia_del_proceso`
no es identidad**, documentada por nosotros y pisada otra vez acá.

**(b) El contador del SENA no sirve para esto.** `MC-CIC-9226-NNN` parecía tener
315 huecos interiores. El 9226 es un contador **compartido por seis prefijos**
—`PSP-CIC`, `SI-RT`, `SASI-CIC`, `MC-CIC`, `SAMC-CIC`, `CD-CIC`— y la entidad
tiene además 738 referencias que no lo usan. Los huecos son los otros prefijos.
**Un hueco solo significa algo si la serie es densa y de un solo dueño.**

## 4 · El único hueco interior real estaba en el dataset, con las fechas en nulo

`TMSA-MIN-04-2026` no aparecía: Transmilenio tenía 01, 02, 03, **05**…13. Un
dueño, serie densa, vecinos a los dos lados. Era el caso que decidía.

Lo busqué otra vez **sin filtro de fecha**:

```
TMSA-MIN-04-2026 | TRANSMILENIO S.A. | pub=None | recep=None | Seleccionado
```

**Estaba ahí todo el tiempo.** Mis consultas llevaban
`fecha_de_publicacion_del >= '2026-01-01'`, y un `>=` **excluye los nulos
siempre**. La fila era invisible a la pregunta, no ausente del dataset.

Esto es lo mismo que `secopConsulta.ts` ya tenía medido —*3.785 filas sin
`fecha_de_publicacion_del` en el territorio completo; un `where fecha > marca`
las excluye SIEMPRE, en toda corrida*— y es la razón de que la ingesta las
recoja por `IS NULL`. Lo sabía escrito y lo pisé igual, **en la única medición
donde esa trampa no produce un faltante: produce una pérdida inventada.**

### Lo que esto deja como hallazgo propio

No es una pérdida, pero tampoco es inocuo: **el dataset puede traer un proceso
sin ninguna fecha.** Para el radar, una fila sin fecha es una fila **sin lugar
en el tiempo**: no se puede envejecer, no entra en una ventana, y el alcance de
«48 horas» no significa nada para ella. Entra —por `IS NULL`, con
`origen_fecha: 'ninguna'`— y entra sin edad.

Son **926 filas** del territorio sin ninguna de las dos fechas, según la
medición que ya estaba en el código. No es el objeto de esta pregunta y no lo
convierto en tarea acá, pero queda nombrado: *presente pero infechable* es una
tercera categoría, distinta de «llegó tarde» y de «no llegó».

## 5 · El techo de todo esto, dicho sin rodeos

**El dataset no puede testificar que un proceso fue publicado.** Si una
referencia no está, hay cuatro explicaciones y el dataset no distingue entre
ellas:

1. llegó tarde y va a aparecer;
2. se publicó y **no llegó nunca** — la pérdida que Giovanny pregunta;
3. **nunca se publicó**: la entidad reservó el número y el proceso murió antes
   (los números se asignan al abrir el expediente, no al publicar);
4. está, con otra forma de la referencia, o sin fecha, como el caso de §4.

La 3 es la incómoda: produce exactamente la misma huella que la 2 —un número que
no está— y **no hay consulta al dataset que las separe**. El único testigo de que
algo se publicó es el portal, y el portal está detrás del reCAPTCHA.

Así que el testigo admisible es otro, y es el que ya teníamos: **que Giovanny lo
vio con sus propios ojos.** Por eso estos 14 casos son la muestra correcta —son
procesos de los que consta que estuvieron publicados— y por eso la prueba
necesita de él un dato que no está en ninguna base: **¿los vio en el portal de
SECOP II, o en otra parte?**

## 6 · El protocolo, para que la corrida del 18 sirva

1. **Fecha: martes 18-nov o después.** Tres días hábiles tras la última
   publicación en juego.
2. **Los 7 casos, no 5.** La exclusión de BanRep y EPM queda retirada (§2).
3. **Sin filtro de fecha**, nunca. La búsqueda es por referencia exacta sobre
   todo el dataset (§4).
4. **Serie y dueño.** Para cada ausente: la serie de **su** entidad, no del
   prefijo (§3a), y solo si la serie es densa y de un dueño (§3b).
5. **Una pregunta a Giovanny por cada ausente**, y es la que decide: *¿esta la
   vio en el portal de SECOP II?* Sin eso, un ausente no distingue «se perdió»
   de «nunca se publicó» (§5).
6. **Si queda uno** que él vio en SECOP II, con serie densa de un dueño, con
   vecinos posteriores presentes y sin fila de fecha nula: **ése es el hallazgo
   mayor**, y entonces sí hay que medirlo en grande antes de concluir.

Para el paso 6 en grande, el diseño que tendría sentido: tomar un mes cerrado
—donde el retraso ya no puede explicar nada— y medir la **densidad de series**
de las entidades que publican seguido. Si el dataset es espejo completo, las
series de un solo dueño deberían ser densas salvo por cancelaciones. Un déficit
sistemático de densidad sería evidencia de pérdida **sin necesidad de testigo**.
No lo construyo acá: es una medición grande y depende de que el paso 5 dé al
menos un caso que la justifique.

---

## Lo que esta medición sí cambia desde hoy

1. **La exclusión de dos entidades queda retirada** y el forense corregido en su
   sitio (PR #277).
2. **El retraso sigue siendo la explicación que aguanta.** Siete de siete
   ausencias son compatibles con él; cero exigen otra cosa.
3. **La curva de latencia, remedida a las 14:00** (territorio + las cuatro
   modalidades de ingesta, incluida la que entró con el #278):

| día de publicación | filas |
|---|---|
| 2026-11-14 (hoy, sábado) | 0 |
| 2026-11-13 (viernes) | **0** |
| 2026-11-12 | 33 |
| 2026-11-11 | 157 |
| 2026-11-10 | 131 |
| 2026-11-09 | 136 |
| 2026-11-06 | 147 |

El 13 sigue en **cero** nueve horas después de la medición de la mañana. El
retraso de dos días **no se ha movido hoy**, que es justamente por qué la prueba
no puede correrse hoy.

> ⚠ Estos números no se comparan con los del forense: ése contó **dos**
> modalidades y éste cuatro. Los números de esta tabla son mayores por eso, no
> porque haya llegado nada nuevo.
