# Tres actos sobre datos de producción — medidos, sin ejecutar

*Preparados el 14-nov-2026, antes del despliegue del radar. Los números son de
`licitaciones` en producción (501 documentos: 129 del radar + 372 del registro
histórico migrado).*

Las tres son escrituras sobre producción. Se presentan juntas a propósito: hay
una dependencia entre ellas que cambia el orden sensato, y decidir de a una
llevaría a hacerlas en el orden equivocado.

---

## El hecho que gobierna los tres

**`radar` está en `CAMPOS_PROTEGIDOS`.** La corrida no lo toca nunca después
del nacimiento, y está así a propósito: es la *procedencia* — por qué el radar
trajo este proceso. Si se refrescara, la pregunta «¿alguno de los que entraron
por clase sin texto se trabajó?» dejaría de tener respuesta.

Consecuencia: **ninguna corrida futura va a arreglar los 129 documentos que ya
existen.** Se quedan con `fase: null`, sin portafolio y sellados
`vocabulario_version: v1.0 (empaquetada)` para siempre. Lo mismo el semáforo
(`semaforo`, `semaforo_motivos`, `semaforo_version` están protegidos, y la
invariante 5 prohíbe que la versión se mueva de refilón).

El despliegue arregla **lo que venga de ahora en adelante**. Lo ya escrito
necesita un acto, o se queda así.

---

## Acto 1 · Reevaluar los 129 del radar

Son tres cosas separables, y conviene no mezclarlas porque tienen riesgos
distintos.

### 1a · Completar los hechos que faltan (fase, fases_previas, portafolio)

Esto **no reescribe historia: llena huecos**. La fase de un proceso es un
hecho del proceso, no un juicio nuestro. Patrón `completarSiFalta`, que ya
existe en `radarCorrida.ts`: el origen puede LLENAR un hueco, nunca VACIAR lo
que puso una persona.

| | |
|---|---|
| documentos | 129 |
| con `radar.fase` hoy | **0** |
| con `radar.portafolio` hoy | **0** |

**La fase sale del dato que ya está guardado, sin tocar la red.** El
`numero_proceso` la trae pegada al final:

```
49 de 129 traen fase en el numero_proceso
   23  (Manifestación de interés (Menor Cuantía))
   19  (Manifestación de interés (Menor Cuantía)) + (Presentación de oferta)
    1  (Manifestación de interés (Menor Cuantía)) + (Fase de ofertas)
    …
```

`separarFasesDeReferencia` las extrae contra `FASES_SECOP` (las 7 etiquetas
medidas), así que los paréntesis que son otra cosa —`(157439)`, `(168063)`—
no la confunden. Los 80 restantes no tienen fase porque su proceso no la
tiene: ausencia legítima, no hueco.

**Los 19 con las dos fases son exactamente los que activan la detección de
manifestación cerrada** — la función que lleva días desplegada y sin un solo
documento con qué trabajar.

**El portafolio NO es derivable** del documento: hay que volver a leer SECOP
por `id_secop`. Son 129 lecturas de una API pública, sin escritura de por
medio. Es la única parte de este acto que toca la red.

**Riesgo:** bajo. Solo escribe campos que hoy son `null`, y `radar` no tiene
sub-campos de persona. Lo único delicado es el principio: estamos tocando un
campo declarado protegido. La justificación tiene que quedar escrita en el
propio acto — *completar lo que el origen no capturó no es lo mismo que
reescribir el juicio del nacimiento* — o la próxima vez alguien lo usará como
precedente para lo segundo.

### 1b · Retirar los 18 que el léxico v1.1 ya no reconoce

De los 129, con el léxico v1.1 **siguen calificando 111** y **18 ya no**.

| | |
|---|---|
| los 18 están en estado | `detectada`, los 18 |
| con `override_manual` | **0** |
| con `oferta_neg` | **0** |
| con `manifestaciones` | **0** |

**Nadie perdería trabajo**: ninguno fue tocado por una persona. De los 18,
uno lo bloquea `SOFTWARE` y 17 se quedan sin ningún término.

Muestra: malla de protección y postes metálicos · capacitación en inteligencia
artificial · elementos de fisioterapia y nutrición · calibración y reparación
de equipos de laboratorio · repuestos y mantenimiento de equipos.

