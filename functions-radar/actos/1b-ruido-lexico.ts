/**
 * ACTO 1b · Retirar de la cola lo que el léxico v1.1 ya no reconoce.
 *
 * El criterio NO vive acá: se importa `coincideVocabulario` del repo, el mismo
 * que corre en la clasificación. Una copia del léxico en un script sería una
 * segunda implementación del criterio, y el acto podría retirar cosas que la
 * clasificación sí reconoce.
 *
 * Motivo `RUIDO_LEXICO`, que significa exactamente esto: un defecto del
 * INSTRUMENTO. `FUERA_DE_ALCANCE` diría que el léxico acertó y no lo
 * queríamos, y haría que la métrica mienta sobre el léxico.
 *
 * NO toca donde una persona ya trabajó: el léxico se equivocó al traerlo, y
 * retirarlo borraría el trabajo de alguien para tapar nuestro error.
 *
 * ── USO ─────────────────────────────────────────────────────────────────────
 *   node functions-radar/acto.mjs 1b-ruido-lexico
 *   AUTOR_UID=<uid> node functions-radar/acto.mjs 1b-ruido-lexico --apply
 */
import { planRetirarPorLexico } from '../../src/utils/sigp/actosRadar'
import {
  coincideVocabulario, VOCABULARIO_NEG_VERSION,
} from '../../src/types/sigp/vocabularioNeg'
import {
  APLICAR, arranque, cierreDryRun, cierreApply,
  escribirLotes, verificarReleyendo, traerTodos, esDelRadarDoc,
  radarCrudo, textoCrudo,
} from './_comun'

const ACTO = '1b-ruido-lexico'

export async function main(): Promise<void> {
  const { db, autor, ahora } = arranque('ACTO 1b · RETIRAR LO QUE EL LÉXICO YA NO RECONOCE')
  console.log(`  léxico      ${VOCABULARIO_NEG_VERSION} (el del repo, no una copia)`)
  console.log('')

  const delRadar = (await traerTodos(db)).filter(esDelRadarDoc)
  console.log(`  documentos del radar            ${delRadar.length}`)

  const plan = planRetirarPorLexico(
    delRadar.map(d => ({
      id: d.id,
      objeto: textoCrudo(d.objeto),
      estado: textoCrudo(d.estado),
      // Va para que el SELLO DEL TRIAGE opere: descartar una fila del radar
      // que esta en `detectada` ES el triage de esa fila.
      radar: radarCrudo(d),
      override_manual: d.override_manual,
      oferta_neg: d.oferta_neg,
      manifestaciones: d.manifestaciones,
    })),
    objeto => coincideVocabulario(objeto).coincide,
    'RUIDO_LEXICO',
    autor,
    ahora,
  )

  console.log('')
  console.log('  PLAN')
  console.log(`    se retiran                    ${plan.patches.length}`)
  console.log(`    siguen calificando            ${plan.siguen}`)
  console.log(`    ya avanzaron de estado        ${plan.fuera_de_juego}`)
  console.log('')
  if (plan.intocables.length > 0) {
    console.log(`  LA GUARDA OPERÓ en ${plan.intocables.length}: hay trabajo de una persona, NO se tocan:`)
    for (const i of plan.intocables) console.log(`      ${i.id}  (${i.por.join(', ')})`)
    console.log('')
  }
  console.log('  Lo que se va a retirar:')
  for (const p of plan.patches) console.log(`      ${p.porque}`)
  console.log('')

  if (!APLICAR) return cierreDryRun(ACTO)
  if (plan.patches.length === 0) {
    console.log('  Nada que escribir.\n')
    return
  }

  const escritos = await escribirLotes(db, plan.patches)
  const ver = await verificarReleyendo(db, plan.patches.map(p => p.id), doc =>
    doc.estado === 'descartada'
    && doc.motivo_descarte === 'RUIDO_LEXICO'
    && doc.activa === false)
  cierreApply(escritos, ver)
}
