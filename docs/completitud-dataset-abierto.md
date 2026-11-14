# ¿Se pierden procesos, o solo llegan tarde?

*Medido el 14-nov-2026, entre las 14:00 y las 15:00 de Bogotá.*
*Fuente: PORTAL DE DATOS ABIERTOS - SECOPII (dataset `p6dx-8zbt`, datos.gov.co).*
*25 peticiones en total: 24 respondidas, 1 caída por handshake TLS. Las diez
últimas son la medición de las infechables de §4.*

---

## La respuesta, y lo que vale

**Con lo que se puede medir hoy no hay evidencia de pérdida permanente.** Las
siete ausencias del forense están **en la punta de su serie**, que es la firma
del retraso; el único hueco interior que apareció **sí estaba en el dataset**
desde el principio.

Y ahora la salvedad, que importa tanto como la respuesta: **la pregunta de
Giovanny no se cierra con esta medición**, se cierra con la del **18 de
noviembre**. No porque falte trabajo, sino porque el dataset no puede atestiguar
lo que no tiene.

Lo que sí cambió es que ya tiene quien atestigüe. **Giovanny confirmó que los
siete los vio en el portal de SECOP II** (§5-bis), y eso elimina la única
explicación benigna que el dataset no podía descartar por sí mismo. La corrida
del 18 pasa de ser indicativa a ser **concluyente**.

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

*Presente pero infechable* es una tercera categoría, distinta de «llegó tarde» y
de «no llegó». Queda nombrada y **no la convierto en tarea** acá.

### Medido, porque Giovanny preguntó si eran cuatro o cien

Su criterio textual: *«Si son cuatro, es una curiosidad. Si son cien, es un
agujero.»* Medido con el código real del radar —`whereIngesta` construye el
filtro, `ingerirSecop` clasifica con el léxico **v1.1**; nada reimplementado—:

| | |
|---|---|
| filas del territorio sin ninguna de las dos fechas | **37.633** |
| de esas, las que pasan el filtro completo del radar | **2.074** |
| procesos distintos que eso representa | 1.758 |
| **que el clasificador admite** (`si` 122 + `probable` 15) | **137** |

**Son 137. Es un agujero, por tu propio criterio.**

Y no son chatarra histórica. Los primeros sesenta son trabajo de NEG, con
nombre: *mantenimiento preventivo y correctivo de instalaciones* (Fuerza
Aeroespacial, ICBF, DIJIN, Escuela de Postgrados de Policía), *adecuación y
mantenimiento de sedes* (INVIAS, Ministerio de las Culturas), *mejoramiento de
la subestación eléctrica* (Aerocivil), *cerramientos y obras locativas*,
*mejoramiento de vías* en media docena de municipios de Cundinamarca. De esos
sesenta, la mayoría son referencias **de 2026**.

**Lo que el número confirma y lo que corrige.** El 926 del código está vigente:
medido hoy con las **dos** modalidades originales del brief da **930** — cuatro
más en cinco días. El salto a 2.074 **no es del dataset, es del filtro**: las
dos modalidades que se agregaron después —la variante sin manifestación de
interés y el régimen especial con ofertas del #278— aportan unas 1.144 filas
infechables más. Vale anotarlo porque al medir el #278 se midió lo que *agrega
a la cola* (67 al año) y no lo que *agrega al montón sin fecha*. De los sesenta
que revisé, ninguno es de régimen especial: las modalidades nuevas aportaron
volumen, no persistibles.

**Y probablemente ya tenía nombre.** `HALLAZGOS_AUDITORIA.md` menciona, al
hablar de `MAX_CREADOS_PRIMERA_CORRIDA`, *«el backlog de las 125 filas sin
fecha»* como decisión pendiente de Giovanny. 125 y 137 son con casi seguridad el
mismo animal contado en dos momentos — no verifiqué cómo se definió aquel 125,
así que lo digo como lo que es: **muy probablemente esto no es un hallazgo nuevo
sino el mismo pendiente, ahora con número medido y con los nombres de lo que
hay dentro.**

Dicho eso, sigue sin ser tarea de este documento. Lo que cambia es que cuando se
decida qué hacer con ese barrido, se decide sobre 137 procesos de trabajo real y
no sobre una cifra abstracta.

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

## 5-bis · El testimonio, y de dónde sale esta certeza

> ### 🗣 Testimonio
>
> **Quién:** Giovanny Montes, NEG Ingeniería.
> **Cuándo:** 14 de noviembre de 2026.
> **Cómo consta:** afirmado por él y relevado a esta sesión de trabajo el mismo
> día, en respuesta a la pregunta planteada arriba en este mismo documento.
>
> **Qué afirma:** que **los siete** del grupo A —`TMSA-MIN-14-2026`,
> `MC-CIC-9226-446-2026`, `IECR-008-2026`, `IEGM-015-2026`, `53025223`,
> `4143.091.26.30.2026` y `CW404232`— **los vio en el portal de SECOP II.**
> Todos. No en otra plataforma, no en un boletín, no de oído.

**Esto no es un detalle de procedimiento: es la pieza que vuelve concluyente la
corrida del 18.** De las cuatro explicaciones de arriba, el testimonio mata la
**3** —*nunca se publicó*—, que era la única que el dataset no podía separar de
la pérdida. Quedan la 1 (llegó tarde), que el 18 pone a prueba; la 4 (está con
otra forma o sin fecha), que los pasos 3 y 4 del protocolo descartan caso por
caso; y la 2, la pérdida.

