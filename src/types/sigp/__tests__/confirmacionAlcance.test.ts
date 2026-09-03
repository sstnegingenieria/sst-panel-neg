// P1 — guard al aprobar la cotización: la afirmación registrada.
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { confirmacionAlcanceDe, subtotalesPorGrupo } from '../cotizacion'
import type { ItemCotizacion, Actividad } from '../cotizacion'

const ts = Timestamp.fromDate(new Date('2026-09-03T12:00:00Z'))

describe('confirmacionAlcanceDe — afirmación de quien aprueba', () => {
  it('registra la afirmación literal con lo que se VIO en pantalla', () => {
    expect(confirmacionAlcanceDe('uidGio', ts, 4, { grupos: 5, total: 105_622_769 })).toEqual({
      alcance_tal_cual: true,
      por: 'uidGio',
      fecha: ts,
      version: 4,
      grupos: 5,
      total: 105_622_769,
    })
  })

  it('el tipo solo admite la afirmación positiva — "pidió cambios" nunca llega a este registro', () => {
    const c = confirmacionAlcanceDe('u', ts, 1, { grupos: 1, total: 100 })
    // alcance_tal_cual es el literal `true` por tipo: la vía negativa bloquea
    // la aprobación en la UI y no produce documento.
    expect(c.alcance_tal_cual).toBe(true)
  })
})

describe('el alcance que pinta el guard es la MISMA fuente del PDF (subtotalesPorGrupo)', () => {
  const item = (actividad_id: string, valor_total: number): ItemCotizacion => ({
    origen: 'manual', codigo: '', descripcion: 'x', unidad: 'und',
    valor_unitario: 0, cantidad: 1, valor_total, instancia_id: actividad_id + valor_total,
    actividad_id,
  })
  const actividades: Actividad[] = [
    { id: 'a1', nombre: 'Ensayos y diagnóstico estructural', orden: 0 },
    { id: 'a2', nombre: 'Reforzamiento Fibra de Carbono (opcional)', orden: 1 },
  ]

  it('lista cada actividad con su subtotal — lo que Megacenter necesitaba ver', () => {
    const grupos = subtotalesPorGrupo(
      [item('a1', 6_463_735), item('a2', 36_904_228)], 'actividad', actividades)
    expect(grupos.map(g => [g.grupo_nombre, g.subtotal])).toEqual([
      ['Ensayos y diagnóstico estructural', 6_463_735],
      ['Reforzamiento Fibra de Carbono (opcional)', 36_904_228],
    ])
  })
})
