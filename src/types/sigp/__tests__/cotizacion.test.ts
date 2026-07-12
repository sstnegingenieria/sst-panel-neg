import { describe, it, expect } from 'vitest'
import {
  calcularTotales, valorTotalItem, TRANSICIONES, puedeNuevaVersion,
  precioDesdeCosto, margenDesdePrecio, costoDirectoAPU, asignarCodigosINP, colorSeguimiento,
  subtotalesPorGrupo, modoAgrupacionDe, actividadesDe, GRUPO_OTROS_ID,
  conInstanciaIds, sembrarActividadesDesdeCapitulos, esItemBloqueado, patchInstancia,
} from '../cotizacion'
import type { ItemCotizacion, Actividad } from '../cotizacion'

const item = (valor_total: number): ItemCotizacion => ({
  origen: 'manual', codigo: '', descripcion: 'x', unidad: 'und',
  valor_unitario: 0, cantidad: 0, valor_total,
})

describe('valorTotalItem', () => {
  it('redondea valor_unitario * cantidad a peso', () => {
    expect(valorTotalItem(1333, 3)).toBe(3999)
    expect(valorTotalItem(1333.33, 3)).toBe(4000)   // 3999.99 → 4000
    expect(valorTotalItem(100.4, 1)).toBe(100)      // 100.4 → 100
  })
})

describe('calcularTotales — iva_pleno', () => {
  it('IVA sobre el subtotal, redondeado', () => {
    const t = calcularTotales([item(3999)], 'iva_pleno', undefined, 19)
    expect(t.costos_directos).toBe(3999)
    expect(t.base_iva).toBe(3999)
    expect(t.iva).toBe(760)          // round(3999 * 0.19 = 759.81)
    expect(t.total).toBe(4759)
  })
})

describe('calcularTotales — aiu', () => {
  it('A/I/U sobre CD e IVA SOLO sobre la Utilidad, cada componente redondeado', () => {
    const t = calcularTotales([item(1_000_000)], 'aiu', { admin: 10, imprevistos: 6, utilidad: 8 }, 19)
    expect(t.costos_directos).toBe(1_000_000)
    expect(t.admin).toBe(100_000)
    expect(t.imprevistos).toBe(60_000)
    expect(t.utilidad).toBe(80_000)
    expect(t.base_iva).toBe(80_000)  // IVA solo sobre U
    expect(t.iva).toBe(15_200)       // round(80000 * 0.19)
    expect(t.total).toBe(1_255_200)
  })

  it('redondea cada componente al final (CD con decimales)', () => {
    const t = calcularTotales([item(1_234_567)], 'aiu', { admin: 10, imprevistos: 6, utilidad: 8 }, 19)
    expect(t.costos_directos).toBe(1_234_567)
    expect(t.admin).toBe(123_457)        // round(123456.7)
    expect(t.imprevistos).toBe(74_074)   // round(74074.02)
    expect(t.utilidad).toBe(98_765)      // round(98765.36)
    expect(t.iva).toBe(18_765)           // round(98765 * 0.19 = 18765.35)
    expect(t.total).toBe(1_234_567 + 123_457 + 74_074 + 98_765 + 18_765)
  })

  it('suma los valor_total de varios ítems como CD', () => {
    const t = calcularTotales([item(1000), item(2500), item(500)], 'iva_pleno', undefined, 19)
    expect(t.costos_directos).toBe(4000)
  })
})

// ── F1.5.2a — agrupación por capítulo / actividad (entidad propia) ────────────

const inst = (p: Partial<ItemCotizacion>): ItemCotizacion => ({
  origen: 'manual', codigo: '', descripcion: 'x', unidad: 'und',
  valor_unitario: 0, cantidad: 0, valor_total: 0, ...p,
})

