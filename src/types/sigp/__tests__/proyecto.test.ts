import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  construirSnapshotProyecto, ESTADOS_PROYECTO, ESTADO_PRY_LABEL, ESTADO_PRY_COLOR,
  contratistaAsignable, construirAsignacion, ESTADOS_PERMISOS, PERMISOS_LABEL, PERMISOS_COLOR,
  ANTICIPO_PCT_DEFAULT, utilidadDe, margenPctDe, anticipoValorDe, saldoValorDe,
  contratistaDesdeMargen, claveItemAlcance,
  ESTADO_INICIO_ADMINISTRATIVA, TIPOS_SOPORTE, TIPO_SOPORTE_LABEL,
  CRITERIOS_EVALUACION, esPuntajeValido, promedioEvaluacion,
} from '../proyecto'
import { precioDesdeCosto, margenDesdePrecio } from '../cotizacion'
import type { ItemCotizacion, VersionCotizacion, Actividad } from '../cotizacion'

// ── fixtures mínimos ──

const item = (over: Partial<ItemCotizacion>): ItemCotizacion => ({
  instancia_id: 'i1', codigo: 'INP-001', descripcion: 'Ítem', unidad: 'm',
  cantidad: 1, valor_unitario: 100, valor_total: 100, origen: 'manual',
  ...over,
} as ItemCotizacion)

const version = (over: Partial<VersionCotizacion>): VersionCotizacion => ({
  id: '1', version: 1, esquema: 'iva_pleno', iva_pct: 19,
  items: [], condiciones: { moneda: 'COP', forma_pago: '', tiempo_ejecucion: '', garantia: '' },
  totales: { costos_directos: 0, iva: 0, total: 0 },
  ...over,
} as unknown as VersionCotizacion)

const actividades: Actividad[] = [
  { id: 'a1', nombre: 'Redes MT', orden: 1 },
  { id: 'a2', nombre: 'Obras civiles', orden: 2 },
]

describe('construirSnapshotProyecto', () => {
  it('copia los datos de presentación y el valor de venta del total aprobado', () => {
    const s = construirSnapshotProyecto(
      { asunto: 'Adecuaciones Ráquira', contacto: 'Ana Pérez', tipo_inversion: 'capex' },
      version({ esquema: 'aiu', totales: { costos_directos: 100, admin: 12, imprevistos: 3, utilidad: 8, iva: 2, total: 125 } as never }),
      'INGEMEC S.A.S.', '901.234.567-8',
    )
    expect(s.cliente).toBe('INGEMEC S.A.S.')
    expect(s.cliente_nit).toBe('901.234.567-8')
    expect(s.asunto).toBe('Adecuaciones Ráquira')
    expect(s.contacto).toBe('Ana Pérez')
    expect(s.valor_venta).toBe(125)
    expect(s.esquema_tributario).toBe('aiu')
    expect(s.tipo_inversion).toBe('capex')
  })

  it('cae al prospecto cuando no hay cliente y omite opcionales vacíos', () => {
    const s = construirSnapshotProyecto(
      { asunto: 'X', prospecto_nombre: 'Prospecto SAS' },
      version({}),
    )
    expect(s.cliente).toBe('Prospecto SAS')
    expect(s.cliente_nit).toBeUndefined()
    expect(s.contacto).toBeUndefined()
    expect(s.tipo_inversion).toBeUndefined()
  })

  it('resume el alcance por ACTIVIDAD con conteo y subtotales (huérfanos → Otros)', () => {
    const items = [
      item({ instancia_id: '1', actividad_id: 'a1', valor_total: 100 }),
      item({ instancia_id: '2', actividad_id: 'a1', valor_total: 50 }),
      item({ instancia_id: '3', actividad_id: 'a2', valor_total: 30 }),
      item({ instancia_id: '4', valor_total: 20 }),               // huérfano
    ]
    const s = construirSnapshotProyecto(
      { asunto: 'X' },
      version({ modo_agrupacion: 'actividad', actividades, items }),
    )
    expect(s.total_items).toBe(4)
    const porNombre = Object.fromEntries(s.alcance.map(g => [g.grupo, g]))
    expect(porNombre['Redes MT'].items).toBe(2)
    expect(porNombre['Redes MT'].subtotal).toBe(150)
    expect(porNombre['Obras civiles'].items).toBe(1)
    expect(porNombre['Otros'].items).toBe(1)
    expect(porNombre['Otros'].subtotal).toBe(20)
  })

  it('resume el alcance por CAPÍTULO (default sin modo_agrupacion)', () => {
    const items = [
      item({ instancia_id: '1', capitulo: 'Preliminares', valor_total: 10 }),
      item({ instancia_id: '2', capitulo: 'Preliminares', valor_total: 15 }),
      item({ instancia_id: '3', capitulo: 'Instalación', valor_total: 40 }),
    ]
    const s = construirSnapshotProyecto({ asunto: 'X' }, version({ items }))
    const porNombre = Object.fromEntries(s.alcance.map(g => [g.grupo, g]))
    expect(porNombre['Preliminares'].items).toBe(2)
    expect(porNombre['Preliminares'].subtotal).toBe(25)
    expect(porNombre['Instalación'].items).toBe(1)
  })
})

