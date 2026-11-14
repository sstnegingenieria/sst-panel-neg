/**
 * ACTO 3b · Los duplicados que ya están escritos.
 *
 * DEPENDE DEL 1a: agrupa por `radar.portafolio`, y hasta que 1a lo escriba los
 * documentos no lo tienen. Si se corre antes, el acto lo dice y se detiene —
 * no sale con un plan vacío que parezca «no había nada que hacer».
 *
 * Agrupa por portafolio y NUNCA por el texto del objeto. Emparejar por objeto
 * sirvió para MEDIR el problema; para escribir no, porque dos licitaciones
 * distintas pueden tener el objeto palabra por palabra igual.
 *
 * Se queda el de la fase más avanzada — la MISMA regla que
 * `resolverPorPortafolio` aplica a las filas nuevas. Si este acto se quedara
 * con otro, la corrida siguiente volvería a crear el que se descartó.
 *
 * ── USO ─────────────────────────────────────────────────────────────────────
 *   node functions-radar/acto.mjs 3b-duplicados
 *   AUTOR_UID=<uid> node functions-radar/acto.mjs 3b-duplicados --apply
 */
import { planFusionarDuplicados } from '../../src/utils/sigp/actosRadar'
import {
  APLICAR, arranque, cierreDryRun, cierreApply,
  escribirLotes, verificarReleyendo, traerTodos, esDelRadarDoc,
  radarCrudo, textoCrudo,
} from './_comun'

const ACTO = '3b-duplicados'

export async function main(): Promise<void> {
  const { db, autor, ahora } = arranque('ACTO 3b · FUSIONAR LAS LICITACIONES DUPLICADAS')

  const delRadar = (await traerTodos(db)).filter(esDelRadarDoc)
  const conPortafolio = delRadar.filter(d => radarCrudo(d)?.portafolio != null)
  console.log(`  documentos del radar             ${delRadar.length}`)
  console.log(`  con portafolio                   ${conPortafolio.length}`)
  console.log('')

  if (conPortafolio.length === 0) {
    console.log('  NINGUNO tiene portafolio: este acto necesita el 1a primero.')
    console.log('  Corré 1a-fase-portafolio y volvé.')
    console.log('')
    return
  }

  const plan = planFusionarDuplicados(
    delRadar.map(d => ({
      id: d.id,
      estado: textoCrudo(d.estado),
      radar: radarCrudo(d),
      override_manual: d.override_manual,
      oferta_neg: d.oferta_neg,
      manifestaciones: d.manifestaciones,
    })),
    'DUPLICADO',
    autor,
    ahora,
  )

  console.log('  PLAN')
  console.log(`    grupos duplicados              ${plan.grupos.length}`)
  console.log(`    documentos que salen           ${plan.patches.length}`)
  console.log(`    sin portafolio (no agrupables) ${plan.sin_portafolio}`)
  console.log('')
  if (plan.grupos_con_huella.length > 0) {
    console.log(`  LA GUARDA OPERÓ en ${plan.grupos_con_huella.length} grupos: hay trabajo humano en MÁS DE UNO.`)
    console.log('  El acto se abstiene — cuál vale más no lo decide un script:')
    for (const g of plan.grupos_con_huella) {
      console.log(`      portafolio ${g.portafolio}`)
      for (const x of g.ids) console.log(`        ${x.id}  (${x.por.join(', ')})`)
    }
    console.log('')
  }
  console.log('  Qué se queda y qué sale:')
  for (const g of plan.grupos) {
    console.log(`      ${g.portafolio}`)
    console.log(`        se queda  ${g.se_queda}`)
    console.log(`        sale      ${g.salen.join(', ')}`)
  }
  console.log('')

  if (!APLICAR) return cierreDryRun(ACTO)
  if (plan.patches.length === 0) {
    console.log('  Nada que escribir.\n')
    return
  }

  const escritos = await escribirLotes(db, plan.patches)
  const ver = await verificarReleyendo(db, plan.patches.map(p => p.id), doc =>
    doc.estado === 'descartada'
    && doc.motivo_descarte === 'DUPLICADO'
    && doc.activa === false)

  // La otra mitad de la verificación, y la que de verdad importa: los que se
  // QUEDAN siguen en juego. Un acto que descarta el duplicado Y el original
  // pasaría la primera comprobación con nota perfecta.
  const quedan = plan.grupos.map(g => g.se_queda)
  const verQuedan = await verificarReleyendo(db, quedan, doc => doc.estado !== 'descartada')
  console.log(`  los que se quedan, en juego      ${verQuedan.ok} de ${quedan.length}`)
  console.log('')
  cierreApply(escritos, { ok: ver.ok, fallan: [...ver.fallan, ...verQuedan.fallan] })
}