describe('subtotalesPorGrupo — modo capitulo', () => {
  it('agrupa por capitulo en orden de aparición; sin capítulo → "Otros"', () => {
    const r = subtotalesPorGrupo([
      inst({ capitulo: 'Redes MT', valor_total: 1000 }),
      inst({ valor_total: 50 }),                          // sin capítulo
      inst({ capitulo: 'Obra civil', valor_total: 300 }),
      inst({ capitulo: 'Redes MT', valor_total: 200 }),
      inst({ capitulo: '  ', valor_total: 25 }),          // solo espacios = sin capítulo
    ], 'capitulo')
    expect(r).toEqual([
      { grupo_id: 'Redes MT', grupo_nombre: 'Redes MT', orden: 0, subtotal: 1200 },
      { grupo_id: GRUPO_OTROS_ID, grupo_nombre: 'Otros', orden: 1, subtotal: 75 },
      { grupo_id: 'Obra civil', grupo_nombre: 'Obra civil', orden: 2, subtotal: 300 },
    ])
  })
})

describe('subtotalesPorGrupo — modo actividad', () => {
  const acts: Actividad[] = [
    { id: 'a2', nombre: 'Adecuación torre', orden: 1 },
    { id: 'a1', nombre: 'Obra preliminar', orden: 0 },   // declarada fuera de orden
    { id: 'a3', nombre: 'Cierre y aseo', orden: 2 },     // sin ítems
  ]

  it('agrupa por actividad_id, respeta el orden de las actividades e incluye las vacías', () => {
    const r = subtotalesPorGrupo([
      inst({ actividad_id: 'a2', valor_total: 500 }),
      inst({ actividad_id: 'a1', valor_total: 100 }),
      inst({ actividad_id: 'a2', valor_total: 250 }),
    ], 'actividad', acts)
    expect(r).toEqual([
      { grupo_id: 'a1', grupo_nombre: 'Obra preliminar', orden: 0, subtotal: 100 },
      { grupo_id: 'a2', grupo_nombre: 'Adecuación torre', orden: 1, subtotal: 750 },
      { grupo_id: 'a3', grupo_nombre: 'Cierre y aseo', orden: 2, subtotal: 0 },
    ])
  })

  it('mismo codigo en dos actividades con cantidades distintas → dos subtotales sin colisión', () => {
    const r = subtotalesPorGrupo([
      inst({ codigo: 'CAT-0001', cantidad: 2, valor_total: 2000, actividad_id: 'a1' }),
      inst({ codigo: 'CAT-0001', cantidad: 5, valor_total: 5000, actividad_id: 'a2' }),
    ], 'actividad', acts)
    expect(r.find(g => g.grupo_id === 'a1')?.subtotal).toBe(2000)
    expect(r.find(g => g.grupo_id === 'a2')?.subtotal).toBe(5000)
  })

  it('instancias huérfanas (sin actividad o con id no declarado) → "Otros" al final', () => {
    const r = subtotalesPorGrupo([
      inst({ actividad_id: 'a1', valor_total: 100 }),
      inst({ valor_total: 40 }),
      inst({ actividad_id: 'no-existe', valor_total: 60 }),
    ], 'actividad', acts)
    const otros = r[r.length - 1]
    expect(otros).toEqual({ grupo_id: GRUPO_OTROS_ID, grupo_nombre: 'Otros', orden: 3, subtotal: 100 })
  })
})

describe('calcularTotales + agrupación (F1.5.2a)', () => {
  const items = [
    inst({ capitulo: 'A', actividad_id: 'a1', valor_total: 1_000_000 }),
    inst({ capitulo: 'B', actividad_id: 'a2', valor_total: 234_567 }),
    inst({ actividad_id: 'a1', valor_total: 500 }),
  ]

  it('Σ subtotales por grupo = costos_directos (antes de impuestos), en ambos modos', () => {
    for (const agrupacion of [
      { modo: 'capitulo' as const },
      { modo: 'actividad' as const, actividades: [{ id: 'a1', nombre: 'X', orden: 0 }, { id: 'a2', nombre: 'Y', orden: 1 }] },
    ]) {
      const t = calcularTotales(items, 'aiu', { admin: 10, imprevistos: 6, utilidad: 8 }, 19, agrupacion)
      const suma = t.subtotales_por_grupo!.reduce((s, g) => s + g.subtotal, 0)
      expect(suma).toBe(t.costos_directos)
    }
  })

  it('los impuestos son idénticos con y sin agrupación (misma matemática de versión)', () => {
    const sin = calcularTotales(items, 'aiu', { admin: 10, imprevistos: 6, utilidad: 8 }, 19)
    const con = calcularTotales(items, 'aiu', { admin: 10, imprevistos: 6, utilidad: 8 }, 19, { modo: 'capitulo' })
    const { subtotales_por_grupo: _d, ...conSinDesglose } = con
    expect(conSinDesglose).toEqual(sin)
    expect(sin.subtotales_por_grupo).toBeUndefined()   // llamadas históricas: resultado intacto
  })
})