**Motivo:** `RUIDO_LEXICO`, que ya está en el vocabulario cerrado y significa
exactamente esto — *un defecto del instrumento, no un «no» de negocio*. Esa
distinción importa: marcarlos `FUERA_DE_ALCANCE` diría que el léxico acertó y
no los queríamos, y haría que la métrica mienta sobre el léxico.

**Riesgo:** bajo, y reversible — `descartada` no es terminal, se reabre.

### 1c · Recalcular el semáforo a v1.1

Hoy, los 129:

| | |
|---|---|
| menor cuantía · **rojo** | **73** (motivo `MODALIDAD_SIN_HISTORIAL`, los 73) |
| mínima cuantía · verde | 56 |
| `semaforo_version` | `v1.0`, los 129 |

Con v1.1 las 73 menores cuantías pasan de **rojo** a **amarillo** con motivo
`MENOR_CUANTIA`.

**El efecto que hay que mirar de frente:** `compitePorCupo` deja competir todo
lo que no sea rojo. Hoy compiten 56. Después del recálculo, y descontando los
18 que retira 1b, competirían **~111 — el doble**. Eso es volumen de decisión
sobre Karen, y es el riesgo real de este acto; no es un efecto colateral, es
*el* efecto.

**Son dos cosas, no una**, y conviene saberlo antes de empezar:

1. **Adoptar v1.1 en el registro** de `configuracion/semaforo_versiones`. El
   script ya existe (`functions/scripts/adoptar-semaforo-v1.1.js`), con
   dry-run, `--apply`, plan puro y post-verificación. Es el acto del §3-ter.
2. **Recalcular los 129 documentos.** Eso es otro acto, y no está escrito. Su
   dueño es `patchRecalcularSemaforo` (invariante 5: la versión del criterio
   solo se mueve con un cambio declarado y su motivo).

**Riesgo:** medio. No por la escritura —es determinística— sino porque cambia
lo que Karen ve como trabajable de 56 a 111 de un día para otro.

---

## Acto 2 · Las 38 históricas en Activas

**Lo primero: no es lo que parecía, y mi primera medición estuvo mal.**

`activa: true` son 129 documentos y **ninguno** es `migrado: true`. Las 372
históricas están todas con `activa: false`. El problema no está en ese campo:
está en **`seccionDe`**, que es lo que de verdad decide qué ve Karen.

```
if (estado === 'descartada')                 → descartadas
if (esLicitacionTerminal(estado))            → cerradas
if (estado === 'detectada' && esDelRadar(l)) → radar
                                             → activas      ← el resto
```

Una histórica con estado `manifestada` o `presentada` no es terminal, no está
descartada y **no es del radar** (no tiene el campo `radar`), así que cae en
Activas por descarte. Reparto real:

| sección | histórica | del radar |
|---|---|---|
| radar | — | 128 |
| **activas** | **38** | **1** |
| descartadas | 263 | — |
| cerradas | 71 | — |

**Activas son 39 documentos y 38 son históricas.** Karen abre su cola de
trabajo y 38 de 39 cosas son del registro anterior.

### Están todas muertas, y eso simplifica la decisión

| | |
|---|---|
| ya pasó su fecha de cierre | **37 de 38** |
| con cierre en el futuro | **0** |
| sin fecha de cierre | 1 |

La más reciente cerró el **1-sep-2026** — hace diez semanas. Ninguna es
trabajo en vuelo.

Por estado y año:

| año | estado | n |
|---|---|---|
| 2022 | detectada | 2 |
| 2025 | detectada | 10 |
| 2026 | detectada | 1 |
| 2026 | en_preparacion | 5 |
| 2026 | manifestada | 16 |
| 2026 | presentada | 4 |

### El problema de fondo: no hay desenlace que escribir

16 están `manifestada` y 4 `presentada`: **NEG participó**. No sabemos qué pasó
después, porque el registro no lo guardó.

- Marcarlas `descartada` **miente**: diría que decidimos no ir, y fuimos.
- Marcarlas `perdida` **inventa**: no sabemos que perdimos.
- `desierta` inventa otra cosa.
- El vocabulario cerrado de motivos (`MOTIVOS_DESCARTE`) **no tiene** uno para
  «migrada sin desenlace». `OTRO` existe y no cuenta nada, que es justo lo que
  el vocabulario cerrado vino a evitar.

**Por eso hay dos caminos y no uno:**

