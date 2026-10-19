// Bloque "la línea de tiempo dice quién" (19-oct-2026) — resolución del
// autor de entradas de historial. Fija los dos criterios del mandato:
//  1. lo que no se guardó NO se inventa ('—' para autor vacío/irresoluble);
//  2. lo de CF dice "el sistema", con la precisión de nacimiento y cambio de
//     alcance ("el sistema — al aprobar X (persona)") SOLO cuando el dato
//     está guardado (creado_por / aprobado_por) y resuelve a un nombre.
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { autorDe, autorEntradaProyecto, conAutor, AUTOR_SISTEMA, AUTOR_DESCONOCIDO } from '../autoria'
import type { EntradaHistorialProyecto } from '../../../types/sigp/proyecto'

const NOMBRES = { u_paula: 'Paula Moreno', u_marcela: 'Marcela Montoya' }
const ts = (ms: number) => Timestamp.fromMillis(ms)

describe('autorDe', () => {
  it('por_nombre congelado GANA sobre el lookup (el nombre del momento del acto)', () => {
    expect(autorDe({ por: 'u_paula', por_nombre: 'Paula M. (apellido viejo)' }, NOMBRES))
      .toBe('Paula M. (apellido viejo)')
  })
  it('sistema → "el sistema"', () => {
    expect(autorDe({ por: 'sistema' }, NOMBRES)).toBe(AUTOR_SISTEMA)
  })
  it('uid que resuelve → nombre', () => {
    expect(autorDe({ por: 'u_paula' }, NOMBRES)).toBe('Paula Moreno')
  })
  it('uid desconocido → "—" (no se inventa)', () => {
    expect(autorDe({ por: 'u_fantasma' }, NOMBRES)).toBe(AUTOR_DESCONOCIDO)
  })
  it('autor vacío o ausente → "—" (el fallback ?? \'\' documentado: 0 casos en prod)', () => {
    expect(autorDe({ por: '' }, NOMBRES)).toBe(AUTOR_DESCONOCIDO)
    expect(autorDe({}, NOMBRES)).toBe(AUTOR_DESCONOCIDO)
  })
  it('por_nombre de solo espacios se ignora (cae al lookup)', () => {
    expect(autorDe({ por: 'u_paula', por_nombre: '   ' }, NOMBRES)).toBe('Paula Moreno')
  })
})