describe('retrocompatibilidad F1.5.2a (defaults lazy, sin migración)', () => {
  it('versión sin modo_agrupacion se comporta como capitulo con actividades []', () => {
    const versionVieja = {} as { modo_agrupacion?: undefined; actividades?: undefined }
    expect(modoAgrupacionDe(versionVieja)).toBe('capitulo')
    expect(actividadesDe(versionVieja)).toEqual([])
    const r = subtotalesPorGrupo(
      [inst({ capitulo: 'Redes MT', valor_total: 700 })],
      modoAgrupacionDe(versionVieja),
      actividadesDe(versionVieja),
    )
    expect(r).toEqual([{ grupo_id: 'Redes MT', grupo_nombre: 'Redes MT', orden: 0, subtotal: 700 }])
  })
})

describe('conInstanciaIds (F1.5.2b — default lazy)', () => {
  it('asigna instancia_id a líneas sin él y respeta los existentes', () => {
    const orig = [inst({ instancia_id: 'fijo-1' }), inst({})]
    const r = conInstanciaIds(orig)
    expect(r[0].instancia_id).toBe('fijo-1')
    expect(r[1].instancia_id).toBeTruthy()
    expect(orig[1].instancia_id).toBeUndefined()   // no muta
  })
})

describe('sembrarActividadesDesdeCapitulos (F1.5.2b)', () => {
  it('una actividad por capítulo (orden de aparición, sin capítulo → Otros) e ítems asignados', () => {
    const { actividades, items } = sembrarActividadesDesdeCapitulos([
      inst({ capitulo: 'Redes MT', valor_total: 1 }),
      inst({ valor_total: 2 }),
      inst({ capitulo: 'Obra civil', valor_total: 3 }),
      inst({ capitulo: 'Redes MT', valor_total: 4 }),
    ])
    expect(actividades.map(a => [a.nombre, a.orden])).toEqual([['Redes MT', 0], ['Otros', 1], ['Obra civil', 2]])
    const idDe = (n: string) => actividades.find(a => a.nombre === n)!.id
    expect(items.map(i => i.actividad_id)).toEqual([idDe('Redes MT'), idDe('Otros'), idDe('Obra civil'), idDe('Redes MT')])
    // la siembra + subtotales por actividad reproduce los grupos de capítulo
    const sub = subtotalesPorGrupo(items, 'actividad', actividades)
    expect(sub.map(g => [g.grupo_nombre, g.subtotal])).toEqual([['Redes MT', 5], ['Otros', 2], ['Obra civil', 3]])
  })
})

describe('asignarCodigosINP — por línea (b-fix: comportamiento F1.4 restaurado)', () => {
  const it_ = (origen: ItemCotizacion['origen'], codigo: string): ItemCotizacion => ({
    origen, codigo, descripcion: 'x', unidad: 'und', valor_unitario: 0, cantidad: 1, valor_total: 0,
  })

  it('cada línea temporal recibe su propio INP, incluso si dos traen el mismo código viejo', () => {
    const r = asignarCodigosINP([
      it_('manual', 'INP-005'),
      it_('manual', ''),
      it_('manual', 'INP-005'),
    ])
    expect(r.map(x => x.codigo)).toEqual(['INP-001', 'INP-002', 'INP-003'])
  })

  it('líneas con código vacío reciben números propios', () => {
    const r = asignarCodigosINP([it_('manual', ''), it_('manual', '')])
    expect(r.map(x => x.codigo)).toEqual(['INP-001', 'INP-002'])
  })
})

