/**
 * ACTO 1a · Completar `fase`, `fases_previas` y `portafolio` en los
 * documentos que el radar escribió antes de capturarlos.
 *
 * ── QUÉ AUTORIZA ESCRIBIR EN UN CAMPO PROTEGIDO ─────────────────────────────
 *
 *     completar lo que el origen no capturó no es reescribir el juicio del
 *     nacimiento.
 *
 * `radar` está en `CAMPOS_PROTEGIDOS` porque es la PROCEDENCIA: por qué
 * trajimos este proceso. Lo que este acto escribe no es un juicio nuestro —son
 * hechos del proceso que SECOP publica— y solo donde el sub-campo está
 * AUSENTE. La guarda la hace cumplir `completarSiFalta`, no un comentario: si
 * un sub-campo tiene valor, no se toca, aunque el origen diga otra cosa. Esos
 * casos se cuentan en `respetados`.
 *
 * Sin eso, este acto sería un precedente para lo segundo.
 *
 * ── QUÉ NO HACE ─────────────────────────────────────────────────────────────
 *
 * NO limpia `numero_proceso`. Limpiarlo no sería llenar un hueco sino
 * sobrescribir un valor. El número sigue mostrando el sufijo de la fase, y eso
 * se arregla al LEER —`limpiarReferencia(numero, fase)` en la UI—, que es
 * código y no datos.
 *
 * ── USO ─────────────────────────────────────────────────────────────────────
 *   node functions-radar/acto.mjs 1a-fase-portafolio
 *   AUTOR_UID=<uid> node functions-radar/acto.mjs 1a-fase-portafolio --apply
 */
import { planCompletarRadar, type HechosDelOrigen } from '../../src/utils/sigp/actosRadar'
import { ENDPOINT_SECOP, clausulaIn } from '../../src/utils/sigp/secopConsulta'
import {
  APLICAR, arranque, abortar, cierreDryRun, cierreApply,
  escribirLotes, verificarReleyendo, traerTodos, esDelRadarDoc,
} from './_comun'

const ACTO = '1a-fase-portafolio'

/** El `in` de SoQL aguanta holgado; se parte igual para no armar URLs enormes. */
const LOTE_SECOP = 40

/**
 * Trae del origen los dos hechos que faltan.
 *
 * La `fase` es una COLUMNA de SECOP, no algo derivable del número guardado: el
 * número trae pegadas todas las fases, incluida la actual, y
 * `separarFasesDeReferencia` necesita saber cuál es la actual para no contarla
 * como previa. Una sola lectura da las dos cosas.
 */
async function hechosDelOrigen(
  idsSecop: readonly string[],
): Promise<Map<string, HechosDelOrigen>> {
  const out = new Map<string, HechosDelOrigen>()
  for (let i = 0; i < idsSecop.length; i += LOTE_SECOP) {
    const lote = idsSecop.slice(i, i + LOTE_SECOP)
    const url = `${ENDPOINT_SECOP}?${new URLSearchParams({
      $where: clausulaIn('id_del_proceso', lote),
      $select: 'id_del_proceso,fase,id_del_portafolio',
      $limit: '5000',
    })}`
    const r = await fetch(url)
    if (!r.ok) abortar(`SECOP respondió ${r.status} — el acto NO escribe con datos a medias.`)
    const filas = (await r.json()) as {
      id_del_proceso?: string; fase?: string; id_del_portafolio?: string
    }[]
    for (const f of filas) {
      const id = (f.id_del_proceso ?? '').trim()
      if (id === '') continue
      out.set(id, {
        fase: (f.fase ?? '').trim() || null,
        portafolio: (f.id_del_portafolio ?? '').trim() || null,
      })
    }
  }
  return out
}

export async function main(): Promise<void> {
  const { db, ahora } = arranque('ACTO 1a · COMPLETAR FASE Y PORTAFOLIO')
  void ahora

  const todos = await traerTodos(db)
  const delRadar = todos.filter(esDelRadarDoc)
  console.log(`  documentos en la colección      ${todos.length}`)
  console.log(`  del radar (los que este acto mira)  ${delRadar.length}`)

  // El id de SECOP es la llave del origen; el doc id es la de la colección.
  const porIdSecop = new Map<string, string>()
  for (const d of delRadar) {
    const idS = String(d.id_secop ?? '').trim()
    if (idS !== '') porIdSecop.set(idS, d.id)
  }
  console.log(`  con id_secop usable             ${porIdSecop.size}`)
  console.log('')
  console.log('  Leyendo SECOP…')
  const porSecop = await hechosDelOrigen([...porIdSecop.keys()])
  console.log(`  el origen respondió por         ${porSecop.size}`)

  // Se reindexa por doc id, que es con lo que el planificador trabaja.
  const delOrigen = new Map<string, HechosDelOrigen>()
  for (const [idS, docId] of porIdSecop) {
    const h = porSecop.get(idS)
    if (h) delOrigen.set(docId, h)
  }

  const plan = planCompletarRadar(
    delRadar.map(d => ({
      id: d.id,
      numero_proceso: (d.numero_proceso as string | null | undefined) ?? null,
      radar: (d.radar as Record<string, unknown> | null | undefined) ?? null,
    })),
    delOrigen,
  )

  console.log('')
  console.log('  PLAN')
  console.log(`    se completan                  ${plan.patches.length}`)
  console.log(`    ya tenían todo                ${plan.sin_cambio}`)
  console.log(`    sin datos del origen          ${plan.sin_datos_del_origen}`)
  console.log(`    sin bloque radar              ${plan.sin_radar}`)
  console.log('')
  console.log(`    quedan con FASE de verdad     ${plan.con_fase}`)
  console.log(`    quedan con PORTAFOLIO         ${plan.con_portafolio}   ← lo que el 3b podrá agrupar`)
  console.log('')
  if (plan.respetados.length > 0) {
    console.log(`  LA GUARDA OPERÓ en ${plan.respetados.length} documentos — tenían valor y NO se tocan:`)
    for (const r of plan.respetados.slice(0, 10)) {
      console.log(`      ${r.id}  (${r.campos.join(', ')})`)
    }
    console.log('')
  }
  console.log('  Muestra de lo que se va a escribir:')
  for (const p of plan.patches.slice(0, 8)) {
    const r = p.patch.radar
    console.log(`      ${p.id}`)
    console.log(`        fase=${JSON.stringify(r.fase)}  previas=${JSON.stringify(r.fases_previas)}`)
    console.log(`        portafolio=${JSON.stringify(r.portafolio)}`)
  }
  console.log('')

  if (!APLICAR) return cierreDryRun(ACTO)
  if (plan.patches.length === 0) {
    console.log('  Nada que escribir.\n')
    return
  }

  const escritos = await escribirLotes(db, plan.patches)
  const esperado = new Map(plan.patches.map(p => [p.id, p.patch.radar]))
  const ver = await verificarReleyendo(db, [...esperado.keys()], (doc, id) => {
    const q = esperado.get(id)!
    const r = (doc.radar ?? {}) as Record<string, unknown>
    return 'fase' in r && 'fases_previas' in r && 'portafolio' in r
      && JSON.stringify(r.fase) === JSON.stringify(q.fase)
      && JSON.stringify(r.portafolio) === JSON.stringify(q.portafolio)
      && JSON.stringify(r.fases_previas) === JSON.stringify(q.fases_previas)
      // Y lo de antes sigue ahí: el acto COMPLETA, no reemplaza el bloque.
      && r.senal !== undefined && r.vocabulario_version !== undefined
  })
  cierreApply(escritos, ver)
}
