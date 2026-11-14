/**
 * Lo que comparten los cuatro actos sobre producción.
 *
 * Cada acto es cáscara: lee, llama a su planificador puro de
 * `src/utils/sigp/actosRadar.ts`, imprime el plan, y solo con `--apply`
 * escribe y vuelve a leer. Acá vive lo que sería idéntico cuatro veces.
 *
 * ── EL PROYECTO VA EXPLÍCITO ────────────────────────────────────────────────
 *
 * `initializeApp()` sin argumentos saca el proyecto de la credencial SOLO si
 * es una llave de cuenta de servicio. Con las credenciales por defecto de un
 * usuario —que es como corren estos actos— la credencial es un
 * `RefreshTokenCredential` y ese paso no dispara: el acto moriría con «Unable
 * to detect a Project Id» a mitad de camino, y ese mensaje no dice que lo que
 * falta es una variable de entorno. Declararlo cierra además el accidente
 * inverso: un `GOOGLE_CLOUD_PROJECT` olvidado apuntando a otro lado.
 */
import * as admin from 'firebase-admin'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import type { Firestore, WriteBatch } from 'firebase-admin/firestore'

export const PROYECTO = 'neg-sst-app'
export const COLECCION = 'licitaciones'

/** El límite de Firestore es 500; se deja margen. */
const LOTE = 400

export const APLICAR = process.argv.includes('--apply')

export function abortar(mensaje: string): never {
  console.error(`\n  ✗ ${mensaje}\n`)
  process.exit(1)
}

export interface Arranque {
  db: Firestore
  autor: string
  ahora: Timestamp
}

/**
 * Prepara el acto. Exige `AUTOR_UID` cuando va a escribir: un acto sin autor
 * es una escritura que nadie firmó.
 */
export function arranque(titulo: string): Arranque {
  const autor = process.env.AUTOR_UID ?? ''
  if (APLICAR && autor.trim() === '') {
    abortar('falta AUTOR_UID: todo acto tiene autor.')
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && APLICAR) {
    abortar('GOOGLE_APPLICATION_CREDENTIALS está definida y GANA sobre las '
      + 'credenciales por defecto: el acto correría con otra identidad sin '
      + 'avisar. Limpiala antes de aplicar.')
  }
  if (!admin.apps.length) admin.initializeApp({ projectId: PROYECTO })

  console.log('')
  console.log(`  ${titulo}`)
  console.log('  ' + '─'.repeat(68))
  console.log(`  proyecto    ${PROYECTO}`)
  console.log(`  modo        ${APLICAR ? '*** APPLY (escribe) ***' : 'dry-run (no escribe nada)'}`)
  if (APLICAR) console.log(`  autor       ${autor}`)
  console.log('')

  return { db: getFirestore(), autor: autor || '(dry-run)', ahora: Timestamp.now() }
}

/** Cierre del dry-run: dice el comando exacto que falta. */
export function cierreDryRun(acto: string): void {
  console.log('  ' + '─'.repeat(68))
  console.log('  DRY-RUN: no se escribió nada.')
  console.log('  Si lo de arriba es lo esperado:')
  console.log('')
  console.log(`    AUTOR_UID=<tu uid> node functions-radar/acto.mjs ${acto} --apply`)
  console.log('')
}

/** Escribe los patches en lotes. Devuelve cuántos documentos tocó. */
export async function escribirLotes(
  db: Firestore,
  patches: readonly { id: string; patch: Record<string, unknown> }[],
): Promise<number> {
  let escritos = 0
  for (let i = 0; i < patches.length; i += LOTE) {
    const grupo = patches.slice(i, i + LOTE)
    const lote: WriteBatch = db.batch()
    for (const p of grupo) {
      lote.update(db.collection(COLECCION).doc(p.id), p.patch)
    }
    await lote.commit()
    escritos += grupo.length
  }
  return escritos
}

/**
 * Post-verificación: relee y comprueba. No se declara hecho lo que no se
 * volvió a leer — y la comprobación recorre los documentos de a uno en vez de
 * confiar en que `commit()` sin excepción significa «quedó como yo quería».
 */
export async function verificarReleyendo(
  db: Firestore,
  ids: readonly string[],
  cumple: (doc: Record<string, unknown>, id: string) => boolean,
): Promise<{ ok: number; fallan: string[] }> {
  const fallan: string[] = []
  let ok = 0
  for (let i = 0; i < ids.length; i += 200) {
    const grupo = ids.slice(i, i + 200)
    const snaps = await db.getAll(...grupo.map(id => db.collection(COLECCION).doc(id)))
    for (const s of snaps) {
      if (!s.exists) { fallan.push(`${s.id} (no existe)`); continue }
      if (cumple(s.data() as Record<string, unknown>, s.id)) ok++
      else fallan.push(s.id)
    }
  }
  return { ok, fallan }
}

/** Cierre del apply: el veredicto, y aborta si la relectura no coincide. */
export function cierreApply(escritos: number, ver: { ok: number; fallan: string[] }): void {
  console.log('  ' + '─'.repeat(68))
  console.log(`  ESCRITOS        ${escritos}`)
  console.log(`  VERIFICADOS     ${ver.ok} (releyendo uno por uno)`)
  if (ver.fallan.length > 0) {
    console.log(`  NO COINCIDEN    ${ver.fallan.length}`)
    for (const f of ver.fallan.slice(0, 20)) console.log(`      ${f}`)
    abortar('la relectura NO coincide. NO declares el acto hecho.')
  }
  console.log('')
  console.log('  ✓ ACTO COMPLETO Y VERIFICADO.')
  console.log('')
}

/** Trae todos los documentos de la colección, con su id. */
export async function traerTodos(
  db: Firestore,
): Promise<{ id: string; [k: string]: unknown }[]> {
  const snap = await db.collection(COLECCION).get()
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
}

/**
 * El bloque `radar` de un documento crudo, con solo lo que los planificadores
 * leen y comprobando cada cosa.
 *
 * ── POR QUE NO UN CAST ──────────────────────────────────────────────────────
 *
 * Firestore devuelve `unknown`: afirmar `as ProcedenciaRadar` seria creer sin
 * mirar. Y un cast en el borde de una escritura a produccion es exactamente
 * donde no se quiere tener uno, porque el dia que el documento no tenga la
 * forma supuesta el cast no dice nada y el acto escribe mal.
 */
export function radarCrudo(d: Record<string, unknown>): {
  portafolio: string | null
  fases_previas: string[]
} | null {
  const r = d.radar
  if (r === null || r === undefined || typeof r !== 'object') return null
  const o = r as Record<string, unknown>
  const pf = o.portafolio
  const prev = o.fases_previas
  return {
    portafolio: typeof pf === 'string' && pf !== '' ? pf : null,
    fases_previas: Array.isArray(prev) ? prev.filter(x => typeof x === 'string') : [],
  }
}

/** El texto de un campo crudo, o `null`. Nada de `as string`. */
export const textoCrudo = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v : null

/** Los del radar: los que tienen el bloque `radar`. Las migradas no lo tienen. */
export const esDelRadarDoc = (d: Record<string, unknown>): boolean =>
  d.migrado !== true && d.radar !== null && d.radar !== undefined
