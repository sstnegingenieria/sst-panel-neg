# Forense de los 14 que Giovanny encontró a mano

*Medido el 14-nov-2026. Última corrida del radar: 13-nov 11:30 UTC (06:30 de
Bogotá).*

---

## La medición que cambia el orden de todo

**El conjunto de datos abiertos va dos días atrasado.**

Filas por fecha de publicación, en el territorio y las dos modalidades del
radar:

| día | filas en el dataset |
|---|---|
| **2026-11-14** (hoy, sábado) | **0** |
| **2026-11-13** (viernes) | **0** |
| 2026-11-12 (jueves) | 30 |
| 2026-11-11 | 144 |
| 2026-11-10 | 121 |
| 2026-11-09 | 124 |
| 2026-11-06 | 136 |

Un jueves normal trae entre 108 y 144. El 12 trae **30**. El 13, un viernes
hábil, trae **cero**. No es el fin de semana: los sábados y domingos (8, 7, 2,
1 de nov) traen entre 1 y 5 filas, y el 13 fue viernes.

### Y la curva contra nuestra cola

Por día de publicación: cuántos procesos **calificarían** hoy según el
clasificador, contra cuántos tiene de verdad la cola.

| día de publicación | debería | tiene | faltan |
|---|---|---|---|
| 2026-10-29 | 18 | 19 | — |
| 2026-11-05 | 15 | 15 | — |
| 2026-11-06 | 17 | 17 | — |
| 2026-11-09 | 20 | 22 | — |
| 2026-11-10 | 11 | 16 | — |
| **2026-11-11** | **16** | **2** | **14** |
| **2026-11-12** | **5** | **0** | **5** |

Hasta el 10 de noviembre la cola está completa — tiene incluso más, porque el
radar desplegado clasifica con el léxico v1.0 y trajo cosas que v1.1 ya no
reconoce. Del 11 tiene **2 de 16**. Del 12, **ninguno**. Del 13 no hay nada que
traer: el dataset todavía no lo publicó.

**La corrida del 13 a las 06:30 vio 2 de los 16 procesos publicados el 11.**

### Lo que esto significa, y lo que no

**No es que se pierdan.** El solape de la ventana es de 45 días, así que una
fila que aparezca el 16 de noviembre entra igual en la corrida del 16. Llegan
tarde, no se pierden.

**El problema es cuánto de la ventana se come el retraso.** En menor cuantía la
puerta de manifestación se cierra alrededor del día 5 de un proceso de ~9 días
(medido). Dos días de atraso son el 40 % de esa ventana. En mínima cuantía, con
plazos de 4 días, dos días la cierran.

**El léxico es secundario.** Tenías razón. Afinar palabras sobre una cola que
llega con dos días de retraso mejora lo que ya veíamos tarde.

---

## Caso por caso

### Grupo A — No están en el dataset (7 de 14)

El radar no pudo verlas: no existen en datos abiertos, ni con la referencia
exacta ni con la entidad.

| referencia | entidad | |
|---|---|---|
| `TMSA-MIN-14-2026` | Transmilenio | cero filas |
| `MC-CIC-9226-446-2026` | SENA Tolima | cero filas |
| `IECR-008-2026` | — | cero filas |
| `IEGM-015-2026` | — | cero filas |
| `53025223` | Banco de la República | cero filas |
| `4143.091.26.30.2026` | — | cero filas |
| `CW404232` | EPM | cero filas |

Dos de estas no son retraso, son **otra plataforma**: el Banco de la República
y EPM contratan por régimen propio y no publican en SECOP II como los demás.
`CW404232` tiene la forma de un identificador del portal de EPM, no de una
referencia de SECOP.

Para las otras cinco no se puede distinguir, con lo medido, entre «todavía no
llegó» y «no se publica acá». Lo que sí se puede decir: **si Giovanny las vio en
el portal de SECOP y no están en el dataset, es retraso** — y es el mismo
retraso de dos días de arriba.

> ⚠ Tres referencias que **no pude identificar**: `MC-028-2026` trae 104 filas
> con esa referencia exacta y ninguna del INPEC; `09-2026` trae 200 y ninguna de
> la IE La Trinidad; `CONT-005-2026` trae 7 y ninguna que corresponda.
> `referencia_del_proceso` **no es identidad** —la trampa 10 del mapeo: una
> misma referencia la usan decenas de entidades— así que no puedo afirmar nada
> sobre esas tres sin el enlace del proceso o el id de SECOP.

