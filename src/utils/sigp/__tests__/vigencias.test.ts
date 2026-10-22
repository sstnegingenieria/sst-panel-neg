import { describe, it, expect } from 'vitest'
import type { Timestamp } from 'firebase/firestore'
import {
  ESTADOS_VIGENCIA, diaLocal, diasEntre, diasRestantes,
  estadoVigencia, venceAntesDe, estaVigente, etiquetaVigencia, peorVigencia,
} from '../vigencias'
import { DIAS_ALERTA_DEFAULT } from '../../../types/sigp/documentoEmpresa'
import type { DocumentoEmpresa } from '../../../types/sigp/documentoEmpresa'

/**
 * Timestamps construidos con componentes LOCALES a propósito.
 *
 * `new Date('2026-09-15')` se interpreta en UTC y en Colombia (UTC−5) cae el
 * 14 a las 19:00 — un fixture así probaría el día equivocado. La trampa es
 * la misma que `isoLocal` resuelve en `ventanaLicitacion.ts`.
 */
const dia = (y: number, m: number, d: number, h = 12): Timestamp =>
  ({ toDate: () => new Date(y, m - 1, d, h) } as unknown as Timestamp)

const doc = (extra?: Partial<DocumentoEmpresa>): DocumentoEmpresa => ({
  tipo: 'poliza',
  nombre: 'Póliza de cumplimiento',
  numero: '12-45-101234567',
  entidad_emisora: 'Seguros del Estado',
  fecha_expedicion: dia(2026, 1, 15),
  fecha_vigencia_hasta: dia(2026, 12, 31),
  dias_alerta: DIAS_ALERTA_DEFAULT,
  archivo_url: 'https://storage/x.pdf',
  archivo_hash: 'abc123',
  archivo_nombre: 'poliza.pdf',
  reutilizable: false,
  observaciones: '',
  activo: true,
  indicadores: null,
  creado_por: 'uid-karen',
  creado_en: dia(2026, 1, 15),
  actualizado_por: 'uid-karen',
  actualizado_en: dia(2026, 1, 15),
  ...extra,
})

// ═════════════════════════════════════════════════════════════════════════════
// Granularidad de día
// ═════════════════════════════════════════════════════════════════════════════

describe('diaLocal — la clave de día calendario', () => {
  it('usa la fecha LOCAL, no la UTC', () => {
    // 23:30 del 15 sigue siendo el 15, aunque en UTC ya sea el 16.
    expect(diaLocal(dia(2026, 9, 15, 23))).toBe(diaLocal(dia(2026, 9, 15, 0)))
  })

  it('dos horas distintas del mismo día dan la MISMA clave', () => {
    expect(diaLocal(dia(2026, 9, 15, 1))).toBe(diaLocal(dia(2026, 9, 15, 22)))
  })

  it('null con timestamp ausente o inválido — nunca lanza', () => {
    expect(diaLocal(null)).toBeNull()
    expect(diaLocal(undefined)).toBeNull()
    expect(diaLocal({ toDate: () => new Date('basura') } as unknown as Timestamp)).toBeNull()
    expect(diaLocal({} as unknown as Timestamp)).toBeNull()
  })
})