describe('bloqueo de snapshots LPU/catálogo (b-fix): esItemBloqueado + patchInstancia', () => {
  const lpu = (): ItemCotizacion => ({
    origen: 'lpu', codigo: 'RED-001', descripcion: 'Tendido de cable MT 15kV', unidad: 'm',
    valor_unitario: 45_000, cantidad: 10, valor_total: 450_000, lpu_id: 'L1', lpu_item_id: 'i1',
  })
  const cat = (): ItemCotizacion => ({
    origen: 'apu', codigo: 'CAT-0001', descripcion: 'Postes a instalar', unidad: 'und',
    valor_unitario: 1_074_241, cantidad: 2, valor_total: 2_148_482, catalogo_id: 'doc1', costo_directo: 966_816.5,
  })
  const manual = (): ItemCotizacion => ({
    origen: 'manual', codigo: 'INP-001', descripcion: 'Excavación', unidad: 'm3',
    valor_unitario: 37_500, cantidad: 48, valor_total: 1_800_000,
  })

  it('esItemBloqueado: lpu y catálogo sí; manual (incluso con APU propio) no', () => {
    expect(esItemBloqueado(lpu())).toBe(true)
    expect(esItemBloqueado(cat())).toBe(true)
    expect(esItemBloqueado(manual())).toBe(false)
    expect(esItemBloqueado({ origen: 'apu' })).toBe(false)   // APU manual sin catálogo
  })

  it('lpu: IGNORA cambios a codigo/descripcion/unidad/valor_unitario (ni por código se muta)', () => {
    const r = patchInstancia(lpu(), { codigo: 'HACK', descripcion: 'x', unidad: 'kg', valor_unitario: 1 })
    expect(r.codigo).toBe('RED-001')
    expect(r.descripcion).toBe('Tendido de cable MT 15kV')
    expect(r.unidad).toBe('m')
    expect(r.valor_unitario).toBe(45_000)
    expect(r.valor_total).toBe(450_000)
  })

  it('catálogo: igual de bloqueado; margen directo también se ignora (alteraría el precio)', () => {
    const r = patchInstancia(cat(), { valor_unitario: 999, margen: 50, descripcion: 'x' })
    expect(r.valor_unitario).toBe(1_074_241)
    expect(r.descripcion).toBe('Postes a instalar')
    expect(r.margen).toBeUndefined()
  })

  it('bloqueado: cantidad SÍ es editable y recalcula valor_total', () => {
    const r = patchInstancia(lpu(), { cantidad: 25 })
    expect(r.cantidad).toBe(25)
    expect(r.valor_total).toBe(1_125_000)
  })

  it('manual: todos los campos editables, goal-seek intacto', () => {
    const r1 = patchInstancia(manual(), { valor_unitario: 40_000, descripcion: 'Excavación mecánica' })
    expect(r1.valor_unitario).toBe(40_000)
    expect(r1.descripcion).toBe('Excavación mecánica')
    expect(r1.valor_total).toBe(1_920_000)
    // goal-seek: costo + margen → precio
    const r2 = patchInstancia({ ...manual(), costo_directo: 90_000 }, { margen: 10 })
    expect(r2.valor_unitario).toBe(100_000)
  })

  it('bloqueado: costo interno editable re-deriva el margen sin tocar el precio', () => {
    const r = patchInstancia(lpu(), { costo_directo: 40_500 })
    expect(r.valor_unitario).toBe(45_000)          // precio intacto
    expect(r.margen).toBeCloseTo(10)               // (1 - 40500/45000) × 100
  })
})

describe('precioDesdeCosto', () => {
  it('factor 0,9 del Excel = margen 10: costo 90.000 → precio 100.000', () => {
    expect(precioDesdeCosto(90_000, 10)).toBeCloseTo(100_000)
  })
  it('margen 0 → precio = costo', () => {
    expect(precioDesdeCosto(45_000, 0)).toBe(45_000)
  })
  it('rechaza margen fuera de [0, 100) y costo negativo', () => {
    expect(precioDesdeCosto(1000, 100)).toBeNull()   // división por cero
    expect(precioDesdeCosto(1000, 120)).toBeNull()   // precio negativo
    expect(precioDesdeCosto(1000, -5)).toBeNull()
    expect(precioDesdeCosto(-1, 10)).toBeNull()
    expect(precioDesdeCosto(NaN, 10)).toBeNull()
  })
})

