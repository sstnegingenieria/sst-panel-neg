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
| identidad | **la tuya**, Giovanny | la **cuenta propietaria** del proyecto |
| por qué | un deploy lo firma una persona; el script **aborta** con llave de servicio o cuenta compartida | los actos escriben en `licitaciones`, y eso lo autoriza el dueño del proyecto |
| cierre | `firebase logout` | `gcloud auth application-default revoke` |

**Nunca las dos abiertas a la vez.** El paso 1 se cierra antes de abrir el 2.

Y una tercera cosa que **no** se usa: si tenés `GOOGLE_APPLICATION_CREDENTIALS`
apuntando a un archivo de llave, los actos **abortan**. Esa variable *gana*
sobre las credenciales por defecto, así que el acto correría con otra
identidad sin avisar. Limpiala antes:

```bash
unset GOOGLE_APPLICATION_CREDENTIALS
```

---

## ANTES DE EMPEZAR

Necesitás tu **UID** (no tu correo): es lo que queda firmado en cada documento
que los actos tocan. Está en Firebase Console → Authentication → tu fila,
columna «User UID». Guardalo a mano; lo vas a escribir cuatro veces.

```bash
cd "C:\apps\APLICACION SST"
git checkout main
git pull
```

---

# PASO 1 · DESPLEGAR EL RADAR

El código del radar en `main` tiene **once PRs** que nunca se desplegaron:
`#257 #258 #259 #260 #263 #267 #269 #270 #271 #276 #278`. Entre ellos, dos que
importan para esta sentada:

- **#271** — el léxico v1.1. Hasta que esto suba, la corrida de mañana sigue
  trayendo con el léxico viejo, y el acto 1b limpiaría una cola que el radar
  volvería a ensuciar al día siguiente.
- **#278** — la modalidad `Contratación régimen especial (con ofertas)`. El
  aviso de cobertura del mismo PR **no** necesita esto: sale solo por Vercel.
  La modalidad sí.

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

### Cómo sabés que funcionó

El script lo dice, pero la prueba real es la corrida de mañana a las 06:30: en
el log de la función tiene que aparecer la modalidad nueva entre las
consultadas. No hace falta esperarla para seguir con el paso 2.

---

# PASO 2 · LOS CUATRO ACTOS DE DATOS

```bash
gcloud auth application-default login
```

> Con la **cuenta propietaria**. El navegador va a abrir; elegí esa cuenta, no
> la tuya.

### El orden, y por qué es ese

```
   1a  →  1b  →  3b  →  1c
```

- **1a va primero** porque escribe `portafolio`, y **3b agrupa por
  portafolio**. Hoy ninguno de los 129 documentos lo tiene: si corrés 3b
  antes, no encuentra nada y te lo dice (no sale con un plan vacío que parezca
  «no había duplicados»).
- **1b antes de 3b** porque retirar primero la basura reduce lo que 3b tiene
  que mirar, y porque un duplicado de algo que no califica no vale fusionarlo.
- **1c va al final** a propósito: es el que más cambia lo que Karen ve. Las
  menores cuantías pasan de rojo a amarillo, y las que compiten por un cupo
  semanal pasan de 56 a ~111. Eso no es un efecto colateral — **es** el acto. Y
  conviene que ocurra sobre una cola ya limpia.

### Cada acto se corre DOS veces

Primero sin nada (**dry-run**: lee, imprime el plan, no escribe). Lo leés. Si
es lo esperado, lo corrés con `--apply`.

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

- `quedan con PORTAFOLIO` — es lo que 3b va a poder agrupar. Si sale 0, parate
  y avisame: sin eso el 3b no tiene nada que hacer.
- `LA GUARDA OPERÓ en N documentos` — los que **ya tenían** valor y el acto
  **no toca**. Medido el 14-nov esto debería ser **0**, porque los 129 tienen
  los tres sub-campos ausentes. Si sale distinto de 0, el dato cambió desde que
  lo medí: avisame antes de aplicar.

Este acto escribe en `radar`, que es un **campo protegido** — el radar no lo
toca nunca después del nacimiento, porque es la *procedencia*. Lo que lo
autoriza es una distinción: *completar lo que el origen no capturó no es
reescribir el juicio del nacimiento*. Y la guarda lo **hace cumplir**: escribe
únicamente donde el sub-campo está **ausente**. Si tiene valor, no se toca,
aunque el origen diga otra cosa.

