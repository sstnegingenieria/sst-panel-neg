# El texto que ve Karen — inventario con el antes y el después

**Nada de esto está implementado.** Es para leer y decidir. Cuando esté
aprobado se aplica en un PR de puro texto.

Recorrido en el orden en que ella se encuentra con las cosas, no en el orden en
que están los archivos.

---

## Las tres reglas

1. **Sin números de versión en texto de usuario.** «v1.0» no significa nada
   para quien lo lee.
2. **Sin vocabulario de sistema**: criterio, discriminante, hipótesis,
   numerador, denominador, ventana medible, léxico, señal, términos, barrido,
   corrida, registro.
3. **Escribir como a un colega, no como se documenta un sistema.**

> Las tres palabras del final de la regla 2 —léxico, señal, términos— las
> agregué yo, y están ahí porque las puse yo en la pantalla. La cuarta,
> **barrido**, también.

---

## 0. Los dos campos de `configuracion/semaforo_versiones`

**Esto es un acto de datos, no un deploy**, y es lo que más se lee: el panel
pinta estos dos campos tal cual vienen de Firestore.

### Lo que hay hoy

El documento de `v1.0` tiene siete claves: `definicion`, `limitaciones`,
`motivo`, `calibracion`, `autor_uid`, `vigente_desde`, `vigente_hasta`.

De esas, **el panel muestra dos**: `definicion` y `limitaciones`. Las otras
cinco ya son del lado de la auditoría y nadie las ve.

### El problema

`definicion` y `limitaciones` tienen **un solo texto para dos lectores**: Karen,
que decide si trabaja un proceso, y quien audite la calibración dentro de un
año. Hoy están escritos para el segundo.

### Lo que propongo

**No mover nada de lo que hay.** `definicion`, `limitaciones`, `motivo` y
`calibracion` se quedan exactamente como están — son el registro auditable y
están bien escritos para eso. Se **agregan dos claves** que el panel lee, y
cae a las viejas si no existen:

| clave | quién la lee | qué dice |
|---|---|---|
| `definicion` | auditoría | la regla en su forma exacta. **Se queda.** |
| `limitaciones` | auditoría | dónde está validada y dónde no. **Se queda.** |
| `motivo` · `calibracion` | auditoría | contra qué se calibró. **Se quedan.** |
| **`resumen`** *(nueva)* | **Karen** | la regla en una frase |
| **`antes_de_descartar`** *(nueva)* | **Karen** | lo que conviene saber antes de soltar un rojo |

El nombre de la segunda dice para qué es. No es «las limitaciones del
criterio»: es lo que hay que leer **antes de descartar**, que es el momento en
que sirve.

### `resumen` — ANTES (lo que Karen lee hoy)

> ROJO si modalidad ≠ mínima cuantía. AMARILLO si hay sorteo, limitación MiPyme
> fuera de Bogotá/Cundinamarca, o requiere lectura. VERDE en el resto. Sin banda
> de presupuesto.

### `resumen` — DESPUÉS

> NEG ha ganado casi siempre en mínima cuantía, así que esas salen en verde.
> Las demás modalidades salen en rojo. Y salen en amarillo las que tienen
> sorteo, las que están reservadas a MiPymes de otra región, y las que no se
> pueden juzgar sin leer el pliego.
>
> El monto no se mira: no hay un tamaño de contrato que prediga si ganamos.

### `antes_de_descartar` — ANTES (lo que Karen lee hoy)

> El criterio está validado sobre 2022, 2024, 2025 y 2026, donde existen
> numerador y denominador. NO está validado sobre 2023, año sin registro
> interno: según datos abiertos SECOP II, 3 de las 5 adjudicaciones de 2023
> fueron Selección Abreviada de Menor Cuantía —DESAJ Cundinamarca-Amazonas
> ($315,3M), CNSC ($67,1M) e INM ($101,8M)— y v1.0 las habría marcado en rojo.
> Esas tres se adjudicaron en procesos con 2, 3 y 5 ofertas competidoras, frente
> a 4, 7 y 8 en las adjudicaciones de 2025. En la ventana medible, NEG presentó
> 16 o más menores cuantías con cero adjudicaciones. Hipótesis pendiente de
> medir para una v1.1: el discriminante puede ser el nivel de competencia y la
> presencia de sorteo, no la modalidad. Mientras tanto, la menor cuantía se
> atiende por override_manual con motivo escrito, no por bloqueo absoluto.

