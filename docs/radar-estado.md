# Radar SECOP — dónde quedamos

Estado operativo del radar de licitaciones: qué está implementado, qué falta, y
en qué orden. Se escribe acá y no en un mensaje porque **lo que no está en el
repositorio, no existe**.

**Última actualización:** 11-nov-2026, con B.3 ya en producción.

---

## 1. En una línea

El radar **está desplegado y verificado en producción, y todavía no escribe**.
Ya no le falta código: le faltan **dos actos**, y los dos los hace Giovanny en
una sola sesión — desplegar el codebase `radar` y escribir la marca.

B.3 —la pieza del panel que tenía que estar **antes** de que el radar
escribiera, o hacía daño— **ya está en producción** (bundle
`index-DotD3BdE.js`, verificado el 11-nov).

**El guion completo de esa sesión, paso a paso y con lo que debe responder cada
comando, está en §3-bis.** Es el documento para seguir de corrido.

---

## 2. Las puertas, todas

Ocho cerradas y verificadas contra producción; seis abiertas, de las cuales dos
son código que ya está en `main` y solo espera el deploy.

### Cerradas ✅

| # | qué | cómo se verificó |
|---|---|---|
| 1 | El disparo | dos jobs `ENABLED`: `firebase-schedule-lic-ingerirRadarSecop{Manana,Tarde}-us-central1`, `30 6 * * 1-5` y `0 14 * * 1-5`, `America/Bogota` |
| 2 | La invocación | `run.invoker` con `radar-secop@` sobre los dos servicios de Cloud Run. **Lo escribió el CLI solo**, acotado al servicio, derivándolo de la cuenta que declara el código |
| 3 | La escritura en Firestore | `radar-secop@` con **una sola fila** a nivel de proyecto: `roles/datastore.user` |
| 4 | El app token | `SECOP_APP_TOKEN` presente en las funciones desplegadas |
| 5 | La consulta y la paginación | cosecha completa contra la API real: 1.911 de 1.911 filas, `faltan: 0` |
| 6 | La lectura desde el panel | `useLicitaciones` hace `getDocs` de la colección entera, sin query ni índice; **4 usuarios activos** tienen un rol de `gestionaLicitaciones()` |
| 7 | El léxico | `configuracion/vocabulario_neg` **no existe**, y es correcto: `terminosVigentes(null)` cae al empaquetado en el código (v1.0, 48 términos) y lo reporta como `(empaquetada)` |
| 8 | **B.3 — la bandeja recibe al radar** | PR #254 mergeado (`789d5a5`); bundle `index-DotD3BdE.js` en producción con los cuatro marcadores. Sin esto, `seccionDe` mandaba toda `detectada` a `activas` |

### Abiertas ⬜

