# Recall del radar — qué se queda afuera

*Medido el 13-nov-2026. Léxico v1.1 (43 términos, negativos SOFTWARE y DOTACION).*

Todo lo que se había medido hasta hoy era **precisión**: de lo que entra, cuánto
sirve. Eso se puede medir mirando la cola. El **recall** —qué se queda afuera—
no deja rastro en ninguna pantalla, así que hay que ir a buscarlo contra una
verdad externa.

La pregunta de Giovanny que abrió esto: *¿y lo que NEG nunca ha hecho?* El
léxico se derivó del histórico de NEG. Por bien calibrado que esté, ahí es
**ciego por construcción** — no es un defecto del criterio, es su límite.

---

## 1. Las cuatro puertas

El radar no es un criterio, son cuatro en fila. Importa saber en cuál se cae
cada pérdida, porque arreglar la equivocada no cambia nada:

| # | puerta | dónde se aplica |
|---|---|---|
| 1 | **modalidad** — solo mínima y menor cuantía | en la consulta a SECOP |
| 2 | **territorio** — Bogotá + Cundinamarca | en la consulta (Antioquia y Boyacá se traen solo para contar) |
| 3 | **código** — si existe y está FUERA de las 3 familias, se rechaza **aunque el texto coincida** | en casa |
| 4 | **léxico** — solo habla cuando no hay código | en casa |

> **Trampa que me comí en la primera corrida.** Conté `UNSPECIFIED` como
> «código fuera de familia» y me dio 69,6 % donde el real era 82,6 %.
> `UNSPECIFIED` es **tri-estado**: no es «fuera», es «SECOP todavía no le puso
> código» — el estado normal de lo recién publicado, y justo donde el texto
> tiene que hablar. Está documentado como la trampa 5 de `secopMapeo.ts` y aun
> así la repetí al medir.

---

## 2. Las tres fuentes de verdad

### (a1) Los 23 procesos que NEG ganó en SECOP II

NIT 900975870, dataset `p6dx-8zbt`: 24 filas que colapsan a 23 procesos.

**19 de 23 — 82,6 %.** Coincide exacto con el `recall_ganados` que ya estaba
en el registro del léxico, lo cual es buena señal de que la medición no está
sesgada por cómo la escribí.

Los 4 que falla:

| puerta | caso |
|---|---|
| territorio (observado) | Boyacá — subestación eléctrica |
| territorio (observado) | Antioquia — mantenimiento a todo costo |
| modalidad | «Contratación régimen especial» — ferretería para adecuaciones |
| **código** | `V1.30171706` — adecuación de ambientes formativos. **El texto SÍ coincidía.** |

Dos de las cuatro son la **decisión territorial deliberada** de B.1c, ya medida
y ya revisable con número. Una es estructuralmente invisible (el régimen
especial no está en la consulta). **Una sola es culpa del filtro de familias.**

### (a2) Los 372 del registro histórico de Karen

**299 de 372 — 80,4 %.**

| puerta | n |
|---|---|
| léxico | **49** |
| modalidad «otra» | 22 |
| léxico, bloqueado por DOTACION | **1** |
| modalidad licitación pública | 1 |
| **código fuera de familia** | **0** |

**Cero** pérdidas por el filtro de familias. Todas las pérdidas corregibles son
del léxico.

> ⚠ **Un falso negativo que introduje yo hoy mismo — YA CORREGIDO.** El
> bloqueado por `DOTACION` era *«OBRAS DE ADECUACIÓN, MANTENIMIENTO Y DOTACION
> DE MOBILIARIO DE LA INFRAESTRUCTURA FÍSICA…»* — trabajo de NEG, con cuatro
> términos buenos adentro, vetado por una palabra. `DOTACION` midió 3 de 3
> ruido sobre la cola de 128, y esa medición de **precisión** no podía ver
> este caso.
>
> **`DOTACION` salió de los bloqueos por completo** el mismo día. Los 372
> quedan con CERO bloqueados. Costo de sacarlo: 3 procesos de ruido vuelven a
> la cola de hoy (111 en vez de 108) — ruido visible a cambio de un veto
> invisible. El criterio que salió de esto está en la bitácora: **un término
> negativo exige más evidencia que uno positivo, porque su error no aparece en
> ninguna métrica.**