### `antes_de_descartar` — DESPUÉS

> En 2023 NEG ganó tres menores cuantías, y fueron de las más grandes de su
> historia: DESAJ ($315 millones), CNSC ($67 millones) e INM ($102 millones).
> En esos tres procesos competían solo 2, 3 y 5 empresas.
>
> Desde 2024, en cambio, NEG se presentó a 16 menores cuantías y no ganó
> ninguna — pero ahí competían entre 4 y 8 empresas.
>
> Puede que lo que cambió no sea la modalidad, sino cuánta competencia hay.
> Todavía no lo sabemos con certeza, y por eso esto no bloquea: avisa.

Es tu texto, con dos cambios chicos: cerré con por qué no bloquea, y saqué
«2023 es un año sin registro interno» porque esa es una explicación del dato,
no de la decisión — y vive en `limitaciones`, que se queda.

---

## 1. La bandeja — sección Radar

### 1.1 El encabezado de la sección

| | |
|---|---|
| **ANTES** | Lo que el radar trajo y todavía no es de nadie. No compite por el cupo de la semana: admitir uno es justamente lo que lo pone a competir. |
| **DESPUÉS** | *(sin cambio)* |

Está bien. «Cupo de la semana» es vocabulario de ella.

### 1.2 El aviso de las sin-fecha

| | |
|---|---|
| **ANTES** | **2** procesos van arriba: el origen no trae ninguna fecha. Sin reloj que marque urgencia, el orden por cierre manda al fondo de la cola justo lo que entró por un **barrido autorizado** y no por la **corrida** de todos los días. |
| **DESPUÉS** | **2** procesos van arriba porque **el SECOP no les puso fecha**. Sin fecha no se sabe cuánto apuran, y si se ordenaran por cierre quedarían al fondo sin que nadie los viera. |

### 1.3 Los chips de procedencia (`SENAL_LABEL`)

Es lo que dice **por qué el radar lo trajo**. Solo cuatro aparecen en pantalla;
las otras tres son veredictos que no se guardan.

| | ANTES | DESPUÉS |
|---|---|---|
| `codigo_en_familia` | Código de la familia del RUP | **Es del tipo de trabajo que NEG tiene registrado** |
| `codigo_en_clase_con_texto` | Código con adjudicación probada, y el objeto concuerda | **NEG ya ganó con este código, y el objeto concuerda** |
| `codigo_en_clase_sin_texto` | Código con adjudicación probada — el texto no dice nada | **NEG ya ganó con este código, aunque el objeto no lo diga** |
| `texto_coincide` | El objeto coincide con el **léxico** | **El objeto habla del trabajo de NEG** |
| `codigo_fuera_de_familia` | Código fuera de la familia | El código es de otro tipo de trabajo |
| `sin_codigo_ni_texto` | Ni código ni texto | Ni el código ni el objeto lo relacionan con NEG |
| `fuera_de_territorio` | Fuera del territorio | Está fuera de las zonas donde NEG trabaja |

### 1.4 El chip «léxico v1.0» — **se borra**

| | |
|---|---|
| **ANTES** | `léxico v1.0 (empaquetada)` |
| **DESPUÉS** | *(no se muestra)* |

Lo escribí yo hace dos días y rompe la regla 1 en la pantalla principal, en
cada fila. El dato sirve —para saber con qué vocabulario se clasificó— pero
sirve para depurar, no para decidir: **pasa al tooltip del chip de la señal**,
donde está si alguien lo busca y no está si nadie lo busca.

