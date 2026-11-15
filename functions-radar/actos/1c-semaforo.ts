/**
 * ACTO 1c · Recalcular el semáforo con el criterio vigente.
 *
 * VA AL FINAL de la sentada a propósito: es el que más cambia lo que Karen ve.
 * Las menores cuantías pasan de rojo a amarillo, y con eso las que compiten por
 * un cupo semanal pasan de 56 a ~111. Ese no es un efecto colateral del acto:
 * ES el acto. Con la cola ya limpia —1b y 3b hechos— el salto ocurre sobre lo
 * que de verdad vale mirar.
 *
 * No calcula el criterio ni arma el patch: le pide el primero a
 * `calcularSemaforo` y el segundo a `patchRecalcularSemaforo`, que es el DUEÑO
 * del bloque del semáforo y el que hace cumplir la invariante 5 — mover
 * `semaforo_version` exige un cambio declarado con motivo.
 *
 * REQUIERE que el registro de criterios ya conozca la versión
 * (`adoptar-semaforo-v1.1.js`). Si los documentos apuntaran a una versión que
 * el registro no tiene, la pantalla no podría explicar por qué algo está
 * amarillo — y un color sin explicación es peor que un color viejo. El acto lo
 * verifica y aborta.
 *
 * ── USO ─────────────────────────────────────────────────────────────────────
 *   node functions-radar/acto.mjs 1c-semaforo
 *   AUTOR_UID=<uid> node functions-radar/acto.mjs 1c-semaforo --apply
 *
 * Con `MOTIVO="…"` se cambia el motivo que queda escrito en cada documento.
 */
import {
  planRecalcularSemaforo, VERSION_A_ESCRIBIR, type DocParaSemaforo,
} from '../../src/utils/sigp/actosRadar'
import {
  MODALIDADES_LICITACION, MOTIVOS_SEMAFORO, SEMAFOROS,
} from '../../src/types/sigp/licitacion'
import type {
  ModalidadLicitacion, MotivoSemaforo, Semaforo,
} from '../../src/types/sigp/licitacion'
import {
  APLICAR, arranque, abortar, cierreDryRun, cierreApply,
  escribirLotes, verificarReleyendo, traerTodos, esDelRadarDoc, textoCrudo,
} from './_comun'

const ACTO = '1c-semaforo'
const RUTA_CRITERIOS = 'configuracion/semaforo_versiones'
const MOTIVO_DEFECTO = 'adopción del criterio v1.1: la menor cuantía deja de '
  + 'cortar en rojo y pasa a lista corta de verificación'

