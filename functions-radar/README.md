# functions-radar — codebase `radar`

Cloud Functions del **radar de licitaciones** (SECOP II). Es un codebase
APARTE del de siempre (`functions/`, codebase `default`) a propósito.

## Para los otros frentes: su codebase no cambió

`firebase deploy --only functions:default` despliega las funciones de
`functions/` **exactamente como antes**: sin build, sin paso nuevo, sin tocar
nada de esta carpeta. (De paso, una corrección medida: ese codebase declara hoy
**16 exports**, no 12 — el número de 12 venía de los avisos anteriores y de la
documentación, no de contarlos.) El `predeploy` del build vive dentro de la entrada
`radar` de `firebase.json`, y el CLI resuelve los hooks por codebase.

Lo único que cambia para ustedes: `firebase deploy --only functions` (sin
nombre de codebase) ahora despliega **los dos**. Si no quieren tocar el radar,
usen `--only functions:default`.

## Por qué un codebase propio

El radar importa la lógica TypeScript del repo (`src/utils/sigp/secopMapeo.ts`,
`secopConsulta.ts`, `radarCorrida.ts`, `src/types/sigp/vocabularioNeg.ts`): el
léxico derivado de los datos, la clasificación híbrida, la guarda de volumen y
la re-escritura idempotente. Son ~1.500 líneas con tests.

`functions/` no compila TypeScript, y portar esa lógica a CJS serían **dos
nacimientos del mismo criterio** — exactamente lo que el bloque A.2b vino a
eliminar. Con este codebase hay UNA implementación: la del repo, la que corren
los tests.

## Para los otros frentes: NO instalen nada acá

**Medido el 09-nov-2026** en un worktree limpio (`functions/` instalado, como lo
tienen ustedes; `functions-radar/` sin `npm install` y sin build):

| escenario | emulador listo | funciones de ustedes |
|---|---|---|
| un solo codebase (lo de antes) | 18,2 s | 15 |
| **dos codebases, `functions-radar/` sin instalar** | **17,9 s** | 15 |
| dos codebases, `functions-radar/` instalado sin build | 20,3 s | 15 |
| dos codebases, instalado **y construido** | 26,2 s | 15 + 2 ignoradas |

El emulador **no** puede filtrar por codebase: carga todos los declarados
(verificado en `lib/emulator/controller.js`, que itera la config completa sin
filtro). Pero cuando este codebase no está instalado ni construido, **advierte
dos veces y sigue** — sus 15 triggers cargan igual y **no cuesta tiempo**.

Las dos líneas que van a ver, y que **no son un fallo**:

```
!   functions: Couldn't find firebase-functions package in your source code. Have you run 'npm install'?
!!  functions: Failed to load function definition from source: ... functions-radar\lib\index.js does not exist
```

Así que: **no corran `npm install` en `functions-radar/`** salvo que vengan a
trabajar en el radar. Instalarlo cuesta ~2 s por arranque y construirlo, ~8 s
más dos funciones programadas en su emulador. No instalarlo cuesta cero.

(Por eso tampoco se versiona el bundle: tenerlo en git haría que el codebase
cargue en el emulador de todos, que es el escenario de 26,2 s.)

## Cómo se trabaja

```
npm install          # una vez
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + bundle a lib/index.js
```

El build hace `tsc --noEmit` ANTES del bundle porque **esbuild no verifica
tipos**: sin ese paso, un error de tipos se desplegaría.

`lib/`, `node_modules/` y `.env*` están gitignoreados.

## Cuándo corre

**Dos veces al día, 06:30 y 14:00, lunes a viernes, hora de Bogotá.** Son dos
funciones (`ingerirRadarSecopManana` y `ingerirRadarSecopTarde`) sobre EL MISMO
handler: unix-cron no puede expresar dos horas con minutos distintos en una
sola expresión, y duplicar el cron habría sido duplicar el código.

La razón de la segunda pasada es la ventana de cierre: medimos que
`fecha_de_recepcion_de` cae entre 4 y 13 días después de la publicación, así
que en una mínima cuantía **un día de retraso es entre el 8 % y el 25 % del
tiempo para decidir y armar la propuesta**. Con una sola corrida a las 6:30, un
proceso publicado a las 8 de la mañana se vería al día siguiente.

El costo es despreciable: cada corrida son un `count(1)`, una o dos páginas de
la API y unas decenas de escrituras. La de la tarde suele crear poco, porque el
doc id es determinístico y el compare-before-write deja en cero lo que no
cambió.

## Configuración: ARRANCA SIN APP TOKEN

Decisión explícita: el radar **arranca sin token**. Dos corridas diarias son un
volumen mínimo y el riesgo de 429 por el pool compartido de IPs de Google es
bajo a esa frecuencia. Sin variable, el valor es `''`, no se manda la cabecera
y la petición sale anónima.

**Dónde se pone cuando esté** (no hay que tocar código):

```
# functions-radar/.env   ← gitignoreado, no se commitea
SECOP_APP_TOKEN=el-token-que-entregue-socrata
```

```bash
firebase deploy --only functions:radar
```

`defineString('SECOP_APP_TOKEN')` lo lee de ahí al desplegar. Para un token
distinto por proyecto: `functions-radar/.env.neg-sst-app`.

Va en la cabecera `X-App-Token`, **nunca** en el query string (Socrata también
acepta `$$app_token` en la URL, y las URLs quedan en logs). Con token inválido
la API responde 403 y la corrida falla a propósito — no hay reintento anónimo,
porque un token mal configurado tiene que doler.

## Qué escribe

- `licitaciones/{secop_…}` — los procesos clasificados `si` o `probable`.
  Doc id determinístico: re-leer actualiza, nunca duplica.
- `configuracion/radar_secop` — la marca de la última corrida, el registro de
  la última, un historial acotado y el acumulado. Patrón de
  `configuracion/censo_consecutivos`: lo escribe solo esta CF con Admin SDK y
  el panel lo lee por el match genérico de `configuracion`. **No requiere
  regla nueva.**
