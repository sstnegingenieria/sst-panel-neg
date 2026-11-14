# ¿El conjunto se llena de madrugada o a lo largo del día?

*Medido el 14-nov-2026 desde las 14:50 de Bogotá. **La serie horaria está en
curso**: este documento trae lo retrospectivo, que ya decide bastante, y queda
abierto para el resultado de las 26 muestras.*

*Fuente: PORTAL DE DATOS ABIERTOS - SECOPII (dataset `p6dx-8zbt`, datos.gov.co).*

---

## Lo que esta pregunta sí es, y lo que no

No se toca el retraso de dos días de la fuente. Eso es *cuándo la entidad
publica* contra *cuándo la fila aparece en el conjunto*. Esto otro es el tramo
siguiente: **entre que la fila aparece y nosotros la vemos**, que es lo único
que nuestras dos corridas pueden mover.

---

## 1 · «Filas nuevas por franja» no es observable, y por qué importa

Primero medí si la pregunta se podía responder con los datos mismos. **No se
puede, y la razón decide el método.**

Las **9.487.636** filas del conjunto tienen:

| campo del sistema | valores distintos | valor |
|---|---|---|
| `:created_at` | **1** | `2026-11-13T14:37:51.088Z` |
| `:updated_at` | **1** | `2026-11-13T14:37:51.088Z` |

Un solo `:created_at` para nueve millones y medio de filas significa que el
conjunto **no se va agregando: se borra y se reinserta completo** en cada
refresco. Y que los dos campos sean el **mismo instante** lo confirma — ninguna
fila ha sido tocada después de nacer, porque todas nacieron en el mismo
momento.

Consecuencia dura: **no existe historia de inserción por fila.** «Cuántas filas
nuevas entraron entre las 10 y las 11» no es una pregunta que el conjunto pueda
responder, ni hoy ni nunca, porque el refresco siguiente borra la evidencia del
anterior. Esto ya estaba medido en `secopConsulta.ts` —*«las 29.354 filas del
filtro tienen el MISMO `:updated_at`; el dataset se republica completo»*— y es
la razón de que la marca incremental del radar sea
`fecha_de_publicacion_del` y no `:updated_at`.

Lo único observable es si el **contenido cambia entre dos miradas**. De ahí que
el muestreo compare snapshots en vez de contar inserciones.

## 2 · El conjunto declara su propia frecuencia: «Diaria»

En los metadatos del propio publicador (Colombia Compra Eficiente), campo
`Información de Datos`:

> **«Frecuencia de Actualización»: «Diaria»**

Es la declaración del dueño del dato, no una medición. Vale como punto de
partida y como algo que contrastar: si la serie horaria mostrara dos refrescos
al día, la declaración estaría desactualizada; si muestra uno, coincide.

## 3 · Y acá está lo que no cuadra — dos marcas de tiempo que se contradicen

| marca | valor | en Bogotá |
|---|---|---|
| `rowsUpdatedAt` (metadatos del conjunto) | `1794635647` | **14-nov 00:54:07** |
| `:created_at` / `:updated_at` (las 9,5 M de filas) | `2026-11-13T14:37:51Z` | **13-nov 09:37:51** |

**Quince horas de diferencia, y apuntan a dos historias distintas.**

- Si la que manda es `rowsUpdatedAt`, el refresco fue **de madrugada** (00:54) y
  encaja con la ventana de carga de 00:34–02:29 que medí en los otros seis
  conjuntos. Nuestras corridas de 06:30 y 14:00 estarían bien puestas.
- Si la que manda es el timestamp de las filas, el último reemplazo completo
  ocurrió **a las 09:37 de la mañana** del 13 de noviembre. Eso es **media
  mañana, no madrugada** — y entonces la corrida de 06:30 llega *antes* de la
  carga del día y la de 14:00 la recoge con horas de atraso.

La segunda lectura tiene un apoyo incómodo: **el refresco de las 00:54 de hoy
no cambió el timestamp de ninguna fila.** Si cada refresco borra y reinserta,
el de esta madrugada tendría que haber puesto `:created_at` de hoy en los nueve
millones de filas, y no lo hizo. Caben dos explicaciones y no puedo elegir entre
ellas con una sola mirada:

1. el evento de las 00:54 **no tocó las filas** (fue de metadatos, o un refresco
   que no encontró nada que cambiar), y la última carga real de datos sigue
   siendo la del 13 a las 09:37;
2. Socrata preservó los timestamps en una operación que no reemplazó filas.

**No pre-concluyo.** Una medición que no distingue entre «cargan de madrugada» y
«cargan a media mañana» es precisamente la que hay que hacer, y es la que está
corriendo.

