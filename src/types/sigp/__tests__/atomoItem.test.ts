// Bloque átomo-ítem (29-sep): universo dual, expansión, cobertura por ítem
// (el radar de los $5M), builders con nivel y el constructor del snapshot.
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  universoDe, atomosEfectivosDe, valorAlcanceDe, coberturaDe,
  resumenAtomosPorGrupo, construirAsignacionMulti, patchAjustarAtomos,
} from '../asignacion'
import type { AsignacionContratista } from '../asignacion'
import { construirSnapshotProyecto, claveItemAlcance } from '../proyecto'
import type { VersionCotizacion } from '../cotizacion'

const ts = Timestamp.fromMillis(1_790_000_000_000)

// Snapshot del caso real: "Ensayos" $6M en 3 estudios topográficos + "Obra" $4M
const SNAP = {
  alcance: [
    { grupo: 'Ensayos y diagnóstico estructural', items: 3, subtotal: 6_000_000 },
    { grupo: 'Obra civil', items: 1, subtotal: 4_000_000 },
  ],
  items_alcance: [
    { clave: 'i1', codigo: 'TOP-1', descripcion: 'Estudio topográfico frente A', unidad: 'glb', cantidad: 1, valor_total: 1_000_000, grupo: 'Ensayos y diagnóstico estructural' },
    { clave: 'i2', codigo: 'TOP-2', descripcion: 'Estudio topográfico frente B', unidad: 'glb', cantidad: 1, valor_total: 2_000_000, grupo: 'Ensayos y diagnóstico estructural' },
    { clave: 'i3', codigo: 'TOP-3', descripcion: 'Estudio topográfico frente C', unidad: 'glb', cantidad: 1, valor_total: 3_000_000, grupo: 'Ensayos y diagnóstico estructural' },
    { clave: 'i4', descripcion: 'Demolición y retiro', unidad: 'm2', cantidad: 10, valor_total: 4_000_000, grupo: 'Obra civil' },
  ],
}
const topografo = { id: 'c1', nombre: 'Topógrafo Uno', nit: '900.1', estado: 'activo' }

const asigItem = (id: string, atomos: string[], over: Partial<AsignacionContratista> = {}): AsignacionContratista => ({
  id, atomos, atomos_nivel: 'item', estado: 'asignada', contratista_id: id, contratista_nombre: id,
  modalidad: 'todo_costo', compras_reembolsos: [], asignado_por: 'u', fecha: ts, fecha_creacion: ts,
  habilitacion_snapshot: { estado: 'activo', fecha_consulta: ts, fuente: 't' }, historial: [], ...over,
} as AsignacionContratista)

describe('universoDe — dual', () => {
  it('con items_alcance el universo es de ÍTEMS; sin él, de grupos (legacy intacto)', () => {
    expect(universoDe(SNAP).modo).toBe('item')
    expect(universoDe(SNAP).unidades).toHaveLength(4)
    const grupos = universoDe(SNAP.alcance)
    expect(grupos.modo).toBe('grupo')
    expect(grupos.unidades.map(u => u.clave)).toEqual(['Ensayos y diagnóstico estructural', 'Obra civil'])
  })
})

describe('atomosEfectivosDe — expansión de asignaciones de grupo en universo de ítems', () => {
  it('nivel grupo se expande a las claves de sus grupos; nivel item va tal cual', () => {
    const legacy = { atomos: ['Ensayos y diagnóstico estructural'] }
    expect(atomosEfectivosDe(legacy, SNAP).sort()).toEqual(['i1', 'i2', 'i3'])
    expect(atomosEfectivosDe({ atomos: ['i2'], atomos_nivel: 'item' }, SNAP)).toEqual(['i2'])
  })
  it('valorAlcanceDe: grupo expandido suma sus ítems; claves suman lo suyo', () => {
    expect(valorAlcanceDe(['Ensayos y diagnóstico estructural'], SNAP)).toBe(6_000_000)
    expect(valorAlcanceDe(['i1', 'i3'], SNAP, 'item')).toBe(4_000_000)
  })
})

describe('coberturaDe por ítem — el radar de los $5M', () => {
  it('un grupo de $6M con un solo ítem de $1M asignado YA NO se declara cubierto', () => {
    const cob = coberturaDe(SNAP, [asigItem('a1', ['i1'])])
    expect(cob.completa).toBe(false)
    const ensayos = cob.sin_asignar.find(g => g.grupo.startsWith('Ensayos'))!
    expect(ensayos.subtotal).toBe(5_000_000)      // los $5M cantan directo
    expect(ensayos.items_sin).toBe(2)
    expect(ensayos.items_total).toBe(3)
    expect(ensayos.parcial).toBe(true)
  })
  it('reparto entre dos contratistas + obra cubierta → completa', () => {
    const cob = coberturaDe(SNAP, [
      asigItem('a1', ['i1', 'i2']), asigItem('a2', ['i3']), asigItem('a3', ['i4']),
    ])
    expect(cob.completa).toBe(true)
  })
  it('una asignación LEGACY de grupo cubre sus ítems expandidos', () => {
    const legacy = asigItem('a1', ['Ensayos y diagnóstico estructural'], { atomos_nivel: undefined })
    const cob = coberturaDe(SNAP, [legacy])
    expect(cob.sin_asignar.map(g => g.grupo)).toEqual(['Obra civil'])
  })
})