### (b) SOLTEC — la verdad que no viene de nuestro pasado

Primero hubo que acertar con la empresa. Hay 13 adjudicatarios con «SOLTEC» en
el nombre. El de más volumen, **SOLTEC VM SAS** (204 procesos), **no es
comparable**: vende papelería, ferretería, elementos de aseo, y opera nacional
(Antioquia 37, Santander 17, Cauca 11…). El radar le trae 0 de 204, y hace
bien.

La comparable es **SOLTEC PROYECTOS DE INGENIERÍA S.A.S.** — 59 procesos, **52
en Bogotá + 4 en Cundinamarca** (56 de 59 en el territorio), **58 de 59 en las
dos modalidades**, y objetos que son literalmente el trabajo de NEG:
mantenimiento preventivo y correctivo de sedes, terrazas, baños, cubiertas,
adecuaciones.

**34 de 59 — 57,6 %.**

| puerta | n | |
|---|---|---|
| **léxico** | **11** | los vio y los dejó ir |
| **código fuera de familia** | **10** | 3 con texto coincidente |
| territorio | 3 | |
| modalidad | 1 | |

De los 10 del código, siete son trabajo distinto (conos de seguridad, carpas,
consultoría de redes, estanterías). De los 11 del léxico, unos 7 son trabajo de
NEG de verdad; los otros son torres de comunicaciones, puertas metálicas y un
objeto que dice literalmente «No definido».

---

## 3. La respuesta a la pregunta de diseño

> *«Si el recall contra SOLTEC es malo, el problema no es el léxico sino el
> filtro de familias.»*

**El recall contra SOLTEC es malo —57,6 %— y el problema SÍ es el léxico.**

Sumando las tres fuentes:

| puerta | pérdidas |
|---|---|
| **léxico** | **60** (0 + 50 + 11) |
| código fuera de familia | 11 (1 + 0 + 10) — y solo **4** tenían texto coincidente |
| territorio | 5 — decisión deliberada, ya medida |
| modalidad | 25 — fuera de la consulta por diseño |

El filtro de familias cuesta 4 pérdidas reales en toda la evidencia disponible.
El léxico cuesta 60.

---

## 4. Qué le falta al léxico, medido

Sobre los 11 que SOLTEC ganó y el radar vio y dejó ir. Dos hipótesis:

**MORFOLOGÍA** — el léxico aprendió el plural y no el singular. Tiene
`MANTENIMIENTOS PREVENTIVOS` y `PREVENTIVOS CORRECTIVOS`; **no tiene
`MANTENIMIENTO PREVENTIVO` ni `PREVENTIVO CORRECTIVO`**. El corte de la
derivación (lift ≥ 10) dejó afuera las formas singulares porque son comunes en
el corpus negativo — mantenimiento de vehículos, de software, de ascensores.

**OFICIO** — sustantivos del trabajo que el corpus de NEG no traía: terraza,
baño, hidráulico.

| candidato | recupera | costo (procesos/año que agregaría) |
|---|---|---|
| `MANTENIMIENTO PREVENTIVO` | 4 de 11 | **575** |
| `PREVENTIVO CORRECTIVO` | 4 de 11 | **561** |
| `TERRAZA` | 1 | **0** |
| `BANOS` | 1 | 2 |
| `HIDRAULICO` | 1 | 5 |
| `MANTENIMIENTO CORRECTIVO` | 0 | 47 |
| `SEDE` / `SEDES` | 1 / 0 | 82 / 137 |
| `EDIFICACIONES` | 0 | 19 |
| `IMPERMEABILIZACION`, `ENCHAPE`, `MAMPOSTERIA`, `REPARACION LOCATIVA`, `ADECUACION LOCATIVA`, `HIDROSANITARIO`, `TERRAZAS` | 0 | 0 |