> Esto además pone en duda algo que yo daba por bueno: la ventana de carga de
> **00:34–02:29** salió de la *hora de carga declarada* de seis conjuntos, no de
> observar cuándo cambia el contenido de este. Son dos cosas distintas y las
> traté como una.

## 4 · El muestreo que está corriendo

`_datos/cadencia-p6dx/muestrea.py` (fuera del repo — `_datos/` está
gitignoreado). **26 muestras, una por hora**, tres peticiones cada una, cada
muestra escrita al archivo en el momento para que la serie sirva aunque el
proceso se caiga a la mitad.

Qué registra cada hora, y por qué cada cosa:

| medida | para qué |
|---|---|
| `rowsUpdatedAt` de los metadatos | la marca de refresco del publicador: **cuándo** dice que cargó |
| `count(1)` total + `max(:updated_at)` | si el conteo o el timestamp se mueven a mediodía, **entró algo a mediodía** |
| histograma por `fecha_de_publicacion_del` de 7 días, **dentro del filtro del radar** | lo único que nos importa de verdad: si aparecen procesos **útiles** durante la jornada |

El tercero es el que decide la pregunta práctica. Que el conteo global de nueve
millones de filas se mueva no dice nada sobre si tenemos trabajo nuevo que ver;
que el histograma del territorio y nuestras modalidades gane filas a las 11 de
la mañana, sí.

**Primera muestra, 14-nov 14:56 Bogotá** (línea base):

```
filas=9.487.636 | refresco declarado=2026-11-14 00:54:07 | radar 7 días=458
por día: 12-nov 33 · 11-nov 157 · 10-nov 131 · 09-nov 136 · 08-nov 1
```

Son 78 peticiones repartidas en un día sobre la fuente **expresamente
autorizada**. El tope duro de 12 por corrida es del portal transaccional, no de
acá.

> ⚠ **El muestreo vive mientras viva la sesión.** Si se corta, se relanza con un
> comando y la serie continúa en el mismo archivo; lo que ya está medido no se
> pierde, porque cada muestra se escribe al momento. Si hace falta que sobreviva
> a un reinicio, se monta como tarea programada del sistema — eso no lo hago sin
> decirlo antes, porque deja algo instalado en la máquina.

## 5 · Qué se decide con cada resultado, escrito antes de verlo

Para no interpretar la serie a favor de lo que convenga:

| forma de la serie | conclusión | qué hacer |
|---|---|---|
| El histograma del radar **no se mueve** en todo el día y solo salta una vez, de madrugada | **carga diaria nocturna** | **nada.** Las dos corridas están bien y correr más seguido no gana una sola hora |
| Salta una vez, pero **a media mañana** (la lectura del 09:37) | carga diaria, **mal alineada con nuestro horario** | mover la corrida de la mañana a después de la carga. No hace falta correr más seguido: hace falta correr **después** |
| Gana filas **en varias franjas** del día | carga incremental | decidir cada cuánto, y ahí sí el intervalo se vuelve una pregunta con número |

**Y la medición no dice nada sobre el retraso de dos días.** Si el conjunto
cargara cada quince minutos, la fila del proceso publicado hoy seguiría
apareciendo pasado mañana. Lo que esto puede ganar son **horas dentro del día en
que la fila ya existe** — valioso en mínima cuantía, donde el plazo es de cuatro
días, e irrelevante para el retraso de origen.

## 6 · De paso: no hay canal privilegiado, y eso ya está medido

Los servicios comerciales de alertas leen `datos.gov.co`, la misma fuente que
nosotros. Uno declara revisar cada 15 minutos y otro dos veces al día — y ese
contraste es información útil por sí mismo: **si alguno tuviera un canal más
rápido, no necesitaría sondear.** Que el más agresivo sondee cada quince minutos
es la conducta de quien no tiene empuje del lado del servidor, igual que
nosotros.

No lo verifiqué contra sus sistemas y no hace falta para lo de acá: coincide con
lo medido en `docs/terminos-secop-acceso-automatizado.md` —no hay API ni
suscripción documentada— y es una de las preguntas de la consulta a la mesa de
servicio de Colombia Compra que está lista para enviar.

Lo que sí deja esto claro: **la frecuencia con que sondeamos es la única palanca
que tenemos de este lado**, y por eso vale medir dónde está el techo antes de
mover el horario.

---

## Resultado de la serie horaria

*Pendiente — se completa cuando terminen las 26 muestras. La serie cruda queda
en `_datos/cadencia-p6dx/muestras.jsonl` (una línea JSON por muestra) y legible
en `muestras.txt`.*
