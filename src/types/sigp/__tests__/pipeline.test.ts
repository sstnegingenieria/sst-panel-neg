// Pipeline automático solicitud → visita → cotización (23-jul-2026).
// Contrato: los borradores nacen SIN código (el consecutivo se asigna al
// MATERIALIZAR — contigüidad ISO); precargados de la solicitud; los estados
// nuevos entran a las máquinas sin romper las existentes.
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { docBorradorVisita, docBorradorCotizacion } from '../../../utils/sigp/pipeline'
import { ESTADOS_VISITA, TRANSICIONES as TRANS_VISITA } from '../visita'
import { ESTADOS_COTIZACION, TRANSICIONES as TRANS_COT, estadoEfectivo } from '../cotizacion'
import type { Solicitud } from '../solicitud'

const ahora = Timestamp.fromMillis(1753300000000)
const solicitud = {
  id: 'solX', consecutivo: 'SOL-2026-009', estado: 'requiere_visita',
  cliente_id: 'cli1', contacto: { nombre: 'Laura Pérez' },
  asunto: 'Adecuación estación Ráquira',
  nombre_sitio: 'RAQ-001 CERRO', codigo_sitio_cliente: 'RAQ-001',
} as unknown as Solicitud

describe('máquinas de estados ampliadas', () => {
  it('visita: pendiente_agendar entra ANTES de programada y solo va a programada/cancelada', () => {
    expect(ESTADOS_VISITA[0]).toBe('pendiente_agendar')
    expect(TRANS_VISITA.pendiente_agendar).toEqual(['programada', 'cancelada'])
    expect(TRANS_VISITA.programada).toEqual(['realizada', 'cancelada'])  // intacta
  })

  it('cotización: pendiente_diligenciar solo va a borrador; el resto intacto', () => {
    expect(ESTADOS_COTIZACION[0]).toBe('pendiente_diligenciar')
    expect(TRANS_COT.pendiente_diligenciar).toEqual(['borrador'])
    expect(TRANS_COT.borrador).toEqual(['enviada'])
  })

  it('estadoEfectivo NO convierte un pendiente en vencida', () => {
    expect(estadoEfectivo({ estado: 'pendiente_diligenciar' })).toBe('pendiente_diligenciar')
  })
})

describe('docBorradorVisita — borrador SIN código, precargado', () => {
  const d = docBorradorVisita(solicitud, 'uid1', ahora)

  it('nace pendiente_agendar y SIN consecutivo (se asigna al agendar)', () => {
    expect(d.estado).toBe('pendiente_agendar')
    expect(d.consecutivo).toBe('')
  })

  it('precarga de la solicitud: enlace, cliente y sitio', () => {
    expect(d.solicitud_id).toBe('solX')
    expect(d.cliente_id).toBe('cli1')
    expect(d.sitio).toBe('RAQ-001 CERRO')
  })

  it('historial arranca en pendiente_agendar', () => {
    expect((d.historial as { a: string }[])[0].a).toBe('pendiente_agendar')
  })
})

describe('docBorradorCotizacion — borrador SIN código, precargado', () => {
  const { padre, version } = docBorradorCotizacion(solicitud, 'uid1', ahora, {
    contactos: [{ nombre: 'Otro Contacto' }],
    condiciones_comerciales: { esquema_impuestos: 'aiu' },
  } as never)

  it('nace pendiente_diligenciar y SIN consecutivo (se asigna al diligenciar)', () => {
    expect(padre.estado).toBe('pendiente_diligenciar')
    expect(padre.consecutivo).toBe('')
  })

  it('precarga: asunto, contacto de la solicitud (prioridad sobre el cliente), sitio y enlace', () => {
    expect(padre.asunto).toBe('Adecuación estación Ráquira')
    expect(padre.contacto).toBe('Laura Pérez')
    expect(padre.nombre_sitio).toBe('RAQ-001 CERRO')
    expect(padre.codigo_sitio_cliente).toBe('RAQ-001')
    expect(padre.solicitud_id).toBe('solX')
  })

  it('la versión 1 hereda el esquema tributario del cliente', () => {
    expect(version.esquema).toBe('aiu')
    expect(version.items).toEqual([])
  })

  it('desde visita: guarda la traza visita_id', () => {
    const { padre: p2 } = docBorradorCotizacion(solicitud, 'uid1', ahora, null, 'visY')
    expect(p2.visita_id).toBe('visY')
  })

  it('sin asunto en la solicitud: fallback al consecutivo SOL', () => {
    const { padre: p3 } = docBorradorCotizacion({ ...solicitud, asunto: undefined } as never, 'uid1', ahora, null)
    expect(p3.asunto).toBe('Solicitud SOL-2026-009')
  })
})