### Grupo B — Fuera del territorio: decisión, no defecto

| referencia | entidad | depto | qué habría pasado |
|---|---|---|---|
| `FLO-INFRA-SA-MC-005-2026` | Alcaldía de Floridablanca | **Santander** | el texto coincide en `ADECUACION`, `OBRAS` e `INFRAESTRUCTURA` — **habría entrado** |

*Adecuación, ampliación y modernización de la infraestructura eléctrica de la
administración central.* Es trabajo de NEG y el léxico lo reconoce. Lo deja
afuera la frontera geográfica de B.1c, que es una decisión medida y revisable
con número, no un error.

### Grupo C — Fuera de la modalidad consultada

| referencia | entidad | modalidad | |
|---|---|---|---|
| `DIVCAD-LC-05-2025-1` | U. Militar Nueva Granada, **Bogotá** | Contratación régimen especial (con ofertas) | coincide en `MANTENIMIENTOS` e `INFRAESTRUCTURA` |
| `ADC-009-2026` | Artesanías de Colombia, Bogotá | Contratación régimen especial (con ofertas) | bolsas de lona — no es trabajo de NEG |

**La de la Universidad Militar merece una decisión, no una explicación.** Está
en Bogotá, es trabajo de NEG (*servicios de mantenimientos locativos*), y es una
**lista de precalificados** — entrar en una de esas vale más que una licitación
suelta. La consulta no la trae porque el régimen especial no está en las
modalidades de ingesta.

### Grupo D — El que prueba el retraso

| referencia | entidad | |
|---|---|---|
| `DSAJBO-SAMC-008-2026` | Rama Judicial — Dirección Seccional de Bogotá | **debería estar en la cola y no está** |

| | |
|---|---|
| publicado | **2026-11-11** |
| recepción de ofertas | 2026-12-03 |
| departamento | Distrito Capital de Bogotá |
| modalidad | Selección Abreviada de Menor Cuantía |
| código | `UNSPECIFIED` → el texto decide |
| objeto | *Realizar la modernización del sistema de impermeabilización de la sede Judicial Calle 72…* |

Las cuatro preguntas:

1. **¿Está en el dataset?** Sí, una fila.
2. **¿La trajo la consulta?** Debería: pasa modalidad, pasa territorio, está
   dentro de la ventana de 45 días.
3. **¿La descartó el clasificador?** No. Entra por texto.
4. **¿Qué término la captura?** **`IMPERMEABILIZACION`** — que está en el léxico
   desde v1.0, así que ni siquiera es un término nuevo.

**Y no está en `licitaciones`.** Pasa todas las puertas, el término que la
captura llevaba meses en el léxico, y no llegó. Es uno de los 14 que faltan del
11 de noviembre: cuando el radar corrió el 13 a las 06:30, esa fila todavía no
estaba en el dataset.

Es el caso que separa las dos explicaciones posibles. Si el problema fuera el
léxico, este proceso estaría descartado con un motivo. Si fuera el territorio o
la modalidad, no habría llegado a la cola. Lo que pasó es que **el radar no lo
vio**, y tiene plazo hasta el 3 de diciembre: todavía se puede presentar.

---

## Lo que queda por decidir

Esto no se arregla con palabras del léxico. Las opciones, en orden de lo que
cuestan:

1. **Aceptar el retraso y dejarlo escrito.** La cola de hoy es la de anteayer.
   Cuesta nada y al menos nadie saca conclusiones de una cola que cree
   completa. No sirve para mínima cuantía con plazo de 4 días.
2. **Buscar la fuente oportuna.** El portal de SECOP II tiene los procesos el
   mismo día; el dataset `p6dx-8zbt` es un espejo que se actualiza con retraso.
   Habría que medir si hay una API o un canal con menos latencia — y si existe,
   el radar cambia de fuente, no de criterio.
3. **Revisar la frontera de modalidad** para el caso de la Universidad Militar:
   el régimen especial con ofertas trae listas de precalificados en Bogotá que
   son trabajo de NEG. Hay que medir su volumen antes de proponer nada.
4. **La frontera territorial** sigue siendo la decisión que ya estaba medida.
   Floridablanca entra en esa conversación, no en esta.

**Y lo primero, sin esperar nada:** `DSAJBO-SAMC-008-2026` tiene plazo al 3 de
diciembre. El radar la va a traer en su próxima corrida, cuando el dataset la
publique. Pero no hace falta esperarla para trabajarla.