Queda escrito con autor y fecha a propósito. Quien lea este documento en seis
meses tiene que poder ver **de dónde salió la certeza** y, si hace falta,
volver a preguntarle a la persona que la dio. Un documento que dijera «los
procesos estaban publicados» sin decir quién lo vio sería una afirmación sin
dueño, y una afirmación sin dueño no se puede revisar.

> ⚠ Lo que el testimonio **no** cubre, para no estirarlo: afirma que los vio en
> el portal, no la fecha exacta en que cada uno se publicó. Los días hábiles de
> retraso del paso 1 del protocolo salen de la `fecha_de_publicacion_del` del
> dataset cuando la fila aparezca, no del testimonio.

## 6 · El protocolo, para que la corrida del 18 sirva

1. **Fecha: martes 18-nov o después.** Tres días hábiles tras la última
   publicación en juego.
2. **Los 7 casos, no 5.** La exclusión de BanRep y EPM queda retirada (§2).
3. **Sin filtro de fecha**, nunca. La búsqueda es por referencia exacta sobre
   todo el dataset (§4).
4. **Serie y dueño.** Para cada ausente: la serie de **su** entidad, no del
   prefijo (§3a), y solo si la serie es densa y de un dueño (§3b).
5. **El testimonio ya está** (§5-bis): los siete fueron vistos en el portal de
   SECOP II. Este paso está cumplido y no hay que volver a preguntarlo.

Y entonces el veredicto se parte en dos, sin terceras opciones:

| resultado el 18 | qué significa | qué se reporta |
|---|---|---|
| **apareció** | **retraso** | **cuántos días hábiles** tardó cada uno: de su `fecha_de_publicacion_del` a la fecha en que se lo ve en el dataset |
| **sigue ausente** | **pérdida real del dataset** | el caso, y nada de conclusión todavía — ver abajo |

Para los días hábiles: contar con el calendario de festivos de Colombia que ya
está en el repositorio (`src/utils/sigp/calendarioColombia.ts`), no a mano. El
forense anotó entre sus salvedades que el 11,4 % se calculó **sin contar
festivos**; esta cuenta no debe repetir eso.

Dos salvedades sobre ese número, porque de otro modo se reporta con una
precisión que no tiene:

- **Contar con el calendario de festivos** que ya está en el repositorio
  (`src/utils/sigp/calendarioColombia.ts`), no a mano. El forense anotó entre
  sus salvedades que el 11,4 % se calculó **sin contar festivos**; esta cuenta
  no debe repetir eso.
- **Una sola observación da un intervalo, no un dato.** Si una fila está ausente
  el 14 y presente el 18, lo que consta es que tardó **más de lo que va del 14 y
  a lo sumo hasta el 18** — no se sabe si llegó el 17 o el 18. Reportar «tardó N
  días» con una sola mirada es inventar el día de llegada. Dos formas de
  resolverlo, y la primera es casi gratis: **mirar el 17, el 18 y el 19** y
  quedarse con el primer día en que aparece; o reportar el intervalo tal cual,
  con sus dos extremos. Lo que no vale es el punto medio.

### Si queda aunque sea uno

**Es un hallazgo mayor que el retraso**, y precisamente por eso no se concluye
del caso único. Un proceso perdido puede ser un error puntual de una carga; un
patrón es otra cosa, y solo lo segundo cambia qué fuente puede usar el radar.

Antes de concluir hay que medirlo en grande, y hay dos caminos. **El segundo es
el que recomiendo**, por una razón concreta:

**(a) Muestra del portal con testimonio independiente.** Tomar N procesos vistos
en el portal por una persona —no por una máquina— y verificar cuántos llegaron
al dataset. Es el método directo y el más fuerte como evidencia. Su costo es
real y hay que decirlo: **el portal está detrás del reCAPTCHA**, así que la
muestra la tiene que recolectar una persona a mano, proceso por proceso. Con 30
casos ya se distingue un error puntual de un patrón; con 5 no.

**(b) Densidad de series, sin necesidad de testigo.** Tomar un **mes cerrado**
—donde el retraso ya no pueda explicar nada— y medir la densidad de las series
de las entidades que publican seguido: un solo dueño, prefijo propio, serie
numérica. Si el dataset es espejo completo, esas series deben ser densas salvo
cancelaciones. Un **déficit sistemático de densidad** es evidencia de pérdida a
escala, y se mide **solo con datos abiertos**, sin portal, sin reCAPTCHA y sin
que nadie transcriba nada a mano.

Las dos condiciones que (b) exige, aprendidas a golpes en §3: la serie tiene que
ser **densa y de un solo dueño** —el prefijo `IECR` lo comparten tres entidades
y el contador `9226` del SENA seis prefijos—, y **toda ausencia se busca sin
filtro de fecha**, o se inventan pérdidas como la de §4. Un universo de
entidades que cumplan ambas se puede armar con el dataset mismo.

Tampoco lo construyo acá: (b) es una medición grande y depende de que el 18 deje
al menos un caso que la justifique. Si el 18 cierra con todos presentes, no hay
nada que medir en grande.

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
