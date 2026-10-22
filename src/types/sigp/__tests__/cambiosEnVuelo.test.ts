// PR C (22-oct-2026) — cola de cambios en vuelo + descartar versión de cambio.
//
// Fixtures = los 5 casos REALES del censo del 22-oct (5 de 5 proyectos "con
// cotización no aprobada" eran versiones de cambio abiertas sin cerrar):
// 058 v2 enviada · 044 v5 enviada · 061 v4 BORRADOR · 015 v2 enviada ·
// 025 ← COT-021 RECHAZADA v3 (el caso que produjo el guard).
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  cambioEnVuelo, diasCambioEnVuelo, proyectoVivoDe, patchDescartarCambio,
  UMBRAL_CAMBIO_EN_VUELO_DIAS,
} from '../cotizacion'
import type { Cotizacion, EstadoCotizacion } from '../cotizacion'

const DIA = 86_400_000
const ahora = Date.now()

const conCambio = (estado: EstadoCotizacion, version: number, diasAtras: number, extra: Partial<Cotizacion> = {}) => ({
  estado,
  version_activa: version,
  cambio_en_curso: { version, iniciado_por: 'u1', fecha: Timestamp.fromMillis(ahora - diasAtras * DIA) },
  proyecto_id: 'pry1',
  ...extra,
}) as Pick<Cotizacion, 'estado' | 'version_activa' | 'cambio_en_curso' | 'proyecto_id' | 'proyecto_cancelado'>

describe('cambioEnVuelo + antigüedad', () => {
  it('abierto en los TRES estados del cambio: borrador (061), enviada (058) y rechazada (025)', () => {
    expect(cambioEnVuelo(conCambio('enviada', 2, 21))).toBe(true)   // 058
    expect(cambioEnVuelo(conCambio('borrador', 4, 20))).toBe(true)  // 061
    expect(cambioEnVuelo(conCambio('rechazada', 3, 38))).toBe(true) // 025
  })

  it('sin marca de cambio → no está en vuelo; aprobada (marca residual pre-limpieza de la CF) tampoco', () => {
    expect(cambioEnVuelo({ estado: 'aprobada', cambio_en_curso: undefined })).toBe(false)
    expect(cambioEnVuelo(conCambio('aprobada', 2, 1))).toBe(false)
  })

  it('la antigüedad sale de la fecha de CREACIÓN del cambio y los 5 reales encienden con el umbral 15', () => {
    for (const dias of [21, 23, 20, 31, 38]) {
      const d = diasCambioEnVuelo(conCambio('enviada', 2, dias), ahora)
      expect(d).toBe(dias)
      expect(d! > UMBRAL_CAMBIO_EN_VUELO_DIAS).toBe(true)
    }
    expect(diasCambioEnVuelo({ estado: 'enviada', cambio_en_curso: undefined }, ahora)).toBeNull()
  })
})

describe('proyectoVivoDe', () => {
  it('con proyecto y sin anotación de cancelado → vivo; cancelado o sin proyecto → no', () => {
    expect(proyectoVivoDe({ proyecto_id: 'p1' })).toBe(true)
    expect(proyectoVivoDe({ proyecto_id: undefined })).toBe(false)
    expect(proyectoVivoDe({ proyecto_id: 'p1', proyecto_cancelado: { fecha: Timestamp.now(), proyecto_consecutivo: 'PRY-2026-001' } })).toBe(false)
  })
})

describe('patchDescartarCambio', () => {
  it('el caso 025: cambio v3 RECHAZADO con proyecto vivo → vuelve a aprobada sobre la v2 vigente', () => {
    const p = patchDescartarCambio(conCambio('rechazada', 3, 38), 2, 'el cambio no prosperó')
    expect(p).toEqual({ estado: 'aprobada', version_activa: 2, version_descartada: 3 })
  })

  it('cambio en borrador (061) también se descarta — abierto es abierto', () => {
    const p = patchDescartarCambio(conCambio('borrador', 4, 20), 3, 'registrado por error')
    expect(p).toEqual({ estado: 'aprobada', version_activa: 3, version_descartada: 4 })
  })

  it('058: enviada v2 con version_aprobada 1 → restaura la 1', () => {
    const p = patchDescartarCambio(conCambio('enviada', 2, 21), 1, 'cliente desistió')
    expect(p?.version_activa).toBe(1)
  })

  it('null sin motivo, sin cambio en vuelo, o con marca residual en aprobada', () => {
    expect(patchDescartarCambio(conCambio('enviada', 2, 21), 1, '   ')).toBeNull()
    expect(patchDescartarCambio({ estado: 'enviada', version_activa: 2, cambio_en_curso: undefined }, 1, 'x')).toBeNull()
    expect(patchDescartarCambio(conCambio('aprobada', 2, 1), 1, 'x')).toBeNull()
  })

  it('null si la versión aprobada no es resoluble o no es ANTERIOR al cambio (la vigente jamás es la descartada)', () => {
    expect(patchDescartarCambio(conCambio('enviada', 2, 21), null, 'x')).toBeNull()
    expect(patchDescartarCambio(conCambio('enviada', 2, 21), undefined, 'x')).toBeNull()
    expect(patchDescartarCambio(conCambio('enviada', 2, 21), 0, 'x')).toBeNull()
    expect(patchDescartarCambio(conCambio('enviada', 2, 21), 2, 'x')).toBeNull()
    expect(patchDescartarCambio(conCambio('enviada', 2, 21), 5, 'x')).toBeNull()
  })

  it('el guard del reemplazo: una enviada SIN proyecto no es descartable (rechazar sigue siendo del cliente)', () => {
    const sinProyecto = { ...conCambio('enviada', 2, 5), proyecto_id: undefined }
    expect(cambioEnVuelo(sinProyecto) && proyectoVivoDe(sinProyecto)).toBe(false)
  })
})