```bash
AUTOR_UID=<tu uid> node functions-radar/acto.mjs 1a-fase-portafolio --apply
```

---

## 1b · retirar lo que el léxico v1.1 ya no reconoce

```bash
node functions-radar/acto.mjs 1b-ruido-lexico
```

**Qué mirar:**

- `se retiran` — medido el 14-nov: **18**. El plan imprime el objeto de cada
  uno, en una línea. Leelos: son 18 renglones y es la última vez que alguien
  los va a ver.
- `LA GUARDA OPERÓ en N` — documentos donde **una persona ya trabajó** y que
  por eso **no se tocan**. Medido: **0**. El léxico se equivocó al traerlos;
  retirarlos borraría el trabajo de alguien para tapar nuestro error.

El motivo que queda escrito es `RUIDO_LEXICO`, que significa exactamente esto:
un defecto del **instrumento**. `FUERA_DE_ALCANCE` diría que el léxico acertó y
que no lo queríamos — y haría que la métrica mienta sobre el léxico.

```bash
AUTOR_UID=<tu uid> node functions-radar/acto.mjs 1b-ruido-lexico --apply
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
  decide un script. Si aparece alguno, decidilo vos y avisame.

Se queda el de la **fase más avanzada** — y es la *misma* regla que el radar
aplica a las filas nuevas. Si este acto se quedara con otro, la corrida de
mañana volvería a crear el que descartaste.

Con una excepción, y es la correcta: **si alguien admitió uno de los
duplicados, ese se queda**, aunque el otro tenga la fase más avanzada. Es el
que Karen abrió.

```bash
AUTOR_UID=<tu uid> node functions-radar/acto.mjs 3b-duplicados --apply
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

Si dice que **`v1.1` ya existe y aborta**, perfecto: ya estaba hecho, seguí.
Si imprime un plan, aplicalo:

```bash
AUTOR_UID=<tu uid> node functions/scripts/adoptar-semaforo-v1.1.js --apply
```

Ahora sí:

```bash
node functions-radar/acto.mjs 1c-semaforo
```

**Qué mirar:**

- `dejan de ser ROJO` — **el número que importa**. Es el volumen de decisión
  que se le suma a Karen de un día para otro. Medido: las menores cuantías
  pasan a amarillo, y las que compiten por cupo van de 56 a ~111.
- `pasan a ROJO` — **nadie debería**. Si sale distinto de 0, parate y avisame.
- `SIN con que juzgarse` — documentos a los que les falta modalidad, semáforo o
  versión. **No se recalculan** y se listan por id. Un documento que no se
  recalcula se ve; uno que se recalcula mal, no.
- `RECHAZADOS por el constructor del patch` — si aparece alguno, es la
  invariante 5 funcionando, no un estorbo. Mandame la lista.
- `Cómo cambia el color` — la tabla de `antes → después` con su cuenta.

```bash
AUTOR_UID=<tu uid> node functions-radar/acto.mjs 1c-semaforo --apply
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

1. **No lo corras de nuevo a ciegas.** Corré el **dry-run** otra vez: te va a
   decir qué queda por hacer. Los cuatro actos son **idempotentes** — 1a solo
   llena huecos, 1b y 3b solo tocan lo que está en `detectada`, 1c solo escribe
   donde el resultado cambia.
2. Mandame la salida completa. El acto imprime el motivo, y los motivos están
   escritos para leerse, no para buscarse en el código.
3. Si abortó **después** de escribir (en la relectura), el mensaje dice
   exactamente qué documentos no coinciden. Eso no se arregla corriendo otra
   vez: avisame.

## QUÉ QUEDA PARA DESPUÉS, Y NO ES DE ESTA SENTADA

- La corrida de mañana 06:30 es la primera con el léxico v1.1 **en el radar**.
  Vale mirar cuántas trae.
- El aviso de cobertura (*«la cola llega hasta el …»*) aparece en cuanto Vercel
  despliegue `main`. No necesita nada de esto.
- Los **129 documentos** que quedan después de 1b y 3b son la cola real. Lo que
  Karen vea el lunes ya es con el semáforo nuevo.
