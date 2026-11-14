/**
 * El CORREDOR de los actos sobre producción.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 *
 * Los actos están escritos en TypeScript porque importan la lógica del repo:
 * el léxico, el motor del semáforo, `separarFasesDeReferencia`,
 * `completarSiFalta`, `patchRecalcularSemaforo`. Reescribir eso en CJS para un
 * script sería una SEGUNDA implementación del mismo criterio — el defecto que
 * el bundle del radar vino a eliminar, y el que hace que un acto de datos
 * escriba algo distinto de lo que los tests verificaron.
 *
 * Así que el acto se empaqueta con esbuild —el mismo que ya empaqueta la
 * función— y se corre. `vite-node` haría lo mismo sin build, pero no está
 * instalado: `npx` lo bajaría de la red, y un acto de producción a las siete
 * de la mañana no puede depender de una descarga.
 *
 * ── USO ─────────────────────────────────────────────────────────────────────
 *
 *   node functions-radar/acto.mjs <nombre>              (dry-run: no escribe)
 *   AUTOR_UID=<uid> node functions-radar/acto.mjs <nombre> --apply
 *
 * `<nombre>` es un archivo de `actos/` sin extensión. Sin nombre, los lista.
 *
 * Todo lo que venga después del nombre se le pasa al acto tal cual.
 */
import { build } from 'esbuild'
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const AQUI = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(AQUI, 'package.json'), 'utf8'))

const disponibles = () => readdirSync(join(AQUI, 'actos'))
  .filter(f => f.endsWith('.ts') && !f.startsWith('_'))
  .map(f => f.replace(/\.ts$/, ''))

const nombre = process.argv[2]
if (!nombre || nombre.startsWith('--')) {
  console.error('\n  Falta el nombre del acto. Disponibles:\n')
  for (const a of disponibles()) console.error(`    ${a}`)
  console.error('\n  node functions-radar/acto.mjs <nombre> [--apply]\n')
  process.exit(1)
}
if (!disponibles().includes(nombre)) {
  console.error(`\n  ✗ no existe el acto "${nombre}". Disponibles: ${disponibles().join(', ')}\n`)
  process.exit(1)
}

// El bundle va a un temporal: no deja artefactos que alguien pueda correr
// mañana creyendo que son el código de hoy.
const dir = mkdtempSync(join(tmpdir(), 'acto-'))
const salida = join(dir, 'acto.cjs')
try {
  await build({
    entryPoints: [join(AQUI, 'actos', `${nombre}.ts`)],
    outfile: salida,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    logLevel: 'warning',
    // `firebase-admin` se resuelve en tiempo de ejecución desde el
    // node_modules de esta carpeta, igual que en la función desplegada.
    external: Object.keys(pkg.dependencies),
    absWorkingDir: AQUI,
  })

  // El acto recibe sus propios argumentos, no los del corredor.
  process.argv = [process.argv[0], salida, ...process.argv.slice(3)]
  const require = createRequire(pathToFileURL(salida))
  const mod = require(salida)
  if (typeof mod.main === 'function') await mod.main()
} finally {
  rmSync(dir, { recursive: true, force: true })
}
