import { describe, it, expect } from 'vitest'
import { construirSnapshotProyecto, ESTADOS_PROYECTO, ESTADO_PRY_LABEL, ESTADO_PRY_COLOR } from '../proyecto'
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
  it('el ciclo de vida tiene los 12 estados, empieza en creado y termina en cerrado', () => {
    expect(ESTADOS_PROYECTO).toHaveLength(12)
    expect(ESTADOS_PROYECTO[0]).toBe('creado')
    expect(ESTADOS_PROYECTO[11]).toBe('cerrado')
    expect(new Set(ESTADOS_PROYECTO).size).toBe(12)
  })

  it('todo estado tiene label y color', () => {
    for (const e of ESTADOS_PROYECTO) {
      expect(ESTADO_PRY_LABEL[e]).toBeTruthy()
      expect(ESTADO_PRY_COLOR[e]).toMatch(/bg-/)
    }
  })
})
