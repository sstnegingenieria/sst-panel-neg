// P2-1 — cambios de alcance del proyecto: diff por grupo (CF real con deps
// instaladas, patrón claims/horario), decisión de acción con la GUARDA DURA
// de migración, tres números y el gate de utilidad (ajuste 1).
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { createRequire } from 'node:module'
import { ventaInicialDe } from '../proyecto'
import { puedeVersionDeCambio, esVersionDeCambio } from '../cotizacion'
import { utilidadRealDe } from '../../../utils/sigp/indicadores'
import type { Proyecto } from '../proyecto'

// La CF REAL (implementación única, patrón claims.test) — require CJS.
const require = createRequire(import.meta.url)
const { diffAlcance, decidirAccion } = require('../../../../functions/crearProyecto.js') as {
  diffAlcance: (v?: { grupo: string; subtotal: number }[], n?: { grupo: string; subtotal: number }[]) => { grupo: string; tipo: string; delta: number }[]
  decidirAccion: (p: Record<string, unknown> | null, v: number) => string
}

const g = (grupo: string, subtotal: number) => ({ grupo, items: 1, subtotal })

describe('diffAlcance — diff por grupo con ETIQUETAS NEUTRAS', () => {
  const viejo = [
    g('Protección de equipos y limpieza', 1_965_120),
    g('Ensayos y diagnóstico estructural', 6_463_735),
    g('Reforzamiento Fibra de Carbono (opcional)', 36_904_228),
  ]

  it('grupo removido → cancelacion con delta negativo (el caso Megacenter)', () => {
    const nuevo = viejo.slice(0, 2)
    expect(diffAlcance(viejo, nuevo)).toEqual([
      { grupo: 'Reforzamiento Fibra de Carbono (opcional)', tipo: 'cancelacion', delta: -36_904_228 },
    ])
  })

  it('grupo nuevo → adicional con delta positivo', () => {
    const nuevo = [...viejo, g('Obra civil menor', 5_000_000)]
    expect(diffAlcance(viejo, nuevo)).toEqual([
      { grupo: 'Obra civil menor', tipo: 'adicional', delta: 5_000_000 },
    ])
  })

  it('subtotal que sube/baja → aumento/disminucion — NEUTRAS a propósito (ajuste 2: a nivel de grupo no se distingue cantidad de precio; jamás afirmar "mayores cantidades")', () => {
    const nuevo = [g('Protección de equipos y limpieza', 2_500_000), g('Ensayos y diagnóstico estructural', 6_000_000), viejo[2]]
    const d = diffAlcance(viejo, nuevo)
    expect(d).toEqual([
      { grupo: 'Protección de equipos y limpieza', tipo: 'aumento', delta: 534_880 },
      { grupo: 'Ensayos y diagnóstico estructural', tipo: 'disminucion', delta: -463_735 },
    ])
    // La disciplina fijada: ningún componente afirma lo que el diff no ve.
    for (const c of d) expect(['cancelacion', 'aumento', 'disminucion', 'adicional']).toContain(c.tipo)
  })

  it('mixto: cancelación + aumento + adicional en un solo cambio', () => {
    const nuevo = [g('Protección de equipos y limpieza', 2_000_000), g('Ensayos y diagnóstico estructural', 6_463_735), g('Nueva actividad', 100)]
    const tipos = diffAlcance(viejo, nuevo).map((c: { tipo: string }) => c.tipo).sort()
    expect(tipos).toEqual(['adicional', 'aumento', 'cancelacion'])
  })

  it('sin cambios → diff vacío; arrays ausentes tolerados', () => {
    expect(diffAlcance(viejo, viejo)).toEqual([])
    expect(diffAlcance(undefined, undefined)).toEqual([])
  })
})

describe('decidirAccion — la GUARDA DURA de secuencia (CF → migración → Vercel)', () => {
  const base = { cotizacion_version: 4, valor_venta_inicial: 105_622_769 }

  it('sin proyecto → crear', () => {
    expect(decidirAccion(null, 5)).toBe('crear')
  })
  it('versión mayor + valor_venta_inicial presente → cambio', () => {
    expect(decidirAccion(base, 5)).toBe('cambio')
  })
  it('versión mayor SIN valor_venta_inicial → bloqueado_migracion — jamás se aplica ni se backfillea (si corriera primero, tomaría la venta ya corregida y el número original se perdería)', () => {
    expect(decidirAccion({ cotizacion_version: 4 }, 5)).toBe('bloqueado_migracion')
  })
  it('misma versión / versión desconocida / re-aprobación → reparar (comportamiento histórico)', () => {
    expect(decidirAccion(base, 4)).toBe('reparar')
    expect(decidirAccion({ valor_venta_inicial: 1 }, 5)).toBe('reparar')   // sin cotizacion_version
    expect(decidirAccion(base, 3)).toBe('reparar')
  })
})

describe('ventaInicialDe — los tres números con fallback pre-migración', () => {
  it('con el campo → el congelado; sin él → la vigente (sin cambios aplicables, vigente ES inicial)', () => {
    const snap = { valor_venta: 61_000_000 } as Proyecto['snapshot']
    expect(ventaInicialDe({ valor_venta_inicial: 105_622_769, snapshot: snap })).toBe(105_622_769)
    expect(ventaInicialDe({ snapshot: snap })).toBe(61_000_000)
  })
})

describe('puedeVersionDeCambio / esVersionDeCambio', () => {
  it('solo desde aprobada Y con proyecto', () => {
    expect(puedeVersionDeCambio('aprobada', true)).toBe(true)
    expect(puedeVersionDeCambio('aprobada', false)).toBe(false)
    expect(puedeVersionDeCambio('enviada', true)).toBe(false)
    expect(puedeVersionDeCambio('borrador', true)).toBe(false)
  })
  it('esVersionDeCambio: la marca vale solo para la versión ACTIVA', () => {
    const ts = Timestamp.now()
    expect(esVersionDeCambio({ cambio_en_curso: { version: 5, iniciado_por: 'u', fecha: ts }, version_activa: 5 })).toBe(true)
    expect(esVersionDeCambio({ cambio_en_curso: { version: 5, iniciado_por: 'u', fecha: ts }, version_activa: 6 })).toBe(false)
    expect(esVersionDeCambio({ version_activa: 5 })).toBe(false)
  })
})

describe('ajuste 1 — con alcance_desactualizado la utilidad NO muestra número', () => {
  const p = {
    id: 'x', estado: 'ejecutado',
    preliquidacion: { valor_venta: 1_000_000, valor_contratista: 700_000, anticipo_pct: 50, definida_por: 'u', fecha_definicion: Timestamp.now() },
  } as unknown as Proyecto

  it('sin flag → utilidad real normal; con flag → null (pendiente de revisar)', () => {
    expect(utilidadRealDe(p, 0)).toBe(300_000)
    const desact = { ...p, alcance_desactualizado: { version: 5, fecha: Timestamp.now(), grupos_afectados: ['X'] } } as Proyecto
    expect(utilidadRealDe(desact, 0)).toBeNull()
  })
})
