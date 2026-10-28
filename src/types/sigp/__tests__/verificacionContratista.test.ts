// Parte A del bloque proyección/saldo (28-oct) — proyección POR CONTRATISTA.
// Fija: la agrupación de la CF (con el HALLAZGO del 27-oct: 78/79 asignaciones
// de prod NO traen campo `tipo` — la ausencia ES contratista), el tramo [A1]
// desde enviado_a_facturacion, el helper del peor-estado para el chip de la
// bandeja y el id determinístico [R1].
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { gateAgregadoDe, idVerificacion } from '../verificacionSst'

const require = createRequire(import.meta.url)
const { agruparPorContratista, ESTADOS_TRAMO_PROYECCION } = require('../../../../functions/verificacionesSst.js') as {
  agruparPorContratista: (asigs: Record<string, unknown>[]) => Map<string, { nombre: string; vivas: number }>
  ESTADOS_TRAMO_PROYECCION: string[]
}

describe('agruparPorContratista (CF real) — el hallazgo del tipo ausente', () => {
  it('SIN campo tipo = contratista (78/79 en prod) — filtrar por tipo === "contratista" dejaría la cola vacía', () => {
    const m = agruparPorContratista([
      { contratista_id: 'c1', contratista_nombre: 'Héctor', estado: 'anticipo_girado' },   // sin tipo
      { tipo: 'contratista', contratista_id: 'c2', contratista_nombre: 'Lozano', estado: 'asignada' },
    ])
    expect([...m.keys()].sort()).toEqual(['c1', 'c2'])
  })
  it('la administración DIRECTA no genera proyección [R5]; sin contratista_id se omite', () => {
    const m = agruparPorContratista([
      { tipo: 'administracion_directa', contratista_id: 'neg', estado: 'estimada' },
      { contratista_id: '', estado: 'asignada' },
    ])
    expect(m.size).toBe(0)
  })
  it('[R6] vivas: cancelada y liquidada NO cuentan — N asignaciones del mismo contratista = UN doc (caso Héctor ×2)', () => {
    const m = agruparPorContratista([
      { contratista_id: 'c1', contratista_nombre: 'Héctor', estado: 'anticipo_girado' },
      { contratista_id: 'c1', contratista_nombre: 'Héctor', estado: 'liquidada' },
      { contratista_id: 'c1', contratista_nombre: 'Héctor', estado: 'cancelada' },
    ])
    expect(m.size).toBe(1)
    expect(m.get('c1')).toEqual({ nombre: 'Héctor', vivas: 1 })
  })
  it('todas liquidadas/canceladas → vivas 0 (la CF marca activa:false — huérfana fuera de la cola, jamás borrada)', () => {
    const m = agruparPorContratista([{ contratista_id: 'c1', contratista_nombre: 'H', estado: 'liquidada' }])
    expect(m.get('c1')!.vivas).toBe(0)
  })
})

describe('[A1] el tramo de proyección arranca en enviado_a_facturacion (decidido 23-oct, escrito)', () => {
  it('incluye enviado_a_facturacion y el tramo administrativo completo', () => {
    expect(ESTADOS_TRAMO_PROYECCION[0]).toBe('enviado_a_facturacion')
    for (const e of ['facturado', 'pagado_cliente', 'liquidado_contratista', 'cerrado'])
      expect(ESTADOS_TRAMO_PROYECCION).toContain(e)
  })
  it('los estados de preparación/ejecución NO proyectan (la cola de SST sin ruido)', () => {
    for (const e of ['creado', 'anticipo_girado', 'en_ejecucion', 'ejecutado', 'cancelado'])
      expect(ESTADOS_TRAMO_PROYECCION).not.toContain(e)
  })
})

describe('gateAgregadoDe — el PEOR estado gana (chip de la bandeja GA)', () => {
  const d = (estado: 'al_dia' | 'con_novedad' | undefined, activa = true, nombre = 'X') =>
    ({ sst_gate: estado ? { estado } : undefined, activa, contratista_nombre: nombre }) as never
  it('con_novedad > pendiente > al_dia; el desglose nombra a cada contratista', () => {
    expect(gateAgregadoDe([d('al_dia'), d('con_novedad', true, 'Héctor')]).estado).toBe('con_novedad')
    expect(gateAgregadoDe([d('al_dia'), d(undefined)]).estado).toBe('pendiente')
    const ag = gateAgregadoDe([d('al_dia', true, 'A'), d('al_dia', true, 'B')])
    expect(ag.estado).toBe('al_dia')
    expect(ag.detalle).toEqual(['A: al_dia', 'B: al_dia'])
  })
  it('las huérfanas (activa false) NO pesan; sin vivas → pendiente (la ausencia jamás es aval)', () => {
    expect(gateAgregadoDe([d('con_novedad', false), d('al_dia')]).estado).toBe('al_dia')
    expect(gateAgregadoDe([d('con_novedad', false)]).estado).toBe('pendiente')
    expect(gateAgregadoDe([]).estado).toBe('pendiente')
  })
})

describe('idVerificacion [R1]', () => {
  it('determinístico {pid}__{cid}', () => {
    expect(idVerificacion('p1', 'contratista_004')).toBe('p1__contratista_004')
  })
})
