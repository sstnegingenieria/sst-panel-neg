// 13-nov (caso 01.01.01 del PRY-2026-058): la tabla pedía el acumulado sin
// mostrar contra qué, y 93,6 quedó en 2 tras emitir el corte. Estos tests
// fijan la base visible y el bloqueo duro bajo lo congelado.
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { baseCortadaDe, errorBajoBase, patchRegistrarAvance } from '../corteObra'

const ts = Timestamp.fromDate(new Date('2026-11-13T20:00:00Z'))

const corte = (n: number, tipo: 'facturable' | 'informativo' | undefined, items: [string, number][], consecutivo = `CRT-2026-00${n}`) => ({
  numero_corte: n, ...(tipo ? { tipo } : {}), consecutivo,
  items: items.map(([clave, cantidad_acum]) => ({ clave, cantidad_acum })),
})

describe('baseCortadaDe — la base es el ÚLTIMO corte FACTURABLE', () => {
  it('sin cortes → mapa vacío (piso 0 para todo)', () => {
    const b = baseCortadaDe([])
    expect(b.porClave.size).toBe(0)
    expect(b.consecutivo).toBeUndefined()
  })
  it('tipo ausente = facturable (cortes legacy)', () => {
    const b = baseCortadaDe([corte(1, undefined, [['u-1', 93.6]])])
    expect(b.consecutivo).toBe('CRT-2026-001')
    expect(b.porClave.get('u-1')).toBe(93.6)
  })
  it('un informativo POSTERIOR no mueve la base (misma regla que la emisión)', () => {
    const b = baseCortadaDe([
      corte(1, 'facturable', [['u-1', 93.6]]),
      corte(2, 'informativo', [['u-1', 120]]),
    ])
    expect(b.consecutivo).toBe('CRT-2026-001')
    expect(b.porClave.get('u-1')).toBe(93.6)
  })
  it('entre dos facturables gana el de número mayor', () => {
    const b = baseCortadaDe([
      corte(2, 'facturable', [['u-1', 110]]),
      corte(1, 'facturable', [['u-1', 93.6]]),
    ])
    expect(b.porClave.get('u-1')).toBe(110)
  })
})

describe('errorBajoBase — cifras y salida legítima en el mensaje', () => {
  it('nombra las dos cifras, el corte y el camino correcto', () => {
    const m = errorBajoBase(2, 93.6, 'CRT-2026-001')
    expect(m).toContain('(2)')
    expect(m).toContain('(93.6)')
    expect(m).toContain('CRT-2026-001')
    expect(m).toContain('cambio de alcance')
    expect(m).toContain('documento entregado al cliente')
  })
})

const proyecto = {
  avance_items: [{ clave: 'u-1', cantidad: 93.6, registros: [] }],
  snapshot: { items_alcance: [{ clave: 'u-1', codigo: '01.01.01', descripcion: 'Malla', grupo: 'G', unidad: 'M²', cantidad: 144, valor_total: 1_732_896, valor_unitario: 12_034 }] },
} as never

describe('patchRegistrarAvance con base — el cero del 058 no vuelve', () => {
  it('RECHAZA un acumulado por debajo de la base congelada (el caso exacto: 2 < 93,6)', () => {
    expect(patchRegistrarAvance(proyecto, 'u-1', 2, 'u', ts, undefined, undefined, 93.6)).toBeNull()
  })
  it('acepta igual a la base (sin avance nuevo — lo bloquea la emisión facturable, no el registro)', () => {
    const r = patchRegistrarAvance(proyecto, 'u-1', 93.6, 'u', ts, undefined, undefined, 93.6)
    expect(r).not.toBeNull()
  })
  it('acepta por encima, y la sobre-ejecución se marca sin recortar', () => {
    const r = patchRegistrarAvance(proyecto, 'u-1', 150, 'u', ts, undefined, undefined, 93.6)
    expect(r!.sobreEjecutado).toBe(true)
    expect(r!.avance_items.find(a => a.clave === 'u-1')!.cantidad).toBe(150)
  })
  it('sin base (caller viejo) el comportamiento no cambia — retrocompatible', () => {
    const r = patchRegistrarAvance(proyecto, 'u-1', 2, 'u', ts)
    expect(r).not.toBeNull()
  })
})