### 1.5 Los términos

| | |
|---|---|
| **ANTES** | **términos:** redes · media tensión |
| **DESPUÉS** | **coincide en:** redes · media tensión |

### 1.6 El origen de la fecha (`ORIGEN_FECHA_LABEL`)

| | ANTES | DESPUÉS |
|---|---|---|
| `publicacion` | fecha de publicación | **la fecha es la de publicación** |
| `recepcion_de_ofertas` | fecha de recepción de ofertas | **la fecha es la de recepción de ofertas** |
| `ninguna` | ⏳ sin fecha en el origen | **⏳ el SECOP no le puso fecha** |

Sueltas se leían como una etiqueta de campo. Con «la fecha es» dicen algo.

### 1.7 El grupo «Ya no alcanza»

| | |
|---|---|
| **ANTES** | Estos procesos ya no se pueden trabajar — cada fila dice por qué. Siguen a la vista porque el radar los trajo y eso cuenta, pero no hay nada que hacer en ellos. Descartarlos con «Cierra antes de poder armarlo» los saca de la cola dejando el motivo escrito. |
| **DESPUÉS** | Estos ya no se pueden trabajar, y cada fila dice por qué. Quedan a la vista para que los veas antes de soltarlos: descartarlos con **«Cierra antes de poder armarlo»** los saca de la cola y deja escrito qué pasó. |

«porque el radar los trajo y eso cuenta» explicaba una decisión del sistema.

### 1.8 Las frases de «ya no alcanza»

| | ANTES | DESPUÉS |
|---|---|---|
| plazo vencido | El plazo ya pasó | *(sin cambio)* |
| manifestación | La manifestación de interés ya cerró — no se puede presentar aunque el plazo siga abierto | *(sin cambio)* |
| cierra hoy | Cierra hoy: no da tiempo de armarla | *(sin cambio)* |
| ventana corta | Quedan 1 día hábil y hacen falta 2 | **Queda 1 día hábil y hacen falta 2 para armarla** |

### 1.9 El aviso «al filo»

| | |
|---|---|
| **ANTES** | ⏱ Justo al filo: queda 1 día hábil y hace falta 1 — habría que armarla hoy |
| **DESPUÉS** | *(sin cambio)* |

### 1.10 Falta la fecha de manifestación

| | |
|---|---|
| **ANTES** | Falta la fecha de manifestación *(tooltip: El límite de manifestación no viene en los datos del SECOP: está en el pliego.)* |
| **DESPUÉS** | *(sin cambio)* |

### 1.11 La medición de capacidad

| | |
|---|---|
| **ANTES** | En los últimos 7 días se vencieron **0** esperando en la cola, y **3** llegaron ya vencidas. |
| **DESPUÉS** | En los últimos 7 días **se te vencieron 0** esperando en la cola. Otros **3** llegaron ya vencidos — eso no es tiempo perdido, es ruido del SECOP. |

El número que le habla de su trabajo es el primero. El segundo no es suyo, y
conviene que se note.

---

## 2. El modal de admitir

| | |
|---|---|
| **ANTES** | **SAMC-902-2026** pasa a evaluación y entra a competir por el cupo de la semana. No gasta consecutivo: el número se asigna al comprometerse con horas de trabajo, no al mirar. |
| **DESPUÉS** | **SAMC-902-2026** pasa a evaluación y entra a competir por el cupo de la semana. Todavía no toma número: el consecutivo se asigna cuando empieces a armarla. |

El resto del modal —el bloque ámbar de la manifestación, las tres ayudas de los
campos, el aviso de orden— queda igual. Lo escribí con estas reglas puestas.

---

## 3. El modal de descartar

