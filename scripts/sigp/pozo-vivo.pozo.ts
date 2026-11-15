/**
 * LA CIFRA DEL DÍA — cuántos procesos trabajables hay HOY en el pozo vivo del radar.
 *
 * QUÉ MIDE. Trae de SECOP II (datos.gov.co, dataset p6dx-8zbt) todos los
 * procesos de Bogotá D.C. y Cundinamarca, en las 4 modalidades de ingesta, cuyo
 * ESTADO del procedimiento sigue abierto (Publicado, Abierto, Borrador, En
 * aprobación, Aprobado, Suspendido). Los pasa por el léxico de NEG, se queda
 * con los persistibles (si + probable) y cuenta cuáles TODAVÍA se pueden
 * trabajar: los que `porQueNoAlcanza` deja pasar (devuelve `null`). Ese conteo
 * es el número decisivo de `docs/ventana-util-radar.md`.
 *
 * POR QUÉ NO ESTÁ EN LA SUITE. El pozo cambia a diario y la consulta sale a la
 * red: un test cuyo resultado depende del día y de internet es intermitente
 * por diseño. Por eso el archivo NO se llama `*.test.ts` (el glob por defecto
 * de Vitest lo recogería) y vive en `scripts/sigp/` con su propia config
 * (`vitest.pozo.config.ts`) que incluye solo este archivo. `npx vitest run`
 * no lo ve y sigue dando la misma cantidad de tests.
 *
 * POR QUÉ USA EL CRITERIO REAL. Importa `ingerirSecop` (con el léxico vigente
 * de `vocabularioNeg.ts`) y `porQueNoAlcanza` tal como los usa el producto.
 * Reimplementar cualquiera de los dos criterios aquí sería el defecto "A.2b":
 * dos copias del mismo criterio divergen y la cifra deja de ser la del radar.
 * Este archivo solo trae datos, envuelve fechas y cuenta.
 *
 * REGLA DE LA CONSULTA. Ningún filtro `>=`/`<=` sobre columnas de fecha: la
 * futuridad del cierre se calcula acá, contra el reloj, no en el servidor. El
 * filtro es por ESTADO. (El literal 'Distrito Capital de Bogotá' lleva tilde:
 * mal escrito devuelve menos filas SIN error.)
 *
 * CÓMO CORRERLO (una línea, desde la raíz de sst-panel-web):
 *
 *   npx vitest run --config vitest.pozo.config.ts
 *
 * Imprime fecha y hora de la medición, versión del léxico y cada porcentaje
 * con su denominador. Parámetros: horas_utiles_dia = 4; "hoy" sale del reloj.
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { ingerirSecop, type FilaSecop } from '../../src/utils/sigp/secopMapeo'
import {
  TERMINOS_NEG, NEGATIVOS_NEG, VOCABULARIO_NEG_VERSION,
} from '../../src/types/sigp/vocabularioNeg'
import { porQueNoAlcanza } from '../../src/utils/sigp/bandejaLicitaciones'
import { isoLocal } from '../../src/utils/sigp/ventanaLicitacion'
import {
  ENDPOINT_SECOP, MODALIDADES_INGESTA, DEPARTAMENTOS_INGESTA, clausulaIn,
} from '../../src/utils/sigp/secopConsulta'

const HORAS_UTILES_DIA = 4
const ESTADOS_ABIERTOS = [
  'Publicado', 'Abierto', 'Borrador', 'En aprobación', 'Aprobado', 'Suspendido',
] as const

const hash = (s: string) => createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 8)

/** Pega: el módulo puro entrega ISO; el criterio real lee `toDate()`/`toMillis()`. */
const aTs = (iso: string | null | undefined) => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return { toDate: () => d, toMillis: () => d.getTime() }
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)} %` : 'n/a')
const frac = (n: number, d: number) => `${n} de ${d} (${pct(n, d)})`

function cuantil(ordenado: number[], p: number): number {
  if (!ordenado.length) return NaN
  const i = (ordenado.length - 1) * p
  const lo = Math.floor(i), hi = Math.ceil(i)
  return ordenado[lo] + (ordenado[hi] - ordenado[lo]) * (i - lo)
}
const resumen = (xs: number[], unidad: string) => {
  const o = [...xs].sort((a, b) => a - b)
  const f = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
  return `mín ${f(o[0])} · p25 ${f(cuantil(o, 0.25))} · mediana ${f(cuantil(o, 0.5))} · p75 ${f(cuantil(o, 0.75))} · máx ${f(o[o.length - 1])} ${unidad}`
}
function contar<T>(xs: T[], k: (x: T) => string): [string, number][] {
  const m = new Map<string, number>()
  for (const x of xs) m.set(k(x), (m.get(k(x)) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}
const diasEntre = (aIso: string, bIso: string) =>
  Math.round((Date.parse(bIso + 'T00:00:00Z') - Date.parse(aIso + 'T00:00:00Z')) / 86_400_000)

describe('pozo vivo del radar — la cifra del día', () => {
  it('mide y imprime', async () => {
    const ahora = new Date()
    const hoy = isoLocal(ahora)

    const where = [
      clausulaIn('departamento_entidad', DEPARTAMENTOS_INGESTA),
      clausulaIn('modalidad_de_contratacion', MODALIDADES_INGESTA),
      clausulaIn('estado_del_procedimiento', ESTADOS_ABIERTOS),
    ].join(' AND ')
    const params = new URLSearchParams({
      $where: where,
      $order: 'id_del_proceso ASC',
      $limit: '50000',
      $offset: '0',
    })
    const res = await fetch(`${ENDPOINT_SECOP}?${params.toString()}`)
    expect(res.status).toBe(200)
    const filas = (await res.json()) as FilaSecop[]
    expect(filas.length).toBeLessThan(50_000) // si llega al tope, la cosecha está truncada

    const rep = ingerirSecop(filas, hash, {
      terminos: TERMINOS_NEG, negativos: NEGATIVOS_NEG, vocabulario_version: VOCABULARIO_NEG_VERSION,
    })
    const regs = rep.registros.map(r => r.doc)
    const persistibles = regs.length

    const conCierre = regs.filter(d => d.cronograma.cierre)
    const sinCierre = persistibles - conCierre.length
    const medidos = conCierre.map(d => {
      const cierreIso = isoLocal(new Date(d.cronograma.cierre as string))
      return { d, dias: diasEntre(hoy, cierreIso) }
    })
    const futuros = medidos.filter(m => m.dias >= 0)
    const pasados = medidos.length - futuros.length

    const noAlcanza: Record<string, number> = {}
    const trabajables: typeof medidos = []
    for (const m of medidos) {
      const l = {
        modalidad: m.d.modalidad, radar: m.d.radar,
        cronograma: { cierre: aTs(m.d.cronograma.cierre) },
      } as unknown as Parameters<typeof porQueNoAlcanza>[0]
      const r = porQueNoAlcanza(l, hoy, HORAS_UTILES_DIA)
      if (r === null) trabajables.push(m)
      else noAlcanza[r.motivo] = (noAlcanza[r.motivo] ?? 0) + 1
    }
    const totalNoAlcanza = Object.values(noAlcanza).reduce((a, b) => a + b, 0)

    const L: string[] = []
    const p = (s = '') => { L.push(s) }
    p('════════ POZO VIVO DEL RADAR — LA CIFRA DEL DÍA ════════')
    p(`Medición:        ${ahora.toISOString()}  (hoy local = ${hoy})`)
    p(`Léxico:          versión ${VOCABULARIO_NEG_VERSION} (${TERMINOS_NEG.length} términos, ${NEGATIVOS_NEG.length} negativos)`)
    p(`Fuente:          ${ENDPOINT_SECOP}`)
    p(`Territorio:      ${DEPARTAMENTOS_INGESTA.join(' + ')}`)
    p(`Modalidades:     ${MODALIDADES_INGESTA.join(' | ')}`)
    p(`Estados:         ${ESTADOS_ABIERTOS.join(', ')}`)
    p(`Parámetros:      horas_utiles_dia = ${HORAS_UTILES_DIA}; sin filtros de fecha en la consulta`)
    p()
    p(`Filas traídas: ${filas.length} · procesos distintos: ${rep.procesos_vistos}`)
    p(`Veredictos del léxico (sobre ${rep.procesos_vistos} procesos): si ${rep.por_veredicto.si} · probable ${rep.por_veredicto.probable} · no ${rep.por_veredicto.no}`)
    p(`Persistibles (si+probable): ${frac(persistibles, rep.procesos_vistos)}`)
    p(`  con cierre: ${frac(conCierre.length, persistibles)}`)
    p(`  sin cierre (balde aparte, no descartados): ${frac(sinCierre, persistibles)}`)
    p(`Cierre futuro: ${frac(futuros.length, conCierre.length)} (denominador: persistibles con cierre)`)
    p(`Cierre pasado: ${frac(pasados, conCierre.length)} (denominador: persistibles con cierre)`)
    if (futuros.length) p(`Días por delante de los futuros (n=${futuros.length}): ${resumen(futuros.map(m => m.dias), 'días')}`)
    p()
    p(`>>> TRABAJABLES: ${trabajables.length} <<<   (${frac(trabajables.length, conCierre.length)} de los persistibles con cierre)`)
    p(`No alcanzan: ${frac(totalNoAlcanza, conCierre.length)}`)
    for (const k of ['plazo_vencido', 'manifestacion_cerrada', 'ventana_insuficiente']) {
      p(`  ${k}: ${frac(noAlcanza[k] ?? 0, conCierre.length)}`)
    }
    p('Trabajables por modalidad:')
    for (const [k, n] of contar(trabajables, m => m.d.modalidad)) p(`  ${k}: ${frac(n, trabajables.length)}`)
    p()
    p(`Listado de trabajables (${trabajables.length}) — cierre · días · modalidad · entidad · proceso`)
    for (const m of [...trabajables].sort((a, b) => a.dias - b.dias)) {
      p(`  ${isoLocal(new Date(m.d.cronograma.cierre as string))} · ${String(m.dias).padStart(3)} d · ${m.d.modalidad} · ${m.d.entidad.nombre} · ${m.d.numero_proceso}`)
    }
    p()
    const edades: number[] = []
    let sinPub = 0
    for (const m of trabajables) {
      const pub = m.d.cronograma.publicacion
      if (!pub || Number.isNaN(Date.parse(pub))) { sinPub++; continue }
      edades.push(diasEntre(isoLocal(new Date(pub)), hoy))
    }
    p(`Antigüedad de la publicación de los trabajables (n=${edades.length} con fecha; ${frac(sinPub, trabajables.length)} sin fecha de publicación):`)
    if (edades.length) {
      p(`  ${resumen(edades, 'días')}`)
      for (const u of [7, 14, 30]) p(`  más de ${u} días: ${frac(edades.filter(e => e > u).length, edades.length)}`)
    }
    p('════════════════════════════════════════════════════════')
    console.log('\n' + L.join('\n') + '\n')
  }, 120_000)
})