describe('autorEntradaProyecto', () => {
  const P_COT = {
    creado_por: 'u_paula', origen: 'cotizacion' as const,
    cotizacion_consecutivo: 'COT-2026-052', solicitud_consecutivo: undefined,
    cambios_alcance: undefined,
  }

  it('entrada con uid delega a autorDe (persona con nombre)', () => {
    const e = { de: 'creado', a: 'contratista_asignado', por: 'u_marcela', fecha: ts(1) } as EntradaHistorialProyecto
    expect(autorEntradaProyecto(e, P_COT, NOMBRES)).toBe('Marcela Montoya')
  })

  it('nacimiento CF: "el sistema — al aprobar COT-X (persona)" desde creado_por', () => {
    const e = { a: 'creado', por: 'sistema', fecha: ts(1) } as EntradaHistorialProyecto
    expect(autorEntradaProyecto(e, P_COT, NOMBRES))
      .toBe('el sistema — al aprobar COT-2026-052 (Paula Moreno)')
  })

  it('nacimiento de preventivo dice "al aceptar SOL-X"', () => {
    const e = { a: 'creado', por: 'sistema', fecha: ts(1) } as EntradaHistorialProyecto
    const p = { ...P_COT, origen: 'preventivo' as const, cotizacion_consecutivo: undefined, solicitud_consecutivo: 'SOL-2026-030' }
    expect(autorEntradaProyecto(e, p, NOMBRES))
      .toBe('el sistema — al aceptar SOL-2026-030 (Paula Moreno)')
  })

  it('nacimiento con creado_por = "sistema" o irresoluble → "el sistema" a secas', () => {
    const e = { a: 'creado', por: 'sistema', fecha: ts(1) } as EntradaHistorialProyecto
    expect(autorEntradaProyecto(e, { ...P_COT, creado_por: 'sistema' }, NOMBRES)).toBe(AUTOR_SISTEMA)
    expect(autorEntradaProyecto(e, { ...P_COT, creado_por: 'u_fantasma' }, NOMBRES)).toBe(AUTOR_SISTEMA)
    expect(autorEntradaProyecto(e, { ...P_COT, creado_por: undefined as unknown as string }, NOMBRES)).toBe(AUTOR_SISTEMA)
  })

  it('cambio de alcance: match EXACTO por fecha contra cambios_alcance[] (mismo Timestamp de la transacción de la CF)', () => {
    const f = ts(1_700_000_000_000)
    const e = { a: 'en_ejecucion', por: 'sistema', fecha: f } as EntradaHistorialProyecto
    const p = {
      ...P_COT,
      cambios_alcance: [
        { fecha: ts(999), version: 2, delta_venta: 0, componentes: [], motivo: 'otro', aprobado_por: 'u_marcela' },
        { fecha: f, version: 3, delta_venta: 100, componentes: [], motivo: 'x', aprobado_por: 'u_paula' },
      ],
    }
    expect(autorEntradaProyecto(e, p as never, NOMBRES))
      .toBe('el sistema — al aprobar COT-2026-052 v3 (Paula Moreno)')
  })

  it('entrada sistema sin match (p. ej. la reversión de PRY-2026-057) → "el sistema"', () => {
    const e = { de: 'cancelado', a: 'creado', por: 'sistema', fecha: ts(5) } as EntradaHistorialProyecto
    expect(autorEntradaProyecto(e, P_COT, NOMBRES)).toBe(AUTOR_SISTEMA)
  })

  it('cambio con aprobado_por "sistema" o irresoluble → "el sistema" a secas', () => {
    const f = ts(123456)
    const e = { a: 'facturado', por: 'sistema', fecha: f } as EntradaHistorialProyecto
    const base = { fecha: f, version: 4, delta_venta: 0, componentes: [], motivo: 'x' }
    expect(autorEntradaProyecto(e, { ...P_COT, cambios_alcance: [{ ...base, aprobado_por: 'sistema' }] } as never, NOMBRES)).toBe(AUTOR_SISTEMA)
    expect(autorEntradaProyecto(e, { ...P_COT, cambios_alcance: [{ ...base, aprobado_por: 'u_fantasma' }] } as never, NOMBRES)).toBe(AUTOR_SISTEMA)
  })
})

describe('conAutor (denormalización de la entrada NUEVA)', () => {
  const fecha = ts(1)
  it('tagea la entrada del uid propio', () => {
    expect(conAutor({ por: 'u_paula', fecha } as never, 'u_paula', 'Paula Moreno'))
      .toEqual({ por: 'u_paula', fecha, por_nombre: 'Paula Moreno' })
  })
  it('JAMÁS tagea una entrada "sistema" (sintetizadas legacy) ni de otro uid', () => {
    expect(conAutor({ por: 'sistema', fecha } as never, 'u_paula', 'Paula Moreno'))
      .toEqual({ por: 'sistema', fecha })
    expect(conAutor({ por: 'u_marcela', fecha } as never, 'u_paula', 'Paula Moreno'))
      .toEqual({ por: 'u_marcela', fecha })
  })
  it('sin uid o sin nombre → entrada intacta (jamás escribe por_nombre vacío)', () => {
    expect(conAutor({ por: 'u_paula', fecha } as never, undefined, 'Paula')).toEqual({ por: 'u_paula', fecha })
    expect(conAutor({ por: 'u_paula', fecha } as never, 'u_paula', undefined)).toEqual({ por: 'u_paula', fecha })
  })
})
