// Corte de avance de obra (07-nov) — oráculo: el contrato SENA del 058
// (AIU 10/0/5, IVA sobre la U). Principios fijados por test: el autor del
// avance SIEMPRE queda; el corte emitido es un HECHO (corregir el avance no
// cambia deltas emitidos); la versión de cambio se dice, no se silencia.
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  patchRegistrarAvance, pctItem, estadoItemAvance, valorEjecutadoItem,
  resumenEconomicoCorte, construirCorte,
} from '../corteObra'
import type { Proyecto } from '../proyecto'

const ts = Timestamp.fromDate(new Date('2026-11-07T12:00:00Z'))
const items_alcance = [
  { clave: 'i1', codigo: '1.1', descripcion: 'Cerramiento deportivo', unidad: 'm2', cantidad: 100, valor_total: 10_000_000, grupo: '01.01 KENNEDY · CERRAMIENTOS' },
  { clave: 'i2', codigo: '2.1', descripcion: 'Red hidrosanitaria', unidad: 'ml', cantidad: 50, valor_total: 5_000_000, grupo: '01.03 KENNEDY · REDES' },
]
const proyecto = (over: Partial<Proyecto> = {}) => ({
  id: 'p58', consecutivo: 'PRY-2026-058', cotizacion_version: 3,
  snapshot: { items_alcance, cliente: 'Gobierno_SENA', valor_venta: 15_000_000 } as never,
  ...over,
}) as Pick<Proyecto, 'id' | 'consecutivo' | 'snapshot' | 'avance_items' | 'cotizacion_version'>

describe('avance por ítem — capturado cuando ocurre, con autor SIEMPRE', () => {
  it('registra acumulado con quién y cuándo; segundo registro appendea', () => {
    const r1 = patchRegistrarAvance(proyecto(), 'i1', 40, 'paula', ts, 'Paula')!
    expect(r1.avance_items[0]).toMatchObject({ clave: 'i1', cantidad: 40 })
    expect(r1.avance_items[0].registros[0]).toMatchObject({ por: 'paula', por_nombre: 'Paula', cantidad: 40 })
    const r2 = patchRegistrarAvance({ ...proyecto(), avance_items: r1.avance_items }, 'i1', 70, 'dir', ts)!
    expect(r2.avance_items[0].cantidad).toBe(70)
    expect(r2.avance_items[0].registros).toHaveLength(2)
  })
  it('sobre-ejecución se ACEPTA y se avisa; clave fuera del alcance → null', () => {
    const r = patchRegistrarAvance(proyecto(), 'i1', 120, 'u', ts)!
    expect(r.sobreEjecutado).toBe(true)
    expect(patchRegistrarAvance(proyecto(), 'noexiste', 1, 'u', ts)).toBeNull()
    expect(patchRegistrarAvance(proyecto(), 'i1', -1, 'u', ts)).toBeNull()
  })
  it('derivados: %, estado y valor ejecutado proporcional al peso', () => {
    expect(pctItem(items_alcance[0], { cantidad: 40 })).toBe(40)
    expect(estadoItemAvance(0)).toBe('sin_avance')
    expect(estadoItemAvance(40)).toBe('en_ejecucion')
    expect(estadoItemAvance(100)).toBe('ejecutado')
    expect(valorEjecutadoItem(items_alcance[0], 40)).toBe(4_000_000)
  })
})

describe('resumen económico del corte — los % del CONTRATO (SENA 10/0/5)', () => {
  it('AIU sobre el delta, IVA SOLO sobre la U', () => {
    const r = resumenEconomicoCorte(10_000_000, 'aiu', { admin: 10, imprevistos: 0, utilidad: 5 })
    expect(r.admin).toBe(1_000_000)
    expect(r.imprevistos).toBe(0)
    expect(r.utilidad).toBe(500_000)
    expect(r.iva).toBe(95_000)             // 19% de la U, jamás del CD
    expect(r.total).toBe(11_595_000)
  })
  it('iva_pleno: IVA sobre el delta completo', () => {
    const r = resumenEconomicoCorte(1_000_000, 'iva_pleno')
    expect(r.iva).toBe(190_000)
    expect(r.total).toBe(1_190_000)
  })
})

