# functions-radar — codebase `radar`

Cloud Functions del **radar de licitaciones** (SECOP II). Es un codebase
APARTE del de siempre (`functions/`, codebase `default`) a propósito.

## Para los otros frentes: su codebase no cambió

`firebase deploy --only functions:default` despliega las 12 funciones de
`functions/` **exactamente como antes**: sin build, sin paso nuevo, sin tocar
nada de esta carpeta. El `predeploy` del build vive dentro de la entrada
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
