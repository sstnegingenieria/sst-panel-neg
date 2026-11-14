# La sentada: despliegue del radar + los cuatro actos de datos

*Un solo acto para Giovanny, no seis. Preparado el 14-nov-2026.*

Esto se corre **de una sentada, en este orden**, y toma entre 25 y 40 minutos.
El orden no es cómodo: es el único que funciona, y cada dependencia está
explicada donde aparece.

---

## LAS DOS APERTURAS DE CREDENCIAL, Y POR QUÉ SON DISTINTAS

Es lo único de este guion que hay que leer dos veces. Son **dos sesiones
distintas, de dos identidades distintas, por dos razones distintas**, y
confundirlas ya pasó una vez (el guardia del script de deploy lo atrapó).

| | PASO 1 · desplegar | PASO 2 · escribir datos |
|---|---|---|
| comando | `firebase login` | `gcloud auth application-default login` |
| identidad | **la suya**, Giovanny | la **cuenta propietaria** del proyecto |
| por qué | un deploy lo firma una persona; el script **aborta** con llave de servicio o cuenta compartida | los actos escriben en `licitaciones`, y eso lo autoriza el dueño del proyecto |
| cierre | `firebase logout` | `gcloud auth application-default revoke` |

**Nunca las dos abiertas a la vez.** El paso 1 se cierra antes de abrir el 2.

Y una tercera cosa que **no** se usa: si tiene `GOOGLE_APPLICATION_CREDENTIALS`
apuntando a un archivo de llave, los actos **abortan**. Esa variable *gana*
sobre las credenciales por defecto, así que el acto correría con otra
identidad sin avisar. Límpiela antes:

```bash
unset GOOGLE_APPLICATION_CREDENTIALS
```

---

## ANTES DE EMPEZAR

Necesita su **UID** (no el correo): es lo que queda firmado en cada documento
que los actos tocan. Está en Firebase Console → Authentication → su fila,
columna «User UID». Guárdelo a mano; lo va a escribir cuatro veces.

```bash
cd "C:\apps\APLICACION SST\sst-panel-web"
git rev-parse --abbrev-ref HEAD   # tiene que decir: main
git pull --ff-only
```

---

# PASO 0 · MERGEAR EL `#279` (sin esto el paso 2 no existe)

Los cuatro actos **viven en el `#279`**, no en `main`. El runner
(`functions-radar/acto.mjs`) y los cuatro actos se incorporan cuando ese PR se
mergea; antes de eso, `node functions-radar/acto.mjs …` responde que no
encuentra el archivo.

Se mergea desde GitHub (una persona mira y aprueba; ninguna sesión lo hace
sola) y después se actualiza el repositorio local, que es el mismo comando de
«ANTES DE EMPEZAR». Verificación de que quedó:

```bash
git log --oneline -1 && ls functions-radar/acto.mjs functions-radar/actos
```

Tiene que listar `acto.mjs` y los cuatro archivos `1a- 1b- 1c- 3b-`. Si no
están, el merge no entró y el paso 2 no se puede correr.

---

# PASO 1 · DESPLEGAR EL RADAR

> **Corregido el 14-nov respecto de la primera versión de este guion.** Decía
> que había once PRs sin desplegar, incluido el léxico v1.1. **No es cierto:**
> la bitácora de funciones registra el deploy del radar del
> **14-nov 05:16 UTC, commit `b155e0c`, PRs `#271 #276`**, hecho por Giovanny —
> y ese commit contiene a `#271`, así que contiene también todo lo anterior
> (`#257 #258 #259 #260 #263 #267 #269 #270`). El léxico v1.1 **ya está vivo en
> el radar**; la corrida de hoy ya corrió con él. Lo que queda sin desplegar es
> **un** PR de código del radar:

- **#278** — la modalidad `Contratación régimen especial (con ofertas)`. Es la
  única razón de este paso. El aviso de cobertura del mismo PR **no** necesita
  esto: sale solo por Vercel.
- Y, si el paso 0 ya se hizo, también sube el `#279`. Sus cambios a `src/` son
  **de tipos solamente** (genéricos para que el `Timestamp` del Admin SDK y el
  del SDK cliente convivan): no cambian el comportamiento desplegado. El único
  cambio de conducta que este deploy lleva es el de `#278`.

Consecuencia de la corrección, y es buena: **el acto 1b ya no limpia una cola
que el radar vuelva a ensuciar mañana.** Ese era el argumento para desplegar
antes de los actos y ya no aplica. Lo que sigue mandando el orden es la
credencial: el paso 1 se cierra antes de abrir la del paso 2.

```bash
firebase login
```

```bash
powershell -File scripts/deploy-funciones.ps1 -Codebase radar
```