**Opción A — arreglo de código, sin tocar datos.** Que `seccionDe` deje de
mandar a Activas lo no terminal cuyo cierre ya pasó, y lo muestre en una
sección propia («Del registro anterior» o «Sin desenlace»). Cero escrituras,
cero hechos inventados, reversible con un deploy. Lo que no hace: no deja
registro de una decisión, porque no hay decisión — solo deja de mentir sobre
dónde va cada cosa.

**Opción B — acto de datos.** Cerrar las 38 con un estado y un motivo nuevo
(`SIN_DESENLACE`, agregado al vocabulario cerrado). Deja constancia; a cambio,
hay que escribir vocabulario nuevo para una sola migración, y seguir eligiendo
un `estado`, que es la parte que no se puede saber.

**Recomiendo A, y B solo si Karen quiere la constancia.** La razón: el problema
de Karen es que su cola está llena de ruido, y A lo resuelve hoy sin escribir
en producción ni afirmar nada que no sepamos. B se puede hacer después; A no
se puede deshacer después de B.

**Riesgo:** A es bajo (código, con tests, reversible). B es medio: escribe 38
documentos y fija un desenlace que nadie conoce.

---

## Acto 3 · Los 16 duplicados

| | |
|---|---|
| grupos con el mismo objeto | **16** |
| documentos sobrantes | **16** |
| estado de los 32 | `detectada`, los 32 |
| con portafolio hoy | **0** |

Karen ve la misma licitación dos veces: 129 documentos son **113
licitaciones**. El `numero_proceso` lo delata — uno dice `SAMC-025-2026` y el
otro `SAMC-025-2026 (Manifestación de interés (Menor Cuantía))`.

### Este acto DEPENDE del 1a

Lo único que une las fases de una licitación es `id_del_portafolio`, y **los 32
documentos no lo tienen**. Sin el 1a no hay con qué agrupar, y emparejar por
texto del objeto —que es lo que hice para medir— sirve para contar, no para
escribir en producción: dos licitaciones distintas pueden compartir el objeto
palabra por palabra.

### Cuál se queda

De cada par, el de la **fase más avanzada**: ese tiene el plazo real de
presentación. El de manifestación es el anterior. Y el que se queda necesita
`fases_previas` para que la detección de manifestación cerrada funcione — otra
vez el 1a.

**Motivo:** `DUPLICADO`, ya en el vocabulario cerrado.

### Y esto se sigue acumulando

El colapso de la corrida agrupa por `id_del_proceso`, y las filas de una misma
licitación **no lo comparten** (0 de 11.463 cruzan). **El despliegue no arregla
esto** — el arreglo es cambiar el colapso a `id_del_portafolio`, y no está
construido. Mientras no se construya, cada corrida puede agregar duplicados
nuevos.

Así que el Acto 3 son dos cosas:

- **3a — el arreglo del colapso** (código): que no nazcan más.
- **3b — los 16 ya escritos** (datos): descartar el sobrante de cada par.

Hacer 3b sin 3a es limpiar con la llave abierta.

**Riesgo:** 3a bajo (código con tests; el 9,1 % que no comparte portafolio
necesita su propio camino y hay que medirlo antes). 3b bajo — ninguno de los 32
fue tocado por una persona.

---

## El orden que sale de las dependencias

```
1a  (fase, sin red)  ──┬──> habilita la deteccion de manifestacion
1a  (portafolio)     ──┴──> prerrequisito de 3b
3a  (codigo)         ─────> que no nazcan mas duplicados
3b  (datos)          ─────> limpia los 16
1b  (18 por ruido)   ─────> independiente
1c  (semaforo)       ─────> independiente, el de mas impacto en Karen
2   (38 historicas)  ─────> independiente; A es codigo, B es datos
```

**Propuesta de orden**, de menos riesgo a más, y agrupando lo que puede ir en
una sola sentada:

| # | qué | tipo | por qué ahí |
|---|---|---|---|
| 1 | **2-A** + **3a** | código | cero escrituras en producción, resuelven lo que Karen ve hoy y detienen la acumulación |
| 2 | **1a** | datos | un solo acto, llena huecos, destraba la detección y habilita el 3b |
| 3 | **1b** + **3b** | datos | los dos son descartes con motivo del vocabulario cerrado; una sola sentada |
| 4 | **1c** | datos | el último a propósito: duplica el volumen de decisión de Karen, y conviene que la cola ya esté limpia cuando eso pase |

Lo que esto le pide a Giovanny: **dos actos de datos**, no cinco. El paso 1 no
necesita credenciales de escritura.
