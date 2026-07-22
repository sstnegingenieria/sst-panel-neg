// Bloque D — obra-espejo proyecto → panel SST (contrato exacto con la app).
import { describe, it, expect } from 'vitest'
import { construirObraEspejo, estadoObraSegunProyecto, idObraEspejo, mesAnio } from '../obraEspejo'
import type { Proyecto } from '../../../types/sigp/proyecto'

const FECHA = new Date(2026, 6, 22)   // jul-2026

const proyecto = {
  id: 'abc123',
  consecutivo: 'PRY-2026-007',
  snapshot: {
    cliente: 'IHS', asunto: 'Correctivo línea de vida',
    valor_venta: 1, esquema_tributario: 'iva_pleno', alcance: [], total_items: 1,
  },
} as unknown as Pick<Proyecto, 'id' | 'consecutivo' | 'snapshot'>

describe('idObraEspejo — idempotencia por construcción', () => {
  it('deriva el id de la obra del id del proyecto', () => {
    expect(idObraEspejo('abc123')).toBe('pry_abc123')
  })
})

describe('construirObraEspejo — contrato exacto de la app Flutter', () => {
  // Bloque 1: el snapshot trae la identificación del sitio capturada en origen
  const conSitio = {
    ...proyecto,
    snapshot: { ...proyecto.snapshot, nombre_sitio: 'ALKARAWI', codigo_sitio_cliente: 'COCUN7002' },
  } as typeof proyecto

  it('Bloque 1: nombre LIMPIO del sitio + código del cliente; el PRY va aparte', () => {
    const o = construirObraEspejo(conSitio, undefined, FECHA)
    expect(o.nombre_sitio).toBe('ALKARAWI')
    expect(o.codigo).toBe('COCUN7002')
    expect(o.nombre_completo).toBe('ALKARAWI | COCUN7002 | IHS')
    expect(o.proyecto_consecutivo).toBe('PRY-2026-007')   // referencia, no código
  })
  it("código del cliente vacío → 'N/A'", () => {
    const sinCodigo = {
      ...proyecto,
      snapshot: { ...proyecto.snapshot, nombre_sitio: 'ALKARAWI', codigo_sitio_cliente: '  ' },
    } as typeof proyecto
    expect(construirObraEspejo(sinCodigo, undefined, FECHA).codigo).toBe('N/A')
  })
  it('LEGACY (snapshot sin nombre_sitio): título derivado + código = PRY', () => {
    const o = construirObraEspejo(proyecto, 'LA CEJA', FECHA)
    expect(o.nombre_sitio).toBe(`LA CEJA — Correctivo línea de vida (${mesAnio(FECHA)})`)
    expect(o.codigo).toBe('PRY-2026-007')
    expect(o.nombre_completo).toBe(`${o.nombre_sitio} | PRY-2026-007 | IHS`)
  })
  it('LEGACY sin sitio conocido → título desde el asunto', () => {
    const o = construirObraEspejo(proyecto, undefined, FECHA)
    expect(o.nombre_sitio).toBe(`Correctivo línea de vida (${mesAnio(FECHA)})`)
  })
  it('marca el espejo: origen sigp + referencia al proyecto', () => {
    const o = construirObraEspejo(conSitio, undefined, FECHA)
    expect(o.origen).toBe('sigp')
    expect(o.proyecto_id).toBe('abc123')
    expect(o.proyecto_consecutivo).toBe('PRY-2026-007')
  })
  it('Bloque 3+5: lleva el contratista PRINCIPAL de la asignación (la app lo ignora)', () => {
    const conAsignacion = {
      ...conSitio,
      asignacion: { contratista_id: 'redes-alturas', contratista_nombre: 'Redes y Alturas' },
    } as unknown as typeof conSitio
    expect(construirObraEspejo(conAsignacion, undefined, FECHA).contratista_id).toBe('redes-alturas')
    expect(construirObraEspejo(conSitio, undefined, FECHA).contratista_id).toBeUndefined()
  })
})

describe('estadoObraSegunProyecto — inactiva desde el handoff (decisión 22-jul)', () => {
  it('activa durante todo el trabajo de campo', () => {
    for (const e of ['en_ejecucion', 'ejecutado', 'entregado_cliente', 'soporte_recibido'] as const)
      expect(estadoObraSegunProyecto(e)).toBe('activa')
  })
  it('inactiva desde enviado_a_facturacion y en los estados administrativos', () => {
    for (const e of ['enviado_a_facturacion', 'facturado', 'pagado_cliente', 'liquidado_contratista', 'cerrado'] as const)
      expect(estadoObraSegunProyecto(e)).toBe('inactiva')
  })
})