describe('construirCorte — generado del avance, congelado al emitir', () => {
  const conAvance = (i1: number, i2: number) => proyecto({
    avance_items: [
      { clave: 'i1', cantidad: i1, registros: [] },
      { clave: 'i2', cantidad: i2, registros: [] },
    ],
  } as never)

  it('corte 1: acumulado desde cero, delta = acumulado, numero 1', () => {
    const r = construirCorte({ proyecto: conAvance(40, 0), cortesPrevios: [], esquema: 'aiu', aiu: { admin: 10, imprevistos: 0, utilidad: 5 } })
    if (!r.ok) throw new Error(r.error)
    expect(r.corte.numero_corte).toBe(1)
    expect(r.corte.cd_acum).toBe(4_000_000)
    expect(r.corte.cd_acum_anterior).toBe(0)
    expect(r.corte.resumen.delta_cd).toBe(4_000_000)
    expect(r.corte.resumen.total).toBe(4_638_000)   // 4M + 400k + 0 + 200k + 38k
    expect(r.corte.items.find(i => i.clave === 'i1')!.estado).toBe('en_ejecucion')
    expect(r.corte.items.find(i => i.clave === 'i2')!.estado).toBe('sin_avance')
    expect(r.corte.cotizacion_version_medida).toBe(3)
  })
  it('EL HECHO: el corte 2 mide contra el ACUMULADO CONGELADO del corte 1 — aunque el avance se haya corregido después', () => {
    // El corte 1 congeló cd_acum = 4.000.000. Después alguien CORRIGIÓ el
    // avance de i1 hacia abajo (de 40 a 30). El corte 2 NO re-deriva la base:
    // su delta es acum_nuevo − 4.000.000, y el corte 1 queda intacto.
    const corte1 = { numero_corte: 1, cd_acum: 4_000_000, cotizacion_version_medida: 3 }
    const r = construirCorte({ proyecto: conAvance(60, 20), cortesPrevios: [corte1], esquema: 'aiu', aiu: { admin: 10, imprevistos: 0, utilidad: 5 } })
    if (!r.ok) throw new Error(r.error)
    expect(r.corte.numero_corte).toBe(2)
    expect(r.corte.cd_acum).toBe(8_000_000)         // 60% de 10M + 40% de 5M
    expect(r.corte.cd_acum_anterior).toBe(4_000_000) // del corte 1, congelado
    expect(r.corte.resumen.delta_cd).toBe(4_000_000)
  })
  it('sin avance nuevo (acumulado ≤ corte anterior) → error con razón; sin avance capturado → error', () => {
    const corte1 = { numero_corte: 1, cd_acum: 8_000_000, cotizacion_version_medida: 3 }
    const r = construirCorte({ proyecto: conAvance(40, 0), cortesPrevios: [corte1], esquema: 'iva_pleno' })
    expect(!r.ok && r.error).toContain('no supera')
    const r2 = construirCorte({ proyecto: proyecto(), cortesPrevios: [], esquema: 'iva_pleno' })
    expect(!r2.ok && r2.error).toContain('no se arma a mano')
  })
  it('versión de cambio entre cortes → el corte lo DICE; avance huérfano → listado, no silenciado', () => {
    const corte1 = { numero_corte: 1, cd_acum: 1_000_000, cotizacion_version_medida: 3 }
    const p = proyecto({
      cotizacion_version: 4,
      avance_items: [
        { clave: 'i1', cantidad: 40, registros: [] },
        { clave: 'retirado', cantidad: 7, registros: [] },   // salió del alcance en v4
      ],
    } as never)
    const r = construirCorte({ proyecto: p, cortesPrevios: [corte1], esquema: 'iva_pleno' })
    if (!r.ok) throw new Error(r.error)
    expect(r.corte.nota_version_cambio).toContain('v4')
    expect(r.corte.nota_version_cambio).toContain('v3')
    expect(r.corte.items_fuera_de_alcance).toEqual([{ clave: 'retirado', cantidad: 7 }])
  })
})