| | ANTES | DESPUÉS |
|---|---|---|
| entrada del selector | El **léxico** lo trajo y no nos sirve… | **Lo trajo el radar y no nos sirve…** |
| la pregunta | ¿El **léxico** se equivocó, o acertó y aun así no lo queremos? | **¿El radar se equivocó, o acertó y aun así no lo queremos?** |
| «se equivocó» | Esto no tiene nada que ver con lo que NEG hace. El **léxico** lo trajo por error. | Esto no tiene nada que ver con lo que NEG hace. **El radar lo trajo por error.** |
| «acertó» | El objeto sí habla del trabajo de NEG, pero este proceso no es para nosotros. | *(sin cambio)* |
| el porqué | La diferencia importa: es la única forma de saber **con número** si el **léxico** está trayendo basura, en vez de con la impresión de quien descarta. | La diferencia importa: es la única forma de saber **con números** si el radar está trayendo cosas que no sirven, en vez de con la impresión de quien descarta. |
| la nota del pie | Descartar es reversible: el proceso se puede reabrir en evaluación. Si ya tenía consecutivo, lo conserva — el número gastado no se devuelve. | *(sin cambio)* |

### Los motivos (`MOTIVO_DESCARTE_LABEL`)

Once de los doce vienen del registro de Karen y están en su idioma. **Uno no.**

| | ANTES | DESPUÉS |
|---|---|---|
| `RUIDO_LEXICO` | El **léxico** lo trajo por error | **No tiene que ver con lo que hacemos** |
| los otros once | Sorteo de consolidación · Limitación a MiPyme territorial · Experiencia no acreditable · Indicadores financieros · Presupuesto no rentable · Ubicación fuera de cobertura · Capacidad operativa · No es el trabajo de NEG · Cierra antes de poder armarlo · Ya estaba por otra vía · Otro | *(sin cambio)* |

---

## 4. El panel del rojo informado — la ficha

Es el bloque de tu ejemplo. Lo que lo rodea también hay que tocarlo.

| | ANTES | DESPUÉS |
|---|---|---|
| título | El **criterio v1.0** frena este proceso | **Este proceso está fuera del perfil donde NEG suele ganar** |
| motivo | Motivo: **Modalidad sin historial de NEG** — es menor cuantía. | **Es una menor cuantía, y NEG casi no ha ganado en esta modalidad.** |
| la regla | **Qué dice el criterio:** *(texto de `definicion`)* | **La regla, en corto:** *(texto de `resumen`)* |
| lo que falta | **Antes de decidir, lo que el criterio NO cubre:** *(texto de `limitaciones`)* | **Pero antes de descartarlo, algo que conviene saber:** *(texto de `antes_de_descartar`)* |
| si no se puede leer | No se pudo leer el **registro del criterio** (**v1.0**). El rojo se sostiene, pero sin sus límites a la vista. | **No se pudo cargar la explicación de esta marca.** Sigue en rojo, pero sin el contexto que suele acompañarla. |
| el botón | Trabajar de todos modos | *(sin cambio)* |

---

## 5. El modal de «trabajar de todos modos»

| | ANTES | DESPUÉS |
|---|---|---|
| encabezado | El **criterio v1.0** marca este proceso en rojo por ser **menor cuantía**. | **Este proceso está en rojo por ser menor cuantía.** |
| el bloque ámbar | Lo que el **criterio** NO midió: | **Lo que no sabemos:** |
| la pregunta | ¿Por qué vale la pena esta? | *(sin cambio)* |
| el ejemplo | Ej.: pocas manifestaciones, entidad conocida, el pliego no pide experiencia que no tengamos | *(sin cambio)* |

---

## 6. Los motivos del semáforo (`MOTIVO_SEMAFORO_LABEL`)

Son chips: tienen que decirse solos.

| | ANTES | DESPUÉS |
|---|---|---|
| `MODALIDAD_SIN_HISTORIAL` | Modalidad sin historial de NEG | **NEG casi no ha ganado en esta modalidad** |
| `SORTEO` | El proceso tiene sorteo de consolidación | **Hay sorteo: presentarse no garantiza que te evalúen** |
| `LIMITACION_MIPYME` | Limitación a MiPyme de otro territorio | **Reservado a MiPymes de otra región** |
| `REQUIERE_LECTURA` | Requiere lectura del pliego | **Hay que leer el pliego para saber** |