describe('estados del proyecto', () => {
  it('el ciclo de vida tiene los 15 estados, empieza en creado y termina en cerrado', () => {
    expect(ESTADOS_PROYECTO).toHaveLength(15)
    expect(ESTADOS_PROYECTO[0]).toBe('creado')
    expect(ESTADOS_PROYECTO[ESTADOS_PROYECTO.length - 1]).toBe('cerrado')
    expect(new Set(ESTADOS_PROYECTO).size).toBe(15)
    // F2.1.c: definida entra justo antes de aprobada
    expect(ESTADOS_PROYECTO.indexOf('preliquidacion_definida'))
      .toBe(ESTADOS_PROYECTO.indexOf('preliquidacion_aprobada') - 1)
    // F2.1.d: la secuencia de ejecución hasta el handoff es contigua
    const seq = ['en_ejecucion', 'ejecutado', 'entregado_cliente', 'soporte_recibido', 'enviado_a_facturacion']
    const base = ESTADOS_PROYECTO.indexOf('en_ejecucion')
    seq.forEach((e, i) => expect(ESTADOS_PROYECTO[base + i]).toBe(e))
    // el tramo de Administrativa (futuro) arranca en facturado, justo tras el handoff
    expect(ESTADO_INICIO_ADMINISTRATIVA).toBe('facturado')
    expect(ESTADOS_PROYECTO.indexOf('facturado')).toBe(ESTADOS_PROYECTO.indexOf('enviado_a_facturacion') + 1)
  })

  it('todo estado tiene label y color', () => {
    for (const e of ESTADOS_PROYECTO) {
      expect(ESTADO_PRY_LABEL[e]).toBeTruthy()
      expect(ESTADO_PRY_COLOR[e]).toMatch(/bg-/)
    }
  })
})

describe('asignación de contratista (F2.1.b)', () => {
  const habilitado = { id: 'c1', nombre: 'Redes y Alturas SAS', nit: '901.111.222-3', estado: 'activo' }
  const ahora = Timestamp.fromMillis(1_760_000_000_000)

  it('el gate solo deja pasar contratistas habilitados (estado activo)', () => {
    expect(contratistaAsignable({ estado: 'activo' })).toBe(true)
    expect(contratistaAsignable({ estado: 'inactivo' })).toBe(false)
    expect(contratistaAsignable({})).toBe(false)
  })

  it('congela nombre, documento y habilitación como snapshot con trazabilidad', () => {
    const a = construirAsignacion(habilitado, 'uid-1', ahora, '  Mejor tarifa en alturas  ')
    expect(a.contratista_id).toBe('c1')
    expect(a.contratista_nombre).toBe('Redes y Alturas SAS')
    expect(a.contratista_documento).toBe('901.111.222-3')
    expect(a.habilitacion_snapshot.estado).toBe('activo')
    expect(a.habilitacion_snapshot.fuente).toContain('contratistas.estado')
    expect(a.habilitacion_snapshot.fecha_consulta).toBe(ahora)
    expect(a.asignado_por).toBe('uid-1')
    expect(a.nota_criterio).toBe('Mejor tarifa en alturas')
  })

  it('usa la cédula como documento si no hay NIT y omite la nota vacía', () => {
    const a = construirAsignacion({ id: 'c2', nombre: 'Juan Pérez', cedula: '1.234.567', estado: 'activo' }, 'uid-1', ahora, '   ')
    expect(a.contratista_documento).toBe('1.234.567')
    expect(a.nota_criterio).toBeUndefined()
  })

  it('LANZA si el contratista no está habilitado — el gate no es solo de UI', () => {
    expect(() => construirAsignacion({ id: 'c3', nombre: 'X', estado: 'inactivo' }, 'uid-1', ahora))
      .toThrow(/habilitados/)
  })
})

