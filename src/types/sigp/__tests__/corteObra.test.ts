// Corte de avance de obra (07-nov) — oráculo: el contrato SENA del 058
// (AIU 10/0/5, IVA sobre la U). Principios fijados por test: el autor del
// avance SIEMPRE queda; el corte emitido es un HECHO (corregir el avance no
// cambia deltas emitidos); la versión de cambio se dice, no se silencia.
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  patchRegistrarAvance, pctItem, estadoItemAvance, valorEjecutadoItem,
  resumenEconomicoCorte, construirCorte, esCorteFacturable, aritmeticaFacturasCorte,
} from '../corteObra'
import { patchRegistrarFacturaParcial } from '../proyecto'
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
  it('sin avance nuevo → error con razón (negativo: inconsistencia; igual: nada que cobrar); sin avance capturado → error', () => {
    const corte1 = { numero_corte: 1, cd_acum: 8_000_000, cotizacion_version_medida: 3 }
    const r = construirCorte({ proyecto: conAvance(40, 0), cortesPrevios: [corte1], esquema: 'iva_pleno' })
    expect(!r.ok && r.error).toContain('POR DEBAJO')
    const igual = construirCorte({ proyecto: conAvance(40, 0), cortesPrevios: [{ ...corte1, cd_acum: 4_000_000 }], esquema: 'iva_pleno' })
    expect(!igual.ok && igual.error).toContain('no supera')
    const r2 = construirCorte({ proyecto: proyecto(), cortesPrevios: [], esquema: 'iva_pleno' })
    expect(!r2.ok && r2.error).toContain('no se arma a mano')
  })
  it('INFORMATIVO NO SE COME LA BASE: el facturable que sigue mide contra el último FACTURABLE, no el anterior a secas', () => {
    // Corte 1 FACTURABLE congeló 4M. Corte 2 INFORMATIVO congeló 6M. El corte
    // 3 facturable debe cobrar 8M − 4M = 4M (si midiera contra el 2, el
    // trabajo entre 4M y 6M jamás se cobraría).
    const previos = [
      { numero_corte: 1, cd_acum: 4_000_000, cotizacion_version_medida: 3 },                        // legacy sin tipo = facturable
      { numero_corte: 2, cd_acum: 6_000_000, cotizacion_version_medida: 3, tipo: 'informativo' as const },
    ]
    const r = construirCorte({ proyecto: conAvance(60, 20), cortesPrevios: previos, esquema: 'iva_pleno' })
    if (!r.ok) throw new Error(r.error)
    expect(r.corte.numero_corte).toBe(3)                 // el correlativo cuenta TODOS
    expect(r.corte.cd_acum).toBe(8_000_000)
    expect(r.corte.cd_acum_anterior).toBe(4_000_000)     // base = último FACTURABLE
    expect(r.corte.resumen.delta_cd).toBe(4_000_000)
    expect(r.corte.tipo).toBe('facturable')
  })
  it('el INFORMATIVO también mide contra el último facturable, congela y se rotula; ausencia de tipo = facturable', () => {
    const previos = [{ numero_corte: 1, cd_acum: 4_000_000, cotizacion_version_medida: 3 }]
    const r = construirCorte({ proyecto: conAvance(60, 20), cortesPrevios: previos, esquema: 'iva_pleno', tipo: 'informativo' })
    if (!r.ok) throw new Error(r.error)
    expect(r.corte.tipo).toBe('informativo')
    expect(r.corte.cd_acum_anterior).toBe(4_000_000)
    expect(r.corte.resumen.delta_cd).toBe(4_000_000)     // informativo: cuánto HABRÍA para cobrar hoy
    expect(esCorteFacturable(r.corte)).toBe(false)
    expect(esCorteFacturable({ tipo: undefined })).toBe(true)  // legacy
  })
  it('DELTA CERO: el informativo lo admite (constancia fechada); el facturable no (nada que cobrar)', () => {
    const previos = [{ numero_corte: 1, cd_acum: 4_000_000, cotizacion_version_medida: 3 }]
    const fact = construirCorte({ proyecto: conAvance(40, 0), cortesPrevios: previos, esquema: 'iva_pleno' })
    expect(!fact.ok && fact.error).toContain('INFORMATIVO')   // el error orienta al tipo correcto
    const info = construirCorte({ proyecto: conAvance(40, 0), cortesPrevios: previos, esquema: 'iva_pleno', tipo: 'informativo' })
    if (!info.ok) throw new Error(info.error)
    expect(info.corte.resumen.delta_cd).toBe(0)
    expect(info.corte.resumen.total).toBe(0)
    expect(info.corte.cd_acum).toBe(4_000_000)           // congela igual
  })
  it('DELTA NEGATIVO (acumulado bajo la base facturable): inconsistencia que resolver, NOMBRANDO el corte que choca — ni informativo la documenta', () => {
    const previos = [{ numero_corte: 1, consecutivo: 'CRT-2026-001', cd_acum: 8_000_000, cotizacion_version_medida: 3 }]
    const r = construirCorte({ proyecto: conAvance(40, 0), cortesPrevios: previos, esquema: 'iva_pleno', tipo: 'informativo' })
    if (r.ok) throw new Error('debió fallar')
    expect(r.error).toContain('POR DEBAJO')
    expect(r.error).toContain('CRT-2026-001')              // nombra el corte contra el que choca
    expect(r.error).toContain('inconsistencia que alguien tiene que resolver')
    // Sin consecutivo (objetos mínimos): nombra por número
    const r2 = construirCorte({ proyecto: conAvance(40, 0), cortesPrevios: [{ numero_corte: 1, cd_acum: 8_000_000, cotizacion_version_medida: 3 }], esquema: 'iva_pleno' })
    expect(!r2.ok && r2.error).toContain('N° 1')
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

describe('v2 DO-FT-MMC-24 — tres columnas fijas de ejecutado + encabezado de contrato', () => {
  const conAvance = (i1: number, i2: number, over: Record<string, unknown> = {}) => ({
    ...proyecto({
      avance_items: [
        { clave: 'i1', cantidad: i1, registros: [] },
        { clave: 'i2', cantidad: i2, registros: [] },
      ],
    } as never),
    ...over,
  }) as Parameters<typeof construirCorte>[0]['proyecto']

  it('cantidad_anterior POR CLAVE sale del último FACTURABLE — un informativo intermedio no la mueve; sin ítems congelados (legacy), anterior = 0 en corte >1 queda ausente', () => {
    const previos = [
      {
        numero_corte: 1, cd_acum: 4_000_000, cotizacion_version_medida: 3,
        items: [{ clave: 'i1', cantidad_acum: 40, valor_acum: 4_000_000 }],
      },
      {
        numero_corte: 2, cd_acum: 6_000_000, cotizacion_version_medida: 3, tipo: 'informativo' as const,
        items: [{ clave: 'i1', cantidad_acum: 60, valor_acum: 6_000_000 }],
      },
    ]
    const r = construirCorte({ proyecto: conAvance(80, 20), cortesPrevios: previos, esquema: 'iva_pleno' })
    if (!r.ok) throw new Error(r.error)
    const i1 = r.corte.items.find(i => i.clave === 'i1')!
    expect(i1.cantidad_anterior).toBe(40)        // del FACTURABLE, no del informativo (60)
    expect(i1.valor_anterior).toBe(4_000_000)
    const i2 = r.corte.items.find(i => i.clave === 'i2')!
    expect(i2.cantidad_anterior).toBe(0)         // facturable previo sin esa clave → 0
    // Corte 1: sin previos, anterior = 0 explícito
    const r1 = construirCorte({ proyecto: conAvance(40, 0), cortesPrevios: [], esquema: 'iva_pleno' })
    if (!r1.ok) throw new Error(r1.error)
    expect(r1.corte.items.find(i => i.clave === 'i1')!.cantidad_anterior).toBe(0)
    // Legacy: previo facturable SIN items congelados → anterior ausente (el PDF pinta «—», no inventa)
    const rl = construirCorte({ proyecto: conAvance(80, 20), cortesPrevios: [{ numero_corte: 1, cd_acum: 4_000_000, cotizacion_version_medida: 3 }], esquema: 'iva_pleno' })
    if (!rl.ok) throw new Error(rl.error)
    expect(rl.corte.items.find(i => i.clave === 'i1')!.cantidad_anterior).toBeUndefined()
  })

  it('contrato_resumen: inicial = vigente − Σ deltas de cambios de alcance (signo honesto); total = snapshot.valor_venta', () => {
    const p = conAvance(40, 0, {
      cambios_alcance: [
        { version: 4, delta_venta: 2_000_000 },
        { version: 5, delta_venta: -500_000 },
      ],
    })
    const r = construirCorte({ proyecto: p, cortesPrevios: [], esquema: 'iva_pleno' })
    if (!r.ok) throw new Error(r.error)
    expect(r.corte.contrato_resumen).toMatchObject({
      valor_inicial: 13_500_000,      // 15M vigente − (2M − 0.5M)
      valor_adicionales: 1_500_000,
      valor_total: 15_000_000,
    })
    // Sin cambios: inicial == total, adicionales 0
    const r0 = construirCorte({ proyecto: conAvance(40, 0), cortesPrevios: [], esquema: 'iva_pleno' })
    if (!r0.ok) throw new Error(r0.error)
    expect(r0.corte.contrato_resumen).toMatchObject({ valor_inicial: 15_000_000, valor_adicionales: 0, valor_total: 15_000_000 })
  })

  it('plazo pasa del cronograma VIGENTE tal cual; sin cronograma, los campos de plazo quedan ausentes (nada que invite a llenarse)', () => {
    const crono = { consecutivo: 'CRN-2026-002', plazo_dias: 90, fecha_inicio: '2026-10-01', fecha_fin: '2026-12-29' }
    const r = construirCorte({ proyecto: conAvance(40, 0), cortesPrevios: [], esquema: 'iva_pleno', cronogramaVigente: crono })
    if (!r.ok) throw new Error(r.error)
    expect(r.corte.contrato_resumen).toMatchObject({ plazo_dias: 90, fecha_inicio: '2026-10-01', fecha_fin: '2026-12-29', cronograma_consecutivo: 'CRN-2026-002' })
    const sin = construirCorte({ proyecto: conAvance(40, 0), cortesPrevios: [], esquema: 'iva_pleno' })
    if (!sin.ok) throw new Error(sin.error)
    expect(sin.corte.contrato_resumen!.plazo_dias).toBeUndefined()
    expect(sin.corte.contrato_resumen!.cronograma_consecutivo).toBeUndefined()
  })

  it('interventor se guarda con trim; vacío o solo espacios queda ausente', () => {
    const r = construirCorte({ proyecto: conAvance(40, 0), cortesPrevios: [], esquema: 'iva_pleno', interventor: '  Ing. Marta Ríos  ' })
    if (!r.ok) throw new Error(r.error)
    expect(r.corte.contrato_resumen!.interventor).toBe('Ing. Marta Ríos')
    const v = construirCorte({ proyecto: conAvance(40, 0), cortesPrevios: [], esquema: 'iva_pleno', interventor: '   ' })
    if (!v.ok) throw new Error(v.error)
    expect(v.corte.contrato_resumen!.interventor).toBeUndefined()
  })
})

describe('aritmética de facturas POR CORTE — facturado vs. falta, a la vista', () => {
  const ts2 = ts
  const facturas = [
    { numero: 'FE-1', valor: 3_000_000, corte_id: 'c1' },
    { numero: 'FE-2', valor: 1_000_000, corte_id: 'c1' },
    { numero: 'FE-3', valor: 9_999_999, corte_id: 'c1', anulada: { fecha: ts2, por: 'u', motivo: 'm', nota_credito: 'NC' } },
    { numero: 'FE-4', valor: 500_000, corte_id: 'c2' },
    { numero: 'FE-5', valor: 500_000 },                        // sin corte: no cuenta contra ninguno
  ]
  it('suma solo las VIVAS del mismo corte; parcial → falta; las anuladas no cuentan', () => {
    const a = aritmeticaFacturasCorte('c1', 4_638_000, facturas)
    expect(a.facturado).toBe(4_000_000)
    expect(a.falta).toBe(638_000)
    expect(a.sobrepasa).toBe(false)
    expect(a.numeros).toEqual(['FE-1', 'FE-2'])
  })
  it('superar el facturable del corte → sobrepasa (advertir con constancia, no bloquear)', () => {
    const a = aritmeticaFacturasCorte('c2', 400_000, facturas)
    expect(a.sobrepasa).toBe(true)
    expect(a.falta).toBe(0)
  })
  it('patchRegistrarFacturaParcial con corteTotal: la constancia POR CORTE va al historial', () => {
    const p = {
      estado: 'en_ejecucion' as const,
      snapshot: { valor_venta: 20_000_000 } as never,
      historial: [],
      facturas: [{ numero: 'FE-1', valor: 3_000_000, corte_id: 'c1', fecha: ts2, registrado_por: 'u', fecha_registro: ts2 }],
    }
    const r = patchRegistrarFacturaParcial(p as never, {
      numero: 'FE-2', valor: 2_000_000, corte_id: 'c1', corte_consecutivo: 'CRT-2026-001',
      fecha: ts2, registrado_por: 'u', fecha_registro: ts2,
    }, 'u', ts2, 'Marcela', 4_638_000)!
    expect(r.facturadoCorte).toBe(5_000_000)
    expect(r.sobrepasaCorte).toBe(true)
    const motivo = r.padre.historial[r.padre.historial.length - 1].motivo
    expect(motivo).toContain('Σ facturada contra el corte 5000000 de 4638000')
    expect(motivo).toContain('SUPERA SU FACTURABLE')
  })
  it('sin corteTotal (factura sin corte, o corte viejo): jamás sobrepasaCorte', () => {
    const p = { estado: 'en_ejecucion' as const, snapshot: { valor_venta: 20_000_000 } as never, historial: [] }
    const r = patchRegistrarFacturaParcial(p as never, {
      numero: 'FE-9', valor: 2_000_000, fecha: ts2, registrado_por: 'u', fecha_registro: ts2,
    }, 'u', ts2)!
    expect(r.sobrepasaCorte).toBe(false)
    expect(r.facturadoCorte).toBe(0)
  })
})
