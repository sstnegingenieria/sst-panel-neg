import { describe, it, expect } from 'vitest'
import { TRANSICIONES, ESTADOS_SOLICITUD } from '../solicitud'
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
