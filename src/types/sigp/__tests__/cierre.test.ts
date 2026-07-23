// Cierre del proyecto (Administrativa · Bloque final) — helpers puros.
// Contrato: solo se cierra desde liquidado_contratista; el resumen de
// completitud es INFORMATIVO (nada bloquea el cierre).
import { describe, it, expect } from 'vitest'
import {
  puedeCerrarseEn, completitudCierre, ESTADOS_PROYECTO,
  SECCIONES_ADMINISTRATIVA, enBandejaAdministrativa,
} from '../proyecto'
import type { EstadoProyecto } from '../proyecto'

describe('bandeja Gestión Administrativa — las 7 secciones del ciclo', () => {
  it('cubre exactamente los 7 momentos de gerencia, en orden del ciclo', () => {
    expect(SECCIONES_ADMINISTRATIVA.map(s => s.estado)).toEqual([
      'preliquidacion_definida', 'preliquidacion_aprobada', 'enviado_a_facturacion',
      'facturado', 'pagado_cliente', 'liquidado_contratista', 'cerrado',
    ])
  })

  it('los estados de EJECUCIÓN (territorio de proyectos) quedan FUERA', () => {
    for (const e of ['creado', 'contratista_asignado', 'permisos_en_tramite',
      'anticipo_girado', 'en_ejecucion', 'ejecutado', 'entregado_cliente',
      'soporte_recibido'] as EstadoProyecto[]) {
      expect(enBandejaAdministrativa(e), e).toBe(false)
    }
    expect(enBandejaAdministrativa('preliquidacion_definida')).toBe(true)
    expect(enBandejaAdministrativa('cerrado')).toBe(true)
  })
})

describe('puedeCerrarseEn — solo desde liquidado_contratista', () => {
  it('liquidado_contratista es el único estado cerrable', () => {
    expect(puedeCerrarseEn('liquidado_contratista')).toBe(true)
    const otros = ESTADOS_PROYECTO.filter((e): e is EstadoProyecto => e !== 'liquidado_contratista')
    for (const e of otros) expect(puedeCerrarseEn(e), e).toBe(false)
  })
})

describe('completitudCierre — resumen informativo de los 5 hitos', () => {
  it('todo vacío → 5 pendientes (y aun así el cierre no se bloquea)', () => {
    const items = completitudCierre({})
    expect(items).toHaveLength(5)
    expect(items.every(i => !i.ok)).toBe(true)
    expect(items.map(i => i.clave)).toEqual([
      'facturacion', 'pago_cliente', 'liquidacion', 'evaluacion_contratista', 'evaluacion_cliente',
    ])
  })

  it('marca ✓ exactamente lo capturado', () => {
    const items = completitudCierre({
      facturacion: {} as never,
      liquidacion: {} as never,
    })
    const ok = Object.fromEntries(items.map(i => [i.clave, i.ok]))
    expect(ok).toEqual({
      facturacion: true, pago_cliente: false, liquidacion: true,
      evaluacion_contratista: false, evaluacion_cliente: false,
    })
  })
})
