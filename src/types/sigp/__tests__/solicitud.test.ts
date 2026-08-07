import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { TRANSICIONES, ESTADOS_SOLICITUD, historialRegistroCon } from '../solicitud'
import type { EstadoSolicitud } from '../solicitud'

describe('TRANSICIONES (máquina de estados de solicitudes)', () => {
  it('permite el flujo hacia adelante básico', () => {
    expect(TRANSICIONES.recibida).toContain('en_estudio')
    expect(TRANSICIONES.en_estudio).toContain('lista_para_cotizar')
    expect(TRANSICIONES.en_estudio).toContain('requiere_visita')
    expect(TRANSICIONES.requiere_visita).toContain('lista_para_cotizar')
  })

  it('permite correcciones hacia atrás (marcar un estado por error)', () => {
    expect(TRANSICIONES.en_estudio).toContain('recibida')
    expect(TRANSICIONES.lista_para_cotizar).toContain('en_estudio')
    expect(TRANSICIONES.requiere_visita).toContain('en_estudio')
  })

  it('permite descartar desde cualquier estado activo', () => {
    for (const e of ['recibida', 'en_estudio', 'lista_para_cotizar', 'requiere_visita'] as EstadoSolicitud[]) {
      expect(TRANSICIONES[e]).toContain('descartada')
    }
  })

  it('cotizada y descartada son terminales', () => {
    expect(TRANSICIONES.cotizada).toEqual([])
    expect(TRANSICIONES.descartada).toEqual([])
  })

  it('cotizada NUNCA es un objetivo manual (reservada a F1.4)', () => {
    for (const e of ESTADOS_SOLICITUD) {
      expect(TRANSICIONES[e]).not.toContain('cotizada')
    }
  })

  it('todo objetivo de transición es un estado válido', () => {
    for (const e of ESTADOS_SOLICITUD) {
      for (const destino of TRANSICIONES[e]) {
        expect(ESTADOS_SOLICITUD).toContain(destino)
      }
    }
  })
})

describe('historialRegistroCon (Comercial #1 — decisión de rumbo al registrar)', () => {
  const uid = 'uid-test'
  const fecha = Timestamp.now()

  it('requiere_visita: nace en_estudio y transiciona a requiere_visita en el mismo acto', () => {
    const { estadoFinal, historial } = historialRegistroCon('requiere_visita', uid, fecha)
    expect(estadoFinal).toBe('requiere_visita')
    expect(historial).toHaveLength(2)
    expect(historial[0]).toMatchObject({ de: null, a: 'en_estudio', por: uid, fecha })
    expect(historial[0].motivo).toBeTruthy()
    expect(historial[1]).toMatchObject({ de: 'en_estudio', a: 'requiere_visita', por: uid, fecha })
    expect(historial[1].motivo).toBeTruthy()
  })

  it('cotizable: nace en_estudio y transiciona a lista_para_cotizar en el mismo acto', () => {
    const { estadoFinal, historial } = historialRegistroCon('cotizable', uid, fecha)
    expect(estadoFinal).toBe('lista_para_cotizar')
    expect(historial).toHaveLength(2)
    expect(historial[0]).toMatchObject({ de: null, a: 'en_estudio', por: uid, fecha })
    expect(historial[1]).toMatchObject({ de: 'en_estudio', a: 'lista_para_cotizar', por: uid, fecha })
    expect(historial[1].motivo).toBeTruthy()
  })

  it('decidir_despues: nace en_estudio y se queda ahí (un solo eslabón)', () => {
    const { estadoFinal, historial } = historialRegistroCon('decidir_despues', uid, fecha)
    expect(estadoFinal).toBe('en_estudio')
    expect(historial).toHaveLength(1)
    expect(historial[0]).toMatchObject({ de: null, a: 'en_estudio', por: uid, fecha })
  })

  it('las transiciones en_estudio → requiere_visita / lista_para_cotizar son legales según TRANSICIONES', () => {
    expect(TRANSICIONES.en_estudio).toContain('requiere_visita')
    expect(TRANSICIONES.en_estudio).toContain('lista_para_cotizar')

    const rv = historialRegistroCon('requiere_visita', uid, fecha)
    expect(TRANSICIONES[rv.historial[0].a]).toContain(rv.historial[1].a)

    const cot = historialRegistroCon('cotizable', uid, fecha)
    expect(TRANSICIONES[cot.historial[0].a]).toContain(cot.historial[1].a)
  })
})