describe('preliquidación (F2.1.c)', () => {
  const pre = { valor_venta: 36_149_760, valor_contratista: 20_000_000, anticipo_pct: 50 }

  it('deriva utilidad y margen con precisión completa', () => {
    expect(utilidadDe(pre)).toBe(16_149_760)
    expect(margenPctDe(pre)).toBeCloseTo(44.67, 2)
  })

  it('deriva anticipo y saldo del % configurable (default 50)', () => {
    expect(ANTICIPO_PCT_DEFAULT).toBe(50)
    expect(anticipoValorDe(pre)).toBe(10_000_000)
    expect(saldoValorDe(pre)).toBe(10_000_000)
    const pre65 = { ...pre, anticipo_pct: 65 }
    expect(anticipoValorDe(pre65)).toBe(13_000_000)
    expect(saldoValorDe(pre65)).toBe(7_000_000)
    // anticipo + saldo = valor_contratista SIEMPRE (aritmética exacta)
    expect(anticipoValorDe(pre65) + saldoValorDe(pre65)).toBe(pre65.valor_contratista)
  })

  it('utilidad negativa cuando el contratista supera la venta; margen 0 si venta 0', () => {
    expect(utilidadDe({ valor_venta: 10, valor_contratista: 15 })).toBe(-5)
    expect(margenPctDe({ valor_venta: 0, valor_contratista: 5 })).toBe(0)
  })

  it('claveItemAlcance es estable: instancia_id > código+índice > índice', () => {
    expect(claveItemAlcance({ instancia_id: 'abc', codigo: 'INP-001' }, 3)).toBe('abc')
    expect(claveItemAlcance({ codigo: 'INP-001' }, 3)).toBe('cod:INP-001:3')
    expect(claveItemAlcance({ codigo: '  ' }, 5)).toBe('idx:5')
    expect(claveItemAlcance({}, 0)).toBe('idx:0')
    // dos ítems con el MISMO código no colisionan (índice en la clave)
    expect(claveItemAlcance({ codigo: 'X' }, 1)).not.toBe(claveItemAlcance({ codigo: 'X' }, 2))
  })

  it('la palanca de margen usa EXACTAMENTE la convención del APU y es bidireccional', () => {
    const venta = 36_149_760
    // margen 30% → contratista = venta × 0.7
    const contratista = contratistaDesdeMargen(venta, 30)
    expect(contratista).toBeCloseTo(25_304_832, 6)
    // ida y vuelta exacta con el derivado del proyecto…
    expect(margenPctDe({ valor_venta: venta, valor_contratista: contratista })).toBeCloseTo(30, 10)
    // …y con los helpers del APU del cotizador (misma fórmula):
    // precioDesdeCosto(costo, margen) reconstruye la venta desde el contratista
    expect(precioDesdeCosto(contratista, 30)).toBeCloseTo(venta, 6)
    expect(margenDesdePrecio(contratista, venta)).toBeCloseTo(30, 10)
  })
})

describe('ejecución y evaluación (F2.1.d)', () => {
  it('los tipos de soporte del cliente tienen label', () => {
    expect(TIPOS_SOPORTE).toEqual(['orden_pago', 'orden_compra', 'liquidacion'])
    for (const t of TIPOS_SOPORTE) expect(TIPO_SOPORTE_LABEL[t]).toBeTruthy()
  })

  it('esPuntajeValido acepta enteros 1–5 y rechaza el resto', () => {
    expect(esPuntajeValido(1)).toBe(true)
    expect(esPuntajeValido(5)).toBe(true)
    expect(esPuntajeValido(0)).toBe(false)
    expect(esPuntajeValido(6)).toBe(false)
    expect(esPuntajeValido(3.5)).toBe(false)
    expect(esPuntajeValido(undefined)).toBe(false)
  })

  it('promedioEvaluacion promedia los 4 criterios', () => {
    expect(promedioEvaluacion({ calidad: 5, cumplimiento: 4, sst: 5, documentacion: 4 })).toBe(4.5)
    expect(promedioEvaluacion({ calidad: 3, cumplimiento: 3, sst: 3, documentacion: 3 })).toBe(3)
    expect(CRITERIOS_EVALUACION.map(c => c.key)).toEqual(['calidad', 'cumplimiento', 'sst', 'documentacion'])
  })
})

describe('permisos de ingreso (F2.1.b)', () => {
  it('los 4 estados tienen label y color', () => {
    expect(ESTADOS_PERMISOS).toHaveLength(4)
    for (const e of ESTADOS_PERMISOS) {
      expect(PERMISOS_LABEL[e]).toBeTruthy()
      expect(PERMISOS_COLOR[e]).toMatch(/bg-/)
    }
  })
})