describe('diasEntre', () => {
  it('cuenta días calendario, ignorando la hora', () => {
    expect(diasEntre(dia(2026, 9, 15, 23), dia(2026, 9, 16, 1))).toBe(1)
  })

  it('el mismo día son 0 aunque cambie la hora', () => {
    expect(diasEntre(dia(2026, 9, 15, 7), dia(2026, 9, 15, 20))).toBe(0)
  })

  it('negativo cuando la segunda fecha ya pasó', () => {
    expect(diasEntre(dia(2026, 9, 15), dia(2026, 9, 10))).toBe(-5)
  })

  it('cruza meses y años sin perder la cuenta', () => {
    expect(diasEntre(dia(2026, 12, 28), dia(2027, 1, 4))).toBe(7)
  })

  it('cruza el cambio de hora sin descuadrar (no hay DST en Colombia, pero el cálculo es por componentes)', () => {
    expect(diasEntre(dia(2026, 3, 1), dia(2026, 4, 1))).toBe(31)
  })

  it('null si falta cualquiera de las dos', () => {
    expect(diasEntre(null, dia(2026, 9, 15))).toBeNull()
    expect(diasEntre(dia(2026, 9, 15), null)).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// estadoVigencia — CON y SIN fecha, y el borde exacto de dias_alerta
// ═════════════════════════════════════════════════════════════════════════════

describe('estadoVigencia — sin fecha de vencimiento', () => {
  it('CLAVE: `null` significa QUE NO VENCE, no que falte el dato', () => {
    const rut = doc({ tipo: 'rut', fecha_vigencia_hasta: null })
    expect(estadoVigencia(rut, dia(2030, 1, 1))).toBe('sin_vencimiento')
    expect(estaVigente(rut, dia(2030, 1, 1))).toBe(true)
    expect(diasRestantes(rut, dia(2030, 1, 1))).toBeNull()
  })

  it('una fecha ilegible cae a sin_vencimiento, JAMÁS a vigente', () => {
    // No se afirma que un papel sirve por no haber podido leer su fecha.
    const roto = doc({
      fecha_vigencia_hasta: { toDate: () => new Date('basura') } as unknown as Timestamp,
    })
    expect(estadoVigencia(roto, dia(2026, 9, 15))).toBe('sin_vencimiento')
  })
})

describe('estadoVigencia — el borde EXACTO de dias_alerta', () => {
  const HOY = dia(2026, 9, 1)

  it('exactamente dias_alerta días antes ⇒ por_vencer (el borde entra)', () => {
    // Mismo criterio que `<= 30` de getDocEstado en el panel SST.
    const d = doc({ dias_alerta: 30, fecha_vigencia_hasta: dia(2026, 10, 1) })
    expect(diasEntre(HOY, d.fecha_vigencia_hasta)).toBe(30)
    expect(estadoVigencia(d, HOY)).toBe('por_vencer')
  })

  it('un día MÁS allá del borde ⇒ vigente', () => {
    const d = doc({ dias_alerta: 30, fecha_vigencia_hasta: dia(2026, 10, 2) })
    expect(diasEntre(HOY, d.fecha_vigencia_hasta)).toBe(31)
    expect(estadoVigencia(d, HOY)).toBe('vigente')
  })

  it('un día ANTES del borde ⇒ por_vencer', () => {
    const d = doc({ dias_alerta: 30, fecha_vigencia_hasta: dia(2026, 9, 30) })
    expect(estadoVigencia(d, HOY)).toBe('por_vencer')
  })

  it('CLAVE: vence HOY ⇒ por_vencer, no vencido — todavía sirve', () => {
    const d = doc({ fecha_vigencia_hasta: dia(2026, 9, 1, 8) })
    expect(estadoVigencia(d, dia(2026, 9, 1, 20))).toBe('por_vencer')
    expect(estaVigente(d, dia(2026, 9, 1, 20))).toBe(true)
  })

  it('venció ayer ⇒ vencido', () => {
    const d = doc({ fecha_vigencia_hasta: dia(2026, 8, 31) })
    expect(estadoVigencia(d, HOY)).toBe('vencido')
    expect(estaVigente(d, HOY)).toBe(false)
  })

  it('el umbral es POR DOCUMENTO: una póliza puede querer 60', () => {
    const f = dia(2026, 10, 15)                       // a 44 días
    expect(estadoVigencia(doc({ dias_alerta: 30, fecha_vigencia_hasta: f }), HOY)).toBe('vigente')
    expect(estadoVigencia(doc({ dias_alerta: 60, fecha_vigencia_hasta: f }), HOY)).toBe('por_vencer')
  })

  it('dias_alerta 0 es legítimo: avisa solo el día que vence', () => {
    const d = doc({ dias_alerta: 0, fecha_vigencia_hasta: dia(2026, 9, 1) })
    expect(estadoVigencia(d, HOY)).toBe('por_vencer')
    expect(estadoVigencia(doc({ dias_alerta: 0, fecha_vigencia_hasta: dia(2026, 9, 2) }), HOY))
      .toBe('vigente')
  })

  it('un dias_alerta basura cae al default, no rompe el semáforo', () => {
    const f = dia(2026, 9, 20)                        // a 19 días
    const basura = doc({ dias_alerta: -5, fecha_vigencia_hasta: f })
    expect(estadoVigencia(basura, HOY)).toBe('por_vencer')   // default 30
    expect(estadoVigencia(doc({ dias_alerta: NaN, fecha_vigencia_hasta: f }), HOY))
      .toBe('por_vencer')
  })

  it('todos los estados declarados son alcanzables', () => {
    const vistos = new Set([
      estadoVigencia(doc({ fecha_vigencia_hasta: null }), HOY),
      estadoVigencia(doc({ fecha_vigencia_hasta: dia(2026, 8, 1) }), HOY),
      estadoVigencia(doc({ fecha_vigencia_hasta: dia(2026, 9, 10) }), HOY),
      estadoVigencia(doc({ fecha_vigencia_hasta: dia(2027, 9, 10) }), HOY),
    ])
    expect([...vistos].sort()).toEqual([...ESTADOS_VIGENCIA].sort())
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// venceAntesDe — la pregunta del checklist contra la fecha de cierre
// ═════════════════════════════════════════════════════════════════════════════

describe('venceAntesDe — con el cierre el MISMO día', () => {
  it('CLAVE: vigencia hasta el 15 y cierre el 15 ⇒ NO vence antes', () => {
    // Un documento válido "hasta el 15" alcanza para un cierre del 15. Comparar
    // por milisegundos diría que sí vence (00:00 < 17:00) y rechazaría un papel
    // perfectamente válido justo el día que importa.
    const d = doc({ fecha_vigencia_hasta: dia(2026, 9, 15, 0) })
    expect(venceAntesDe(d, dia(2026, 9, 15, 17))).toBe(false)
  })

  it('el mismo día en cualquier combinación de horas ⇒ false', () => {
    const d = doc({ fecha_vigencia_hasta: dia(2026, 9, 15, 23) })
    expect(venceAntesDe(d, dia(2026, 9, 15, 1))).toBe(false)
  })

  it('vigencia el 14 y cierre el 15 ⇒ SÍ vence antes', () => {
    const d = doc({ fecha_vigencia_hasta: dia(2026, 9, 14, 23) })
    expect(venceAntesDe(d, dia(2026, 9, 15, 0))).toBe(true)
  })

  it('vigencia el 16 y cierre el 15 ⇒ no vence antes', () => {
    expect(venceAntesDe(doc({ fecha_vigencia_hasta: dia(2026, 9, 16) }), dia(2026, 9, 15)))
      .toBe(false)
  })

  it('un documento que NO vence nunca vence antes de nada', () => {
    expect(venceAntesDe(doc({ fecha_vigencia_hasta: null }), dia(2030, 1, 1))).toBe(false)
  })

  it('sin fecha de cierre no objeta (false), pero eso NO quiere decir "todo bien"', () => {
    // El veredicto lo arma `evaluarVigencia`, que distingue los casos.
    const vencido = doc({ fecha_vigencia_hasta: dia(2020, 1, 1) })
    expect(venceAntesDe(vencido, null)).toBe(false)
    expect(venceAntesDe(vencido, undefined)).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Etiqueta y peor-gana
// ═════════════════════════════════════════════════════════════════════════════

describe('etiquetaVigencia — dice los días, no solo el estado', () => {
  const HOY = dia(2026, 9, 1)

  it('vence hoy lo dice con esas palabras', () => {
    expect(etiquetaVigencia(doc({ fecha_vigencia_hasta: dia(2026, 9, 1) }), HOY))
      .toBe('Vence hoy')
  })

  it('por vencer trae el número — un "Por vencer" solo obliga a abrir el documento', () => {
    expect(etiquetaVigencia(doc({ fecha_vigencia_hasta: dia(2026, 9, 11) }), HOY))
      .toBe('Vence en 10 días')
    expect(etiquetaVigencia(doc({ fecha_vigencia_hasta: dia(2026, 9, 2) }), HOY))
      .toBe('Vence en 1 día')
  })

  it('vencido dice hace cuánto, en singular y plural', () => {
    expect(etiquetaVigencia(doc({ fecha_vigencia_hasta: dia(2026, 8, 31) }), HOY))
      .toBe('Vencido hace 1 día')
    expect(etiquetaVigencia(doc({ fecha_vigencia_hasta: dia(2026, 8, 20) }), HOY))
      .toBe('Vencido hace 12 días')
  })

  it('el que no vence lo dice sin número', () => {
    expect(etiquetaVigencia(doc({ fecha_vigencia_hasta: null }), HOY)).toBe('No vence')
  })
})

describe('peorVigencia — el semáforo de la carpeta completa', () => {
  const HOY = dia(2026, 9, 1)
  const vigente = doc({ fecha_vigencia_hasta: dia(2027, 1, 1) })
  const porVencer = doc({ fecha_vigencia_hasta: dia(2026, 9, 10) })
  const vencido = doc({ fecha_vigencia_hasta: dia(2026, 8, 1) })
  const noVence = doc({ fecha_vigencia_hasta: null })

  it('un vencido ensucia la carpeta entera', () => {
    expect(peorVigencia([vigente, noVence, vencido, porVencer], HOY)).toBe('vencido')
  })

  it('sin vencidos, el por_vencer manda', () => {
    expect(peorVigencia([vigente, noVence, porVencer], HOY)).toBe('por_vencer')
  })

  it('todo vigente ⇒ vigente', () => {
    expect(peorVigencia([vigente, noVence], HOY)).toBe('vigente')
  })

  it('solo documentos que no vencen ⇒ sin_vencimiento', () => {
    expect(peorVigencia([noVence, noVence], HOY)).toBe('sin_vencimiento')
  })

  it('carpeta vacía ⇒ sin_vencimiento, sin lanzar', () => {
    expect(peorVigencia([], HOY)).toBe('sin_vencimiento')
  })
})
