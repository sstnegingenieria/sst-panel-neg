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

## Configuración

`SECOP_APP_TOKEN` por `.env` del codebase (no se commitea). Va en la cabecera
`X-App-Token`, nunca en el query string. Sin token funciona, pero comparte pool
por IP con 429; con token inválido la API responde 403 y la corrida falla a
propósito — no hay reintento anónimo.

## Qué escribe

- `licitaciones/{secop_…}` — los procesos clasificados `si` o `probable`.
  Doc id determinístico: re-leer actualiza, nunca duplica.
- `configuracion/radar_secop` — la marca de la última corrida, el registro de
  la última, un historial acotado y el acumulado. Patrón de
  `configuracion/censo_consecutivos`: lo escribe solo esta CF con Admin SDK y
  el panel lo lee por el match genérico de `configuracion`. **No requiere
  regla nueva.**
