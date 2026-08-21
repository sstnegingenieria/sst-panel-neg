/**
 * Regresión del doc id de la importación histórica.
 *
 * ORIGEN: la importación a producción del 21-ago-2026 escribió 372 registros
 * y la colección quedó con 368. El id colapsaba toda la puntuación a `_`,
 * mientras que el dedupe del parser (`claveProceso`) solo normaliza tildes,
 * espacios y mayúsculas — así que cuatro pares de procesos DISTINTOS caían en
 * el mismo id y `batch.set` pisaba el primero SIN error, sin aviso y sin nada
 * en el reporte. Se detectó contando la colección en producción, no antes.
 *
 * Lo que estos tests fijan es que eso no pueda repetirse en silencio.
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { docIdHistorico, claveProceso } from '../importarLicitaciones'

/** El mismo hash que inyecta el script de importación. */
const hash = (s: string) => createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 8)
const id = (numero: string) => docIdHistorico(numero, hash)

/**
 * Los CUATRO pares reales que colisionaron en producción. Son números de
 * proceso (identificadores públicos de SECOP), no datos comerciales.
 */
const PARES_QUE_COLISIONARON: [string, string][] = [
  ['MC-020-2026', 'MC 020-2026'],     // Magangué  vs  Ricaurte
  ['SAMC 006-2026', 'SAMC-006-2026'], // Caja de Retiro  vs  Nátaga
  ['SAMC-007-2026', 'SAMC 007-2026'], // Tabio  vs  Caja de Retiro
  ['MC-017-2025', 'MC 017-2025'],     // Secretaría  vs  Bogotá D.C.
]

describe('docIdHistorico — los 4 pares que se perdieron en producción', () => {
  it('CLAVE: cada par produce ids DISTINTOS', () => {
    for (const [a, b] of PARES_QUE_COLISIONARON) {
      expect(id(a), `${a} vs ${b}`).not.toBe(id(b))
    }
  })

  it('el prefijo legible SÍ coincide — por eso el bug era invisible', () => {
    // Los dos ids se ven casi iguales; lo único que los separa es el sufijo.
    // Documenta por qué mirar la lista de ids no habría delatado nada.
    for (const [a, b] of PARES_QUE_COLISIONARON) {
      const pa = id(a).split('_').slice(0, -1).join('_')
      const pb = id(b).split('_').slice(0, -1).join('_')
      expect(pa).toBe(pb)
    }
  })

  it('los 8 números juntos dan 8 ids únicos', () => {
    const todos = PARES_QUE_COLISIONARON.flat()
    expect(new Set(todos.map(id)).size).toBe(todos.length)
  })
})

describe('docIdHistorico — idempotencia', () => {
  it('el mismo número da SIEMPRE el mismo id (re-importar actualiza, no duplica)', () => {
    for (const n of ['MC-020-2026', 'SAMC 006-2026', 'LP-DNP-004-2026']) {
      expect(id(n)).toBe(id(n))
    }
  })

  it('lo que `claveProceso` considera el MISMO número, comparte id', () => {
    // Mayúsculas, tildes y espacios de sobra no crean un registro nuevo:
    // es exactamente el contrato del dedupe.
    expect(claveProceso(' mc-025-2022 ')).toBe(claveProceso('MC-025-2022'))
    expect(id(' mc-025-2022 ')).toBe(id('MC-025-2022'))
  })

  it('números distintos NO comparten id aunque solo cambie la puntuación', () => {
    expect(id('MC-025-2022')).not.toBe(id('MC 025 2022'))
    expect(id('MC.025.2022')).not.toBe(id('MC-025-2022'))
  })
})

describe('docIdHistorico — forma del id', () => {
  it('es un doc id válido de Firestore: sin barras, sin puntos sueltos', () => {
    for (const n of ['MC-020/2026', 'SMC-010 DE 2022', 'IP.DT.CUN.005.2022', '147-00-BH-COFA-2022']) {
      const x = id(n)
      expect(x, n).not.toContain('/')
      expect(x, n).toMatch(/^hist_[A-Z0-9_]+_[0-9a-f]{8}$/)
    }
  })

  it('conserva el prefijo legible — un id se puede leer y reconocer', () => {
    expect(id('MC-020-2026')).toMatch(/^hist_MC_020_2026_/)
  })

  it('un número larguísimo no revienta el límite de Firestore', () => {
    const largo = 'PROCESO-' + 'X'.repeat(400) + '-2026'
    const x = id(largo)
    expect(x.length).toBeLessThanOrEqual(1500)
    expect(x).toMatch(/_[0-9a-f]{8}$/)   // el sufijo sobrevive al recorte
  })

  it('CLAVE: dos números que solo difieren DESPUÉS del recorte siguen distintos', () => {
    // El prefijo se corta a 100 chars; el hash se calcula sobre el número
    // COMPLETO, así que la cola no se pierde.
    const a = 'PROCESO-' + 'A'.repeat(120) + '-UNO'
    const b = 'PROCESO-' + 'A'.repeat(120) + '-DOS'
    expect(id(a)).not.toBe(id(b))
  })

  it('números vacíos o basura no lanzan', () => {
    expect(() => id('')).not.toThrow()
    expect(() => id('---')).not.toThrow()
  })
})

describe('la guarda del importador: un lote sin colisiones', () => {
  it('un conjunto realista de números produce tantos ids como registros', () => {
    // Réplica en pequeño de lo que la guarda del script hace sobre los 372
    // reales antes de escribir: contar ids únicos y abortar si faltan.
    const numeros = [
      ...PARES_QUE_COLISIONARON.flat(),
      'MC-025-2022', 'DADEP-SMINC-365', 'CMY-MC-002-2022', 'SMC-010 DE 2022',
      'IMC-91-005-2022', 'CP-DT-BOY-001-2022', 'PMC-023-2022', '0053-ARC',
      'IP-DT-CUN-005-2022', 'INV-10-2022', 'DASAJ80-MC-12-2022', 'CMC-002-22',
      '147-00-BH-COFA-BACOF-2022', 'MC-029-CENACTUNJA', 'UMV-CMC-022-2024',
    ]
    const ids = new Set(numeros.map(id))
    expect(ids.size).toBe(numeros.length)
  })
})