---

## 7. Los mensajes de bloqueo al presentar

**Estos NO se tocan.** Son hechos en el idioma del trabajo, y los dejo acá como
referencia de a dónde tiene que llegar el resto.

| | |
|---|---|
| El checklist del pliego está vacío — no hay nada verificado | *(sin cambio)* |
| 3 requisitos sin verificar | *(sin cambio)* |
| 1 requisito que no cumple | *(sin cambio)* |
| Presentar sigue bloqueado: *(motivo)*. | *(sin cambio)* |
| Checklist completo — presentar ya no está bloqueado por requisitos. | *(sin cambio)* |

---

## 8. El modal de presentar

| | ANTES | DESPUÉS |
|---|---|---|
| ayuda de «Ofertas recibidas» | El nivel de competencia real: el dato que falta para medir una **v1.1 del criterio**. | **Cuántas empresas se presentaron de verdad. Es el dato que falta para saber si lo que pesa es la competencia y no la modalidad.** |
| ayuda de «Manifestaciones» | Con esto se calcula la probabilidad de quedar en el sorteo. | *(sin cambio)* |

---

## 9. Registrar un proceso a mano

| | ANTES | DESPUÉS |
|---|---|---|
| ayuda de MiPyme | Cuenta para la **limitación MiPyme del criterio**. | **Sirve para saber si el proceso queda reservado a MiPymes de otra región.** |
| nota del semáforo | El semáforo lo calcula el **criterio**, no se elige. Un rojo no impide registrar | **El semáforo se calcula solo; no se elige.** Un rojo no impide registrar |

---

## 10. El documento de onboarding

`docs/onboarding-licitaciones.md`, 244 líneas (más las 40 que agregué ayer en
§6-bis). **Va al final**, cuando el producto ya diga lo que el documento va a
describir — reescribirlo antes sería describir dos veces.

Lo que ya sé que hay que tocar:

| dónde | qué pasa |
|---|---|
| §2 «El semáforo» | repite la definición técnica; pasa a citar `resumen` |
| §3 «El rojo se discute, no se obedece» | el título está bien; el cuerpo habla de «el criterio» |
| §5 «Los tres datos que se piden al presentar» | arrastra la v1.1 |
| §6 «Lo que el módulo todavía NO hace» | está bien, y hay que agregarle lo del cronograma |
| §6-bis | escrita ayer con estas reglas |
| §7 «Si algo se ve raro» | está bien |

---

## Lo que NO cambia, y por qué

- **Los once motivos de descarte** que vienen del registro de Karen. Son sus
  palabras: reescribirlos sería traducir del español al español.
- **Los mensajes de bloqueo al presentar.** Ya están bien.
- **«Cupo de la semana», «sorteo», «pliego», «manifestación de interés».** Son
  del oficio, no del sistema. La regla 2 es contra el vocabulario de la
  máquina, no contra el vocabulario técnico de licitaciones.

## Dónde vive cada cambio

| | archivos | cómo se aplica |
|---|---|---|
| §0 | `configuracion/semaforo_versiones` | **acto de datos** con dry-run |
| §1 | `Licitaciones.tsx`, `licitacion.ts` | PR de texto |
| §2–§3 | `ModalAdmitir.tsx`, `ModalDescartar.tsx`, `licitacion.ts` | PR de texto |
| §4–§5 | `LicitacionDetalle.tsx`, `ModalOverride.tsx` | PR de texto |
| §6 | `licitacion.ts` | PR de texto |
| §8–§9 | `ModalPresentar.tsx`, `LicitacionNueva.tsx` | PR de texto |
| §10 | `docs/onboarding-licitaciones.md` | PR aparte, al final |

El acto de datos de §0 va **primero**: es lo que más se lee y lo único que no
se arregla con un deploy.