Los 20 candidatos juntos subirían el recall de SOLTEC de **34 a 41 de 59**
(57,6 % → 69,5 %) y harían crecer la cola de 2026 en **802 procesos — unos 3,5
por día hábil adicional**.

Pero **575 de esos 802 vienen de un solo término**, y lo que trae son repuestos
y mantenimiento de vehículos y de estaciones meteorológicas. El reparto no es
parejo: hay candidatos casi gratis (`TERRAZA` 1 a cambio de 0) y candidatos
carísimos.

---

## 5. Energías alternativas — el volumen, antes de proponer nada

En **todo 2026**, territorio + las dos modalidades: **54 procesos** cuyo objeto
nombra solar, fotovoltaico, eólico, biomasa, autogeneración o energía no
convencional. El radar **ya trae 12** de esos 54.

Y están repartidos en **22 familias distintas**. La que más concentra es
`V1.7215` con 7 — **que NEG ya tiene**. Las demás tienen 5, 3, 2, 1.

**No hay una familia de energías alternativas que agregar.** El volumen total
del segmento es de unos 54 procesos al año y no se concentra en ningún código.
Si NEG quiere entrar ahí, la palanca es el **texto**, no las familias — y aun
con el texto perfecto el techo es ~42 procesos nuevos al año.

### Las familias que sí tienen volumen

De lo que hoy NO entra en el universo 2026, por familia:

| familia | no traídos | con texto coincidente | qué es |
|---|---|---|---|
| `V1.7818` | 510 | 20 | mantenimiento de **vehículos** — correctamente afuera |
| `V1.8413` | 466 | 5 | seguros |
| `V1.8111` | 463 | 43 | **software** — correctamente afuera |
| **`V1.7214`** | **385** | **66** | **mejoramiento de vías** ← candidata real |
| `V1.8512`, `V1.9314`, `V1.8510` | 704 | 4 | exámenes médicos |
| `V1.4323` | 336 | 13 | licenciamiento de software |
| **`V1.7315`** | **136** | **9** | **mantenimiento de sistemas de energía eléctrica** ← candidata real |

Las dos candidatas con sentido para NEG son `V1.7214` (vías) y `V1.7315`
(sistemas de energía eléctrica). Las dos son decisión de negocio, no de datos:
`V1.7214` son 66 procesos al año con texto coincidente, y **si la señalización
y la obra vial son el trabajo de NEG es la misma pregunta abierta que dejó
`OBRAS` en el léxico v1.1**.

---

## 6. La muestra para juzgar lo que no se sabe

El universo 2026 (territorio + dos modalidades) son **18.378 procesos**. El
radar trae **2.662 — el 14,5 %**. No trae 15.716.

Para estimar lo que se escapa donde no hay verdad conocida:
**`docs/muestra-no-traidos-100.csv`** — 100 procesos al azar de los 15.716,
con semilla fija (20261113) para que la muestra sea reproducible y auditable.
Columna B vacía para marcar SÍ/NO.

Con 100 juzgados, el margen de error de la proporción es de ±10 puntos al 95 %.
Si marcan 3 relevantes, lo que se escapa está entre ~0 y ~470 procesos al año;
si marcan 15, entre ~1.100 y ~3.600. La diferencia entre esos dos resultados
cambia por completo qué tan urgente es el recall, y es la única forma de saberlo.

---

## 7. Límites de esta medición

- **El territorio no se pudo verificar en los 372**: el registro de Karen no
  tiene campo de departamento. Su recall de 80,4 % podría ser algo menor si
  alguno estuviera fuera.
- **La comparabilidad de SOLTEC es un juicio, no un dato.** Elegí
  SOLTEC PROYECTOS por territorio, modalidad y objeto; que sus 59 procesos sean
  procesos que NEG «debió ver» es una afirmación de negocio. Al menos 4 de sus
  59 no son trabajo de NEG.
- **Los costos de los candidatos se midieron sobre 2026 completo**, que es la
  ventana del universo consultado. Un año distinto daría números distintos.
- **Nada de esto mide si un proceso traído se habría GANADO.** Recall es
  «¿lo habríamos visto?», no «¿nos habría servido?».