El script pide el PR y una palabra de confirmación, verifica antes y después, y
él mismo commitea la fila de la bitácora. Si algo falla, **aborta sin
desplegar** — no hay estado a medias que limpiar.

```bash
firebase logout
```

### Cómo saber que funcionó

El script lo dice, pero la prueba real es la corrida de mañana a las 06:30: en
el log de la función tiene que aparecer la modalidad nueva entre las
consultadas. No hace falta esperarla para seguir con el paso 2.

---

# PASO 2 · LOS CUATRO ACTOS DE DATOS

```bash
gcloud auth application-default login
```

> Con la **cuenta propietaria**. El navegador va a abrir; elegí esa cuenta, no
> la suya.

### El orden, y por qué es ese

```
   1a  →  1b  →  3b  →  1c
```

- **1a va primero** porque escribe `portafolio`, y **3b agrupa por
  portafolio**. Hoy ninguno de los 129 documentos lo tiene: si corre 3b
  antes, no encuentra nada y lo dice (no sale con un plan vacío que parezca
  «no había duplicados»).
- **1b antes de 3b** porque retirar primero la basura reduce lo que 3b tiene
  que mirar, y porque un duplicado de algo que no califica no vale fusionarlo.
- **1c va al final** a propósito: es el que más cambia lo que Karen ve. Las
  menores cuantías pasan de rojo a amarillo, y las que compiten por un cupo
  semanal pasan de 56 a ~111. Eso no es un efecto colateral — **es** el acto. Y
  conviene que ocurra sobre una cola ya limpia.

### Cada acto se corre DOS veces

Primero sin nada (**dry-run**: lee, imprime el plan, no escribe). Se lee. Si
es lo esperado, se corre con `--apply`.

El dry-run **no es una aproximación** del apply: es el mismo código, el mismo
plan, las mismas guardas. Lo único que cambia es si escribe.

Cada apply **relee los documentos uno por uno** al terminar y aborta si no
coinciden. Nada se declara hecho sin releerse.

---

## 1a · completar `fase`, `fases_previas` y `portafolio`

```bash
node functions-radar/acto.mjs 1a-fase-portafolio
```

**Qué mirar en el plan:**

- `quedan con PORTAFOLIO` — es lo que 3b va a poder agrupar. Si sale 0, pare
  y avíseme: sin eso el 3b no tiene nada que hacer.
- `LA GUARDA OPERÓ en N documentos` — los que **ya tenían** valor y el acto
  **no toca**. Medido el 14-nov esto debería ser **0**, porque los 129 tienen
  los tres sub-campos ausentes. Si sale distinto de 0, el dato cambió desde que
  lo medí: avíseme antes de aplicar.

Este acto escribe en `radar`, que es un **campo protegido** — el radar no lo
toca nunca después del nacimiento, porque es la *procedencia*. Lo que lo
autoriza es una distinción: *completar lo que el origen no capturó no es
reescribir el juicio del nacimiento*. Y la guarda lo **hace cumplir**: escribe
únicamente donde el sub-campo está **ausente**. Si tiene valor, no se toca,
aunque el origen diga otra cosa.

```bash
AUTOR_UID=<SU-UID> node functions-radar/acto.mjs 1a-fase-portafolio --apply
```

---

## 1b · retirar lo que el léxico v1.1 ya no reconoce

```bash
node functions-radar/acto.mjs 1b-ruido-lexico
```

**Qué mirar:**

- `se retiran` — medido el 14-nov: **18**. El plan imprime el objeto de cada
  uno, en una línea. Léalos: son 18 renglones y es la última vez que alguien
  los va a ver.
- `LA GUARDA OPERÓ en N` — documentos donde **una persona ya trabajó** y que
  por eso **no se tocan**. Medido: **0**. El léxico se equivocó al traerlos;
  retirarlos borraría el trabajo de alguien para tapar nuestro error.

El motivo que queda escrito es `RUIDO_LEXICO`, que significa exactamente esto:
un defecto del **instrumento**. `FUERA_DE_ALCANCE` diría que el léxico acertó y
que no lo queríamos — y haría que la métrica mienta sobre el léxico.

```bash
AUTOR_UID=<SU-UID> node functions-radar/acto.mjs 1b-ruido-lexico --apply
```

---

## 3b · fusionar los duplicados que ya están escritos

```bash
node functions-radar/acto.mjs 3b-duplicados
```

**Qué mirar:**

- `grupos duplicados` — medido el 14-nov: **16** documentos en grupos. El plan
  imprime, grupo por grupo, **cuál se queda y cuál sale**.