describe('builder con nivel ítem — el caso real: repartir los estudios', () => {
  it('persiste claves + atomos_nivel + atomos_grupos; el historial usa etiquetas', () => {
    const a = construirAsignacionMulti(topografo, ['i1', 'i2'], 'todo_costo', undefined, SNAP, [], 'u', ts)
    expect(a.atomos).toEqual(['i1', 'i2'])
    expect(a.atomos_nivel).toBe('item')
    expect(a.atomos_grupos).toEqual(['Ensayos y diagnóstico estructural'])
    expect(a.historial[0].motivo).toContain('TOP-1')
    expect(a.historial[0].motivo).not.toContain('i1')
  })
  it('un ítem tomado por otra asignación viva LANZA con la etiqueta humana', () => {
    const otra = asigItem('a9', ['i2'])
    expect(() => construirAsignacionMulti(topografo, ['i2'], 'todo_costo', undefined, SNAP, [otra], 'u', ts))
      .toThrow(/TOP-2.*ya está asignada/)
  })
  it('el invariante también corta contra una LEGACY de grupo (sus ítems expandidos)', () => {
    const legacy = asigItem('a9', ['Ensayos y diagnóstico estructural'], { atomos_nivel: undefined })
    expect(() => construirAsignacionMulti(topografo, ['i3'], 'todo_costo', undefined, SNAP, [legacy], 'u', ts))
      .toThrow(/ya está asignada/)
  })
  it('en modo grupo (sin items_alcance) el builder sigue EXACTO como siempre', () => {
    const a = construirAsignacionMulti(topografo, ['Obra civil'], 'todo_costo', undefined, SNAP.alcance, [], 'u', ts)
    expect(a.atomos).toEqual(['Obra civil'])
    expect(a.atomos_nivel).toBeUndefined()
  })
})

describe('patchAjustarAtomos eleva a nivel ítem', () => {
  it('el ajuste sobre universo de ítems escribe claves + nivel + grupos', () => {
    const a = asigItem('a1', ['Ensayos y diagnóstico estructural'], { atomos_nivel: undefined })
    const r = patchAjustarAtomos(a, ['i1'], SNAP, [a], 'recorte al frente A', 'u', ts)!
    expect(r.sub.atomos).toEqual(['i1'])
    expect(r.sub.atomos_nivel).toBe('item')
    expect(r.sub.atomos_grupos).toEqual(['Ensayos y diagnóstico estructural'])
  })
})

describe('resumenAtomosPorGrupo — entero o partido, de un golpe', () => {
  it('completo cuando tiene TODOS los ítems del grupo; partido dice n de m', () => {
    const completo = resumenAtomosPorGrupo(asigItem('a', ['i1', 'i2', 'i3']), SNAP)
    expect(completo).toEqual([{ grupo: 'Ensayos y diagnóstico estructural', tomados: 3, total: 3, completo: true }])
    const partido = resumenAtomosPorGrupo(asigItem('a', ['i1']), SNAP)
    expect(partido[0]).toMatchObject({ tomados: 1, total: 3, completo: false })
  })
})

describe('construirSnapshotProyecto — items_alcance materializado', () => {
  it('congela clave (instancia_id), grupo con el MISMO mapeo de huérfanos, y Σ por grupo == subtotal', () => {
    const version = {
      items: [
        { instancia_id: 'u-1', codigo: 'A1', descripcion: 'x', unidad: 'm', cantidad: 1, valor_unitario: 100, valor_total: 100, origen: 'manual', capitulo: 'Cap1' },
        { instancia_id: 'u-2', codigo: 'A2', descripcion: 'y', unidad: 'm', cantidad: 1, valor_unitario: 50, valor_total: 50, origen: 'manual', capitulo: 'Cap1' },
        { codigo: 'H1', descripcion: 'huérfano sin instancia', unidad: 'm', cantidad: 1, valor_unitario: 30, valor_total: 30, origen: 'manual' },
      ],
      totales: { costos_directos: 180, iva: 0, total: 180 },
      esquema: 'iva_pleno',
    } as unknown as VersionCotizacion
    const s = construirSnapshotProyecto({ asunto: 'X' }, version)
    expect(s.items_alcance).toHaveLength(3)
    expect(s.items_alcance![0]).toMatchObject({ clave: 'u-1', grupo: 'Cap1', valor_total: 100 })
    // el huérfano sin instancia congela el fallback POR ÍNDICE del snapshot
    expect(s.items_alcance![2].clave).toBe(claveItemAlcance(version.items[2], 2))
    expect(s.items_alcance![2].grupo).toBe('Otros')
    for (const g of s.alcance) {
      const suma = s.items_alcance!.filter(it => it.grupo === g.grupo).reduce((x, it) => x + it.valor_total, 0)
      expect(suma, g.grupo).toBe(g.subtotal)
      expect(s.items_alcance!.filter(it => it.grupo === g.grupo).length).toBe(g.items)
    }
  })
})
