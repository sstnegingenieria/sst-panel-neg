/**
 * Build del codebase `radar`.
 *
 * Empaqueta `src/index.ts` —y con él la lógica TypeScript compartida de
 * `../src/utils/sigp/` y `../src/types/sigp/`— en un único `lib/index.js` CJS.
 *
 * ── POR QUÉ UN BUNDLE Y NO UN PORT A CJS ────────────────────────────────────
 * La alternativa era copiar 1.500 líneas de criterio a JavaScript y sostener
 * un test de equivalencia entre las dos copias. Eso es «dos nacimientos» del
 * mismo criterio, que es justo lo que el bloque A.2b vino a eliminar: el
 * léxico, las clases y la cadena de fechas cambiaron tres veces en dos días, y
 * mantener dos copias de eso es el defecto esperándonos. Con el bundle hay UNA
 * implementación: la del repo, la que corren los tests.
 *
 * ── GARANTÍA PARA EL OTRO CODEBASE ──────────────────────────────────────────
 * Este build NO corre cuando se despliega `functions` (codebase `default`): el
 * `predeploy` vive DENTRO de la entrada `radar` de `firebase.json`, y el CLI
 * resuelve los hooks por codebase (verificado en
 * `lib/deploy/lifecycleHooks.js` de firebase-tools 15.22.4). `firebase deploy
 * --only functions:default` no toca nada de acá.
 *
 * El `typecheck` corre ANTES del bundle (ver el script `build`): esbuild NO
 * verifica tipos, así que sin ese paso un error de tipos se desplegaría.
 */
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  logLevel: 'info',
  // Las dependencias del runtime de Functions NO se empaquetan: las instala
  // Google desde el package.json desplegado.
  external: Object.keys(pkg.dependencies),
})

// Lo que se despliega es ESTA carpeta, cuyo `package.json` ya apunta a
// `lib/index.js` y declara las dependencias del runtime. No se genera un
// segundo package.json dentro de `lib/`: dos manifiestos para el mismo
// artefacto son dos cosas que pueden divergir.
console.log('listo: lib/index.js')