| # | qué | estado |
|---|---|---|
| 9 | **Separar las dos poblaciones** (`incluir_sin_fecha: false`) | en `main`, **`40a98e2`** (PR #252) — *necesita deploy* |
| 10 | **La guarda de ventana aguas arriba** | en `main`, **`a0b24a1`** (PR #251) — *necesita deploy* |
| 11 | **Deploy del codebase `radar`** con #251 + #252 | **acto de Giovanny** — §3-bis, paso 3 |
| 12 | **Acto de la marca** — `{ marca, solape_dias: 14 }` | **acto de Giovanny** — §3-bis, paso 4. Se hace a mano en la consola — §3-bis, paso 4 |
| 13 | **Restitución del solape** — la escalera `4 → 14 → 24 → 34 → 45` | el primer escalón va junto al acto de texto — §3-ter |
| 14 | **Barrido del backlog** de las filas sin fecha | diseño pendiente; ver §6 |

---

## 3. El orden, y por qué ese orden

```
  B.3  ✅ en producción desde el 11-nov
     ↓
  GIOVANNY, EN UNA SOLA SESIÓN  (el guion es §3-bis):
      deploy del codebase radar  (#251 + #252)
         ↓
      acto de la marca  { marca: hoy, solape_dias: 14 }
     ↓
  (primera cosecha: 111 documentos)
     ↓
  acto de restitución  { solape_dias: 45 }
```

**Los dos actos de Giovanny van en una sentada, y la razón no es técnica.**
Lleva cuatro actos de IAM, un despliegue, dos sesiones y la llave del token en
un solo día; el deploy y la marca juntos le ahorran volver mañana. El orden
interno no cambia: primero desplegar, después marcar.

**Por qué B.3 va primero.** Sin él, `seccionDe` manda cualquier `detectada` a
`activas`. Si el radar escribe antes de que B.3 esté en Vercel,
los 111 documentos **entran a competir por el cupo semanal de 5** y desplazan
licitaciones reales de Karen. **Escribir antes de B.3 es peor que no escribir.**

**La red de seguridad**, que se mantiene escrita porque es la que permite mover
el orden sin miedo: aunque el deploy del radar saliera antes que B.3, no pasa
nada mientras no se corra el acto de la marca — **sin marca, la guarda de
ventana detiene la corrida sin consultar la API**. El radar no puede hacer daño
por su cuenta.

---

## 3-bis. El guion de la sesión de Giovanny, paso a paso

Está escrito para leerse de corrido, sin saber programar, y sin tener que
preguntarle nada a nadie. **Cada paso dice el comando y qué tiene que
responder.** Si algo responde distinto a lo que dice acá, hay que parar — no
seguir al siguiente paso.

Son dos actos en una sola sentada: **desplegar** y **marcar**. En ese orden.

**La marca se escribe a mano en la consola de Firebase**, no con un script: así
no hay que crear ninguna llave de escritura. Lo que el script haría —revisar
que quedó bien— se hace después, en el paso 6, con la llave de solo lectura.

> **La red de seguridad, para leer tranquilo:** mientras no se corra el paso 4,
> el radar no puede escribir nada aunque esté desplegado. Sin marca, la guarda
> de ventana detiene la corrida antes de pedirle nada a la API. Equivocarse de
> orden no rompe nada; saltarse el paso 4 solo deja al radar quieto.

---

### Paso 1 · Actualizar el clon de despliegue

Los despliegues salen de un **clon propio**, no del directorio donde se
trabaja. Abrir PowerShell en ese clon y:

```bash
git checkout main; git pull --ff-only
```

**Qué debe responder:** o bien `Already up to date.`, o una lista de archivos
actualizados terminada sin errores. Tiene que quedar en `main`.

Si dice `error: Your local changes would be overwritten` o algo sobre
`divergent branches`, **parar**: ese clon tiene cambios que no deberían estar
ahí, y el script del paso 3 lo va a rechazar igual.

---

### Paso 2 · Iniciar sesión con tu cuenta

```bash
npx firebase login
```

**Qué debe responder:** abre el navegador, pedís tu cuenta de NEG, y la
terminal termina con `✔  Success! Logged in as <tu correo>`.

> **Por qué con tu cuenta y no con una llave:** el despliegue queda firmado por
> una persona. La cuenta compartida no queda con sesión abierta en ningún
> equipo. La llave de escritura del paso 4 es otra cosa y sirve para otra cosa.

---

### Paso 3 · Desplegar el radar

Primero en seco, para ver qué va a pasar sin que pase:

```bash
.\scripts\deploy-funciones.ps1 -Codebase radar -Simulacro
```

**Qué debe responder:** llega hasta la comparación y **se detiene solo**, sin
desplegar. En la lista tiene que aparecer que hay **dos funciones** del
codebase `radar` —`ingerirRadarSecopManana` e `ingerirRadarSecopTarde`— y que
las dos son **actualización**, no nuevas, y ninguna "en prod y NO declarada".

> Si dice que alguna está **en prod y NO declarada**, el script aborta y hace
> bien: ese deploy la borraría. Parar y avisar.

Si el simulacro salió limpio, el de verdad:

```bash
.\scripts\deploy-funciones.ps1 -Codebase radar
```

**Qué pregunta, en este orden:**

1. `PR(s) que se despliegan` → escribir **`251, 252`**
   (son los dos cambios que trae este deploy: la guarda de ventana aguas
   arriba, y la separación de las dos poblaciones)
2. `Escribe DESPLEGAR para continuar` → escribir **`DESPLEGAR`** en mayúsculas.
   Cualquier otra cosa cancela, y cancelar no rompe nada.

**Qué debe responder al final:** la post-verificación dice que las dos
funciones quedaron **`ACTIVE`**, y el script escribe y empuja solo una línea en
`docs/bitacora-deploys-funciones.md`. Si no llega a decir `ACTIVE` las dos,
parar ahí: **no sigas al paso 4 con un deploy a medias.**

---

### Paso 4 · El acto de la marca, en la consola de Firebase

Este es el que enciende el radar. **Se hace a mano en la consola, no con un
script.**

> **Por qué a mano.** Un script tendría que correr con la llave de ESCRITURA de
> datos: habría que crearla, descargarla, colocarla, usarla y acordarse de
> borrarla. El modelo de tres llaves nació justamente porque apareció una llave
> olvidada desde julio, y crear una llave descargable para escribir **dos
> campos** reintroduce ese riesgo exacto. El rastro no se pierde: queda el
> antes (paso 4.a) y el después (paso 6), los dos con la llave de **lectura**,
> que ya existe y no escribe nada.

---

#### 4.a — Dejar escrito el ANTES

Antes de tocar nada, correr esto. No escribe: solo lee y deja constancia de cómo
estaba el documento.

```bash
node scripts/sigp/verifica-marca-radar.mjs --llave <ruta de la llave de LECTURA>
```

**Qué debe responder, la primera vez:**

```
  ✗ EL DOCUMENTO NO EXISTE. El acto de la marca no se hizo, o se guardó en
    otra ruta. Tiene que ser exactamente configuracion/radar_secop.
```

**Eso es lo correcto en este punto.** Que diga que no existe es la foto del
antes. Copiar esa salida al reporte.

> Si en cambio ya muestra una `marca`, **parar**: alguien ya hizo el acto, y
> hacerlo de nuevo movería la ventana sin querer.

---

#### 4.b — Escribir los dos campos

**Dónde:** [consola de Firebase](https://console.firebase.google.com) →
proyecto **`neg-sst-app`** → menú izquierdo **Build / Compilación** →
**Firestore Database** → pestaña **Data / Datos**.

**La ruta exacta:**

| | |
|---|---|
| colección | **`configuracion`** |
| documento | **`radar_secop`** |

La colección `configuracion` **ya existe** (ahí viven `indicadores`, `horario`,
`licitaciones`). Hacer clic en ella; el documento `radar_secop` **no existe
todavía**, así que hay que crearlo con **`+ Agregar documento`** y escribir el
ID a mano: `radar_secop`, exactamente así, en minúsculas y con guion bajo.

**Los dos campos. El tipo importa tanto como el valor:**

| Campo | Tipo (en el desplegable) | Valor |
|---|---|---|
| `marca` | **string** | `2026-11-11` |
| `solape_dias` | **number** | `14` |

Tres advertencias sobre eso, en orden de importancia:

1. **`marca` es `string`, NO `timestamp`.** La consola ofrece `timestamp` y es
   la trampa natural, porque es una fecha. Si se guarda como `timestamp`, el
   radar **no se rompe**: la corrida se detiene sola y no escribe nada. El
   problema es que desde afuera eso es idéntico a que el acto nunca se hubiera
   hecho, y el motivo queda enterrado dentro del documento. Por eso existe el
   paso 6.
2. **El valor de `marca` va sin comillas** en el formulario de la consola — se
   escribe `2026-11-11` a secas. La consola lo guarda como cadena porque el
   tipo elegido es `string`.
3. **`solape_dias` es `number`, no `string`.** Escribí `14`, no `"14"`.

La fecha de `marca` es **el día en que se hace el acto**. Si la sesión cae otro
día, poné ese día. El `14` de `solape_dias` **no se cambia**: está medido — son
111 documentos en la primera cosecha, con 45 % de margen contra el tope de 200.
Con 4 días serían 5 documentos, que no prueban nada; con 45, serían 384, que se
pasa del tope y la corrida se detiene.

Guardar con **Guardar / Save**.

---

#### 4.c — Qué NO hay que tocar

- **Ningún otro documento de `configuracion`.** `indicadores`, `horario`,
  `licitaciones` y `vocabulario_neg` son de otros módulos.
- **Ningún otro campo dentro de `radar_secop`.** Hoy el documento nace con
  esos dos y nada más. A partir de la primera corrida, la función le agrega
  sola `ultima_corrida`, `corridas` y `acumulado`: **son suyos**. Si en un acto
  futuro hay que volver a tocar la marca, se edita **solo** el campo `marca` —
  borrar `acumulado` no rompe el radar, pero le borra la memoria de todo lo que
  vio.
- **`autorizado_manual` no se crea.** Es la escotilla para un barrido del
  histórico y no se usa en este acto. Si aparece, es de otra cosa.
- **Nada en `licitaciones`.** Los procesos los escribe la función, no una
  persona.

---

### Paso 5 · Cerrar la sesión

No hay llave de escritura que retirar — ese era el punto de hacerlo en la
consola. Queda cerrar la sesión de despliegue:

```bash
npx firebase logout
```

**Qué debe responder:** `✔  Logged out from <tu correo>`.

> La llave de **lectura** es otra cosa y se queda: no escribe nada y es la que
> usan los censos. La de **escritura de datos** no se creó, y ese es justamente
> el resultado que se buscaba.

---

### Paso 6 · Verificar que la marca quedó bien

**Este paso no es opcional.** Es lo que convierte "le di a Guardar" en "el acto
ocurrió". Es el mismo comando del paso 4.a:

```bash
node scripts/sigp/verifica-marca-radar.mjs --llave <ruta de la llave de LECTURA>
```

**Qué debe responder:**

```
  marca         "2026-11-11"
    tipo        cadena
  solape_dias   14
    tipo        número entero

  La próxima corrida mirará 15 días hacia atrás (tope de la guarda: 120).

  ✓ LA MARCA ESTÁ BIEN ESCRITA: los dos campos, con el tipo correcto,
    y la ventana que abren cabe en la guarda.
```

Mirar **las dos líneas de `tipo`**: tienen que decir `cadena` y `número entero`.
Es lo único que no se ve a simple vista en la consola.

**Si responde con una `✗`**, el mensaje dice exactamente qué está mal y qué
corregir — se vuelve al paso 4.b, se arregla ese campo, y se corre de nuevo.
Los casos que detecta, todos probados:

| lo que pasó | lo que dice |
|---|---|
| el documento no existe | el acto no se hizo, o se guardó en otra ruta |
| `marca` quedó como Timestamp | hay que corregir el campo a cadena |
| `solape_dias` quedó como texto | hay que corregirlo a número |
| la fecha quedó con los números cambiados (p. ej. `2026-01-11`) | la ventana sería de 319 días contra un tope de 120: la corrida se detendría sola |

---

### Paso 7 · Que la corrida siguiente escribió los 111

Después de la hora que dice la sección de abajo: panel →
**Licitaciones** → pestaña **Radar**.

**Qué tiene que haber:** alrededor de **111 procesos**, cada uno con su chip de
por qué entró. El número exacto puede moverse un poco: la medición es del
11-nov y el SECOP sigue publicando.

Si se quiere el dato duro en vez de la pantalla, el mismo verificador del paso 6
vuelve a servir: después de la primera corrida, la línea `Otros campos en el
documento` tiene que incluir **`ultima_corrida`, `corridas` y `acumulado`** —
los escribe la función, así que si están, la función corrió.

**Si la pestaña Radar sigue vacía**, la corrida se detuvo. El motivo queda
escrito en `configuracion/radar_secop`, dentro de `ultima_corrida`, en
palabras. No hay que adivinar: está ahí.

---

### A qué hora se dispara la primera corrida útil

El radar corre **dos veces por día hábil, hora de Bogotá**:

| | |
|---|---|
| mañana | **06:30**, lunes a viernes |
| tarde | **14:00**, lunes a viernes |

La primera corrida útil es **la primera de esas dos que caiga después de
terminado el paso 4**. No hay que disparar nada: ya están programadas.

- Si el acto termina **antes de las 14:00 de un día hábil** → mirar a partir de
  las **14:15 de ese mismo día**.
- Si termina **después de las 14:00** → la siguiente es a las **06:30 del
  próximo día hábil**; mirar a partir de las **06:45**.
- Si termina **un viernes después de las 14:00** → la siguiente es el **lunes a
  las 06:30**.

Los quince minutos de margen son para que la función termine de escribir: la
cosecha completa son 1.911 filas y no es instantánea.

---

## 3-ter. El acto combinado — una sola sentada, dos cosas

Son dos cambios distintos que tocan dos documentos distintos de la misma
colección. **Se hacen juntos** porque son una sola sentada.

**Pero no se hacen igual**: el del criterio va con un script — su texto tiene
que salir de la fuente única del repositorio — y el del solape va a mano en la
consola, porque es un número.

**La consola:** [console.firebase.google.com](https://console.firebase.google.com)
→ proyecto **`neg-sst-app`** → **Firestore Database** → pestaña **Data**.

---

### Antes de empezar: la foto del antes

```bash
node scripts/sigp/verifica-marca-radar.mjs --llave <ruta de la llave de LECTURA>
```

**Qué debe responder:** `marca` con una fecha, `solape_dias` **4**, y
`✓ LA MARCA ESTÁ BIEN ESCRITA`. Copiá esa salida al reporte: es el antes.

---

### Parte 1 de 2 · el criterio — **con un script, no en la consola**

El texto que Karen lee cuando un proceso sale en rojo o en amarillo. Hoy está
escrito para quien calibró la regla, no para quien decide si la trabaja.

> ⚠ **CORREGIDO el 13-nov.** Esta parte decía «agregar dos campos a mano en la
> consola». **No es así.** El registro del criterio tiene una fuente única en
> `src/types/sigp/semaforoVersiones.ts`, un JSON derivado y un test que los
> mantiene sincronizados carácter por carácter. Editar a mano habría
> funcionado *y* habría dejado el repositorio mintiendo.

```bash
GOOGLE_APPLICATION_CREDENTIALS=<llave de LECTURA> node functions/scripts/adoptar-semaforo-v1.1.js
```

**Qué debe responder:** el plan completo — `ANTES version_actual v1.0`,
`DESPUÉS version_actual v1.1`, y los seis textos de v1.1 — y terminar con
`DRY-RUN: no se escribió nada.` **Leer los seis textos**: es la última
oportunidad de ver qué va a decir el panel.

Si el plan es el esperado:

```bash
GOOGLE_APPLICATION_CREDENTIALS=<llave de ESCRITURA> AUTOR_UID=<tu uid> node functions/scripts/adoptar-semaforo-v1.1.js --apply
```

**Qué debe responder:** `✓ ADOPCIÓN COMPLETA Y VERIFICADA.` El script relee lo
que escribió antes de decirlo.

**Qué NO hace, y conviene saberlo:** no toca `licitaciones`. Los 396 documentos
guardados conservan su `semaforo` y su `semaforo_version` — cambiar el criterio
y recalcular los documentos son **dos actos distintos** (invariante 5). El
segundo tiene su propio script y su propia decisión.

> **Esta parte SÍ necesita la llave de ESCRITURA de datos**, entregada para el
> acto y retirada al terminar. No es como la marca: ahí eran dos campos en un
> documento y la consola alcanzaba. Acá el texto tiene que salir de la fuente
> única.

---

### Parte 2 de 2 · el solape — esta sí en la consola

El primer escalón del solape: de **4 a 14**.

| campo | tipo | valor ANTES | valor DESPUÉS |
|---|---|---|---|
| `solape_dias` | **number** | 4 | **14** |

**Se edita ESE campo y nada más.** `marca` no se toca — la mueve la función en
cada corrida. `ultima_corrida`, `corridas` y `acumulado` tampoco: son suyos.

> **Por qué 14 y no 45 de una vez.** Medido con la lógica real: saltar directo
> a 45 crearía **396 documentos** contra un tope de 200 por corrida — la
> corrida se detiene y no escribe nada. La escalera aprobada es
> **4 → 14 → 24 → 34 → 45**, cuatro escalones, ninguno por encima de 115
> documentos nuevos. Cada escalón necesita una corrida en medio para que lo
> cubierto quede guardado.

---

### Después: verificar

```bash
node scripts/sigp/verifica-marca-radar.mjs --llave <ruta de la llave de LECTURA>
```

**Qué debe responder:** `solape_dias **14**`, tipo `número entero`, y
`✓ LA MARCA ESTÁ BIEN ESCRITA`.

Si dice `cadena` en vez de `número entero`, el campo se guardó con el tipo
equivocado: hay que volver y corregirlo.

**Lo de `semaforo_versiones` no lo revisa ese script** — se verifica abriendo el
panel: entrá a una licitación marcada en rojo y mirá el bloque de explicación.
Tiene que leerse como el texto nuevo, no como el viejo.

> Si la menor cuantía sigue saliendo en **rojo**, hay dos razones posibles y
> conviene distinguirlas: o el panel todavía no tiene el deploy de v1.1 —el
> dato quedó bien escrito igual—, o ese documento conserva su `semaforo`
> guardado de v1.0, que es lo esperado hasta que se corra el recálculo. Las dos
> se resuelven solas; ninguna significa que el acto haya fallado.

---

### A qué hora se nota

El cambio del solape lo usa **la corrida siguiente** — 06:30 o 14:00, hora de
Bogotá, de lunes a viernes. El del texto se ve **al instante** en el panel, sin
esperar nada.

---

## 4. Las mediciones que sostienen las decisiones

Todas contra la API real del SECOP, filtro del modo `radar`, 11-nov-2026.

### El tamaño de la ventana

| ventana | filas |
|---|---|
| **sin inicio** (`desde: null`) | **319.531** |
| 45 días | 7.245 |
| 120 días (tope de la guarda) | 15.833 |
| 365 días | 47.104 |

De ahí sale la guarda de ventana aguas arriba (#251): 319.531 filas en páginas
de 50.000 contra una función de 512 MiB mueren por memoria **antes** de llegar a
una guarda que vivía aguas abajo.

### El pozo de las filas sin fecha

`whereIngesta` tiene `incluir_sin_fecha = true` por defecto, así que las filas
sin ninguna fecha entran por `IS NULL` **en toda ventana**. Son un conjunto
**fijo**:

| solape | filas totales | sin ninguna fecha | % sobre persistidos | `puede_escribir` |
|---|---|---|---|---|
| 4 | 1.911 | **1.818** | 96,2 % | false |
| 14 | 3.323 | **1.818** | 53,0 % | false |
| 21 | 4.256 | **1.818** | 42,1 % | false |
| 45 | 7.245 | **1.818** | 24,6 % | false |

`MAX_PCT_SIN_FECHA` es 10 %. Un conjunto constante contra uno variable **no
puede** bajar de ahí: harían falta ≥1.250 persistibles, seis veces el tope de
200. El guard medía algo que no podía variar.

### Con las dos poblaciones separadas (#252)

| solape | filas | documentos | `puede_escribir` | tope 200 |
|---|---|---|---|---|
| 4 | 93 | 5 | true | pasa |
| **14** ← aprobado | 1.505 | **111** | true | pasa, 45 % de margen |
| 21 | 2.438 | 172 | true | pasa, 14 % |
| 45 | 5.427 | 384 | true | se pasa |

**Solape 14 para la primera cosecha**: 111 documentos ejercitan el circuito de
verdad (5 no prueban nada) y el margen protege contra que los datos se muevan
entre la medición y la corrida.

**Y `solape_dias` vuelve a 45 después**, porque no es solo la primera ventana:
es el solape permanente, y su valor de diseño es 45 porque el dataset completa
los registros semanas después de publicarlos. Dejar 14 fijo debilitaría eso en
silencio.

---

## 5. Los topes, y cuál aplica

| constante | valor | cuándo aplica |
|---|---|---|
| `MAX_CREADOS_POR_CORRIDA` | 200 | **siempre que haya marca** — o sea, la primera cosecha real |
| `MAX_CREADOS_PRIMERA_CORRIDA` | 50 | **nunca**: ver la nota de la sexta ocurrencia en `HALLAZGOS_AUDITORIA.md` |
| `MAX_DIAS_VENTANA` | 120 | la marca no puede ser anterior a hoy − 75 días |

`primera_corrida` es `true` solo sin marca, y sin marca `desde` es `null`, y con
`desde: null` la guarda de ventana detiene antes del tope. La única salida es
`autorizado_manual`, que retorna sin mirar el tope. **El 50 es letra muerta.**

---

## 6. El backlog de las filas sin fecha — decisión pendiente

Con #252, las filas sin ninguna fecha dejan de entrar por la corrida automática.
No se pierden: entran por un **barrido autorizado** aparte, con el mismo
tratamiento que los demás actos de datos — dry-run, autorización explícita,
pre y post-verificación.

Se reconocen en el documento por **`radar.origen_fecha === 'ninguna'`** (#252
subió ese campo de `MetaIngesta` al bloque `radar`, para que la marca viaje con
la procedencia y los chips de señal de B.3 la muestren).

**Lo que falta decidir cuando llegue su turno**: hoy `autorizado_manual` saltea
el tope por completo, así que "autorizado" significa "sin tope". La propuesta es
que respete uno — y ahí el 50 deja de ser letra muerta y el backlog entra en
pasadas acotadas en vez de un volcado.

---

## 6-bis. El contrafactual de calibración se REVISA, no se escribe una vez

`evaluarRetroactivo` contesta una pregunta incomodísima y la contesta sola: **si
este criterio hubiera estado vigente, ¿cuántas adjudicaciones reales habría
matado?** Si la respuesta no es cero, el criterio no se aprueba. Está construido
desde el 1.3 y tiene su test.

**Y durante ocho meses nadie volvió a correrlo.**

v1.0 marcaba en rojo toda menor cuantía. Las tres adjudicaciones más grandes de
la historia de NEG fueron menores cuantías. El contrafactual decía que no desde
el primer día — y lo decía en un test que pasaba en verde, porque el test
comprobaba que la guarda *funcionaba*, no que su veredicto *fuera favorable*.

> **La regla que sale de esto:** ante cualquier cambio de criterio del
> semáforo, el contrafactual se vuelve a correr contra los datos del momento
> y su veredicto se escribe en `calibracion` de la versión nueva. No alcanza
> con que el test pase: hay que **leer el número**.
>
> Lo mismo para el otro lado del trueque, que v1.1 dejó escrito: cuántas
> propuestas sin retorno deja pasar. v1.0 bloqueaba 12; v1.1 no bloquea
> ninguna. Ese número también hay que mirarlo, no solo calcularlo.

**El compromiso medible de v1.1, con su fecha:** si en seis semanas Karen
trabajó menores cuantías y las perdió todas, el trueque salió mal y se vuelve a
mirar. Los contadores existen — `modalidad` + `estado` dan presentadas y
ganadas, `ofertas_recibidas` da la competencia de cada una, y
`evaluarRetroactivo` vuelve a correr sobre los datos nuevos. Eso es justamente
lo que v1.0 no tenía: no era peor, era **irrevisable**.

---

## 7. Lo que vive en otros documentos

- **El acto de IAM completo** (los seis roles, con el porqué medido de cada uno)
  y la cuenta de servicio dedicada → `docs/radar-cuenta-de-servicio.md`.
- **Los defectos encontrados y sus lecciones** → `HALLAZGOS_AUDITORIA.md`:
  H-010 (escritores no tipados contra el documento) y las tres notas de técnica
  — leer un campo agregado después, `ConvertFrom-Json` + StrictMode, y «existe»
  no significa «se ejecuta».
- **El límite de la guarda del deploy** (qué cubre y qué no, y por qué el CLI
  declara seis permisos y usa cuatro familias más) → `scripts/deploy-funciones.ps1`.
- **La prueba de los chequeos de IAM** sin desplegar → `scripts/pruebas/prueba-chequeos-iam.ps1`.
- **El criterio del semáforo**, su historial de versiones y el script de
  adopción → `src/types/sigp/semaforoVersiones.ts` y
  `functions/scripts/adoptar-semaforo-v1.1.js`. El texto que Karen lee sale
  de ahí, no de la consola.
- **El inventario del texto de usuario**, con el antes y el después de cada
  pantalla → `docs/inventario-lenguaje-licitaciones.md`.
- **La verificación de la marca**, de SOLO LECTURA →
  `scripts/sigp/verifica-marca-radar.mjs`. La marca se escribe a mano en la
  consola para no crear una llave de escritura; este script revisa después que
  quedó bien —**el tipo de cada campo, no solo el valor**— con la llave de
  lectura. No importa nada del árbol a propósito (lo corre una persona, no un
  pipeline); los dos literales que repite, y el hecho de que jamás escriba,
  quedan fijados por `src/utils/sigp/__tests__/verificaMarca.test.ts`.