export async function main(): Promise<void> {
  const { db, ahora } = arranque('ACTO 1c · RECALCULAR EL SEMÁFORO')
  const motivo = process.env.MOTIVO?.trim() || MOTIVO_DEFECTO
  console.log(`  versión a escribir  ${VERSION_A_ESCRIBIR}`)
  console.log(`  motivo              ${motivo}`)
  console.log('')

  const reg = await db.doc(RUTA_CRITERIOS).get()
  if (!reg.exists) abortar(`${RUTA_CRITERIOS} NO EXISTE: sembrálo antes.`)
  const versiones = (reg.data()?.versiones ?? {}) as Record<string, unknown>
  if (!versiones[VERSION_A_ESCRIBIR]) {
    abortar(`el registro de criterios no conoce ${VERSION_A_ESCRIBIR}. `
      + 'Corré primero functions/scripts/adoptar-semaforo-v1.1.js, o los '
      + 'documentos apuntarían a un criterio que la pantalla no puede mostrar.')
  }
  console.log(`  el registro conoce  ${Object.keys(versiones).join(', ')}`)
  console.log('')

  const delRadar = (await traerTodos(db)).filter(esDelRadarDoc)

  // ── EL MAPEO VA EXPLICITO, Y COMPROBADO CONTRA LA LISTA ──────────────────
  //
  // Firestore devuelve `unknown`. La version anterior pasaba el documento
  // crudo con `as never`, y eso tenia un costo concreto: una `modalidad` que
  // no esta en `MODALIDADES_LICITACION` —un dedazo, un valor viejo— habria
  // llegado al motor del semaforo, que no la reconoceria y le daria el color
  // por omision. El acto entonces ESCRIBE un color decidido por un dato que
  // nadie valido, y la pantalla lo muestra como si fuera un juicio.
  //
  // Asi que se comprueba contra la lista de verdad, y lo que no pasa se
  // SEPARA y se nombra. Un documento que no se recalcula se ve; uno que se
  // recalcula mal, no.
  const esModalidad = (v: string): v is ModalidadLicitacion =>
    (MODALIDADES_LICITACION as readonly string[]).includes(v)
  const esSemaforo = (v: string): v is Semaforo =>
    (SEMAFOROS as readonly string[]).includes(v)
  const esMotivo = (v: unknown): v is MotivoSemaforo =>
    typeof v === 'string' && (MOTIVOS_SEMAFORO as readonly string[]).includes(v)

  const aptos: DocParaSemaforo[] = []
  const sinJuzgar: { id: string; por: string }[] = []
  for (const d of delRadar) {
    const modalidad = textoCrudo(d.modalidad)
    const semaforo = textoCrudo(d.semaforo)
    const version = textoCrudo(d.semaforo_version)
    if (modalidad === null || !esModalidad(modalidad)) {
      sinJuzgar.push({ id: d.id, por: `modalidad ${JSON.stringify(d.modalidad)}` })
      continue
    }
    if (semaforo === null || !esSemaforo(semaforo)) {
      sinJuzgar.push({ id: d.id, por: `semaforo ${JSON.stringify(d.semaforo)}` })
      continue
    }
    if (version === null) {
      sinJuzgar.push({ id: d.id, por: 'sin semaforo_version' })
      continue
    }
    const ent = d.entidad
    const cro = d.cronograma
    aptos.push({
      id: d.id,
      modalidad,
      entidad: ent !== null && typeof ent === 'object'
        ? { departamento: textoCrudo((ent as Record<string, unknown>).departamento) }
        : null,
      cronograma: cro !== null && typeof cro === 'object'
        ? { sorteo: (cro as Record<string, unknown>).sorteo }
        : null,
      semaforo,
      semaforo_version: version,
      semaforo_motivos: Array.isArray(d.semaforo_motivos)
        ? d.semaforo_motivos.filter(esMotivo)
        : [],
    })
  }
  console.log(`  aptos para recalcular             ${aptos.length}`)
  if (sinJuzgar.length > 0) {
    console.log(`  SIN con que juzgarse              ${sinJuzgar.length}  <- NO se recalculan`)
    for (const x of sinJuzgar.slice(0, 10)) console.log(`      ${x.id}  ${x.por}`)
    console.log('')
  }

  const plan = planRecalcularSemaforo(aptos, motivo, ahora)

  console.log('  PLAN')
  console.log(`    se recalculan                 ${plan.patches.length}`)
  console.log(`    ya estaban al día             ${plan.sin_cambio}`)
  console.log('')
  console.log(`    dejan de ser ROJO             ${plan.dejan_de_ser_rojo}   <- el volumen que se suma a Karen`)
  console.log(`    pasan a ROJO                  ${plan.pasan_a_rojo}`)
  console.log('')
  if (plan.rechazados.length > 0) {
    console.log(`  RECHAZADOS por el constructor del patch: ${plan.rechazados.length}`)
    console.log('  (es la invariante 5 funcionando, no un estorbo)')
    for (const r of plan.rechazados.slice(0, 10)) console.log(`      ${r.id}  ${r.por}`)
    console.log('')
  }
  if (plan.con_dato_que_el_adaptador_ignora.length > 0) {
    console.log(`  OJO — ${plan.con_dato_que_el_adaptador_ignora.length} documentos traen un dato que el adaptador IGNORA:`)
    for (const x of plan.con_dato_que_el_adaptador_ignora.slice(0, 10)) {
      console.log(`      ${x.id}  (${x.campos.join(', ')})`)
    }
    console.log('  No cambian el cálculo. Se nombran para que no pasen en silencio.')
    console.log('')
  }

  const cuenta = new Map<string, number>()
  for (const p of plan.patches) {
    const k = `${p.antes.semaforo} -> ${p.despues.semaforo}`
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
  }
  console.log('  Cómo cambia el color:')
  for (const [k, n] of [...cuenta].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${String(n).padStart(4)}  ${k}`)
  }
  console.log('')

  if (!APLICAR) return cierreDryRun(ACTO)
  if (plan.patches.length === 0) {
    console.log('  Nada que escribir.\n')
    return
  }

  const escritos = await escribirLotes(db, plan.patches)
  const esperado = new Map(plan.patches.map(p => [p.id, p.despues]))
  const ver = await verificarReleyendo(db, [...esperado.keys()], (doc, id) => {
    const q = esperado.get(id)!
    return doc.semaforo === q.semaforo && doc.semaforo_version === q.version
  })
  cierreApply(escritos, ver)
}