describe('margenDesdePrecio', () => {
  it('inversa de precioDesdeCosto', () => {
    expect(margenDesdePrecio(90_000, 100_000)).toBeCloseTo(10)
  })
  it('negativo cuando se vende a pérdida (la UI alerta)', () => {
    expect(margenDesdePrecio(120_000, 100_000)).toBeCloseTo(-20)
  })
  it('null con precio <= 0', () => {
    expect(margenDesdePrecio(1000, 0)).toBeNull()
    expect(margenDesdePrecio(1000, -5)).toBeNull()
  })
})

describe('costoDirectoAPU', () => {
  const insumo = (subtotal: number) => ({ descripcion: 'x', unidad: 'und', rendimiento: 0.0909, costo_unitario: 1, subtotal })

  it('suma los subtotales de las 5 secciones canónicas (con secciones vacías)', () => {
    expect(costoDirectoAPU({
      mano_obra: [insumo(1000)],
      materiales: [insumo(1500.5), insumo(200)],
      equipo: [insumo(300)],
      transporte: [],
      herramienta_menor: [insumo(50)],
    })).toBeCloseTo(3050.5)
  })

  it('subtotal por rendimiento: rendimiento × costo_unitario con decimales finos', () => {
    // 0.0909 jornal × $ 185.000 = $ 16.816,5 (precisión completa, sin redondear)
    expect(0.0909 * 185_000).toBeCloseTo(16_816.5)
    expect(costoDirectoAPU({
      mano_obra: [{ descripcion: 'Cuadrilla', unidad: 'jornal', rendimiento: 0.0909, costo_unitario: 185_000, subtotal: 0.0909 * 185_000 }],
      materiales: [], equipo: [], transporte: [], herramienta_menor: [],
    })).toBeCloseTo(16_816.5)
  })
})

describe('asignarCodigosINP', () => {
  const it_ = (origen: ItemCotizacion['origen'], codigo: string): ItemCotizacion => ({
    origen, codigo, descripcion: 'x', unidad: 'und', valor_unitario: 0, cantidad: 1, valor_total: 0,
  })

  it('numera manual/apu sin código o INP-* en orden; respeta LPU, CAT y códigos tecleados', () => {
    const res = asignarCodigosINP([
      it_('lpu', 'RED-001'),        // LPU: intacto
      it_('manual', ''),            // → INP-001
      it_('apu', 'INP-007'),        // renumera → INP-002
      it_('manual', 'CAT-0004'),    // incorporado al catálogo: intacto
      it_('manual', 'MI-COD'),      // tecleado por el usuario: intacto
      it_('apu', ''),               // → INP-003
    ])
    expect(res.map(r => r.codigo)).toEqual(['RED-001', 'INP-001', 'INP-002', 'CAT-0004', 'MI-COD', 'INP-003'])
  })

  it('no muta el array original', () => {
    const orig = [it_('manual', '')]
    asignarCodigosINP(orig)
    expect(orig[0].codigo).toBe('')
  })
})

describe('colorSeguimiento', () => {
  it('escala verde <7 · ámbar 7–14 · naranja 15–29 · rojo >=30', () => {
    expect(colorSeguimiento(0)).toContain('emerald')
    expect(colorSeguimiento(6)).toContain('emerald')
    expect(colorSeguimiento(7)).toContain('amber')
    expect(colorSeguimiento(14)).toContain('amber')
    expect(colorSeguimiento(15)).toContain('orange')
    expect(colorSeguimiento(29)).toContain('orange')
    expect(colorSeguimiento(30)).toContain('red')
  })
})

describe('reglas de estado', () => {
  it('TRANSICIONES: borrador→enviada, enviada→aprobada|rechazada, terminales', () => {
    expect(TRANSICIONES.borrador).toEqual(['enviada'])
    expect(TRANSICIONES.enviada).toEqual(['aprobada', 'rechazada'])
    expect(TRANSICIONES.aprobada).toEqual([])
    expect(TRANSICIONES.rechazada).toEqual([])
  })

  it('puedeNuevaVersion: enviada/rechazada/vencida sí; borrador/aprobada no', () => {
    expect(puedeNuevaVersion('enviada')).toBe(true)
    expect(puedeNuevaVersion('rechazada')).toBe(true)
    expect(puedeNuevaVersion('vencida')).toBe(true)
    expect(puedeNuevaVersion('borrador')).toBe(false)
    expect(puedeNuevaVersion('aprobada')).toBe(false)
  })
})