- `LA GUARDA OPERÓ en N grupos` — grupos donde hay trabajo humano en **más de
  uno**. Ahí el acto **se abstiene** y los lista: cuál trabajo vale más no lo
  decide un script. Si aparece alguno, decídalo usted y avíseme.

Se queda el de la **fase más avanzada** — y es la *misma* regla que el radar
aplica a las filas nuevas. Si este acto se quedara con otro, la corrida de
mañana volvería a crear el que descartó.

Con una excepción, y es la correcta: **si alguien admitió uno de los
duplicados, ese se queda**, aunque el otro tenga la fase más avanzada. Es el
que Karen abrió.

```bash
AUTOR_UID=<SU-UID> node functions-radar/acto.mjs 3b-duplicados --apply
```

El apply verifica **dos cosas**, no una: que los que salen quedaron
descartados, y que **los que se quedan siguen en juego**. Un acto que
descartara el duplicado *y* el original pasaría la primera comprobación con
nota perfecta.

---

## 1c · recalcular el semáforo con el criterio v1.1

Este tiene un requisito propio: el **registro de criterios** tiene que conocer
`v1.1` antes. Si no, los documentos apuntarían a una versión que la pantalla no
puede explicar — y un color sin explicación es peor que un color viejo. El acto
lo verifica y aborta.

```bash
node functions/scripts/adoptar-semaforo-v1.1.js
```

Si dice que **`v1.1` ya existe y aborta**, perfecto: ya estaba hecho, siga.
Si imprime un plan, aplíquelo:

```bash
AUTOR_UID=<SU-UID> node functions/scripts/adoptar-semaforo-v1.1.js --apply
```

Ahora sí:

```bash
node functions-radar/acto.mjs 1c-semaforo
```

**Qué mirar:**

- `dejan de ser ROJO` — **el número que importa**. Es el volumen de decisión
  que se le suma a Karen de un día para otro. Medido: las menores cuantías
  pasan a amarillo, y las que compiten por cupo van de 56 a ~111.
- `pasan a ROJO` — **nadie debería**. Si sale distinto de 0, pare y avíseme.
- `SIN con que juzgarse` — documentos a los que les falta modalidad, semáforo o
  versión. **No se recalculan** y se listan por id. Un documento que no se
  recalcula se ve; uno que se recalcula mal, no.
- `RECHAZADOS por el constructor del patch` — si aparece alguno, es la
  invariante 5 funcionando, no un estorbo. Mándeme la lista.
- `Cómo cambia el color` — la tabla de `antes → después` con su cuenta.

```bash
AUTOR_UID=<SU-UID> node functions-radar/acto.mjs 1c-semaforo --apply
```

---

# CERRAR

```bash
gcloud auth application-default revoke
```

**Siempre**, aunque algo haya fallado a mitad de camino. Una credencial de
propietario abierta es la única cosa de este guion que empeora con el tiempo.

---

## SI ALGO SALE MAL

Ningún acto deja estado a medias: o escribe el lote completo y lo verifica, o
aborta. Si uno aborta:

1. **No lo corra de nuevo a ciegas.** Corra el **dry-run** otra vez: le va a
   decir qué queda por hacer. Los cuatro actos son **idempotentes** — 1a solo
   llena huecos, 1b y 3b solo tocan lo que está en `detectada`, 1c solo escribe
   donde el resultado cambia.
2. Mándeme la salida completa. El acto imprime el motivo, y los motivos están
   escritos para leerse, no para buscarse en el código.
3. Si abortó **después** de escribir (en la relectura), el mensaje dice
   exactamente qué documentos no coinciden. Eso no se arregla corriendo otra
   vez: avíseme.

## QUÉ QUEDA PARA DESPUÉS, Y NO ES DE ESTA SENTADA

- La primera corrida con el léxico v1.1 **en el radar** ya pasó: el deploy fue
  el 14-nov a las 00:16 de Bogotá, así que la corrida de las 06:30 de ese mismo
  día ya lo usó. Lo que sigue pendiente de ver es la primera corrida con la
  modalidad nueva de `#278`, después del paso 1.
- **Los números de este guion se midieron el 14-nov.** Entre esa medición y la
  sentada pueden haber corrido una o dos ingestas más (06:30 y 14:00, L–V), así
  que las cuentas pueden no coincidir exactamente. La autoridad es el
  **dry-run**, no este documento: si el plan no se parece a lo que está escrito
  acá, el plan tiene razón, y conviene avisar antes de aplicar.
- El aviso de cobertura (*«la cola llega hasta el …»*) aparece en cuanto Vercel
  despliegue `main`. No necesita nada de esto.
- Los **129 documentos** que quedan después de 1b y 3b son la cola real. Lo que
  Karen vea el lunes ya es con el semáforo nuevo.
