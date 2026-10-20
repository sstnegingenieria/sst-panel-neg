import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  contenidoCanonico, hashContenidoActa, trazosSuficientes, verificarIntegridadActa, type Trazo,
} from '../eppFirma'
import { CLAUSULAS_EPP, CLAUSULAS_PENDIENTES, ENCABEZADO_CLAUSULAS_EPP, INTRO_EPP, clausulasListas } from '../eppClausulas'
import { ACTA_ENTREGA_EPP } from '../isoControl'

const linea = (n: number, dx = 4, dy = 1): Trazo => Array.from({ length: n }, (_, i) => ({ x: 10 + i * dx, y: 50 + (i % 5) * dy }))

describe('trazosSuficientes', () => {
  it('sin trazos o con un punto suelto → false', () => {
    expect(trazosSuficientes([])).toBe(false)
    expect(trazosSuficientes([[{ x: 5, y: 5 }]])).toBe(false)
  })
  it('un clic con pocos puntos → false', () => {
    expect(trazosSuficientes([linea(5, 1)])).toBe(false)
  })
  it('un trazo real (muchos puntos, recorrido y caja) → true', () => {
    expect(trazosSuficientes([linea(40)])).toBe(true)
  })
  it('varios trazos cortos que suman una firma → true', () => {
    expect(trazosSuficientes([linea(8, 5), linea(8, 5), linea(8, 5)])).toBe(true)
  })
  it('muchos puntos en el mismo sitio (sin caja ni recorrido) → false', () => {
    expect(trazosSuficientes([Array.from({ length: 50 }, () => ({ x: 10, y: 10 }))])).toBe(false)
  })
})

const base = () => ({
  colaborador: { fuente: 'directo' as const, ref_id: 'e1', nombre: 'Juan', cedula: '123', cargo: 'Técnico' },
  items: [{ nombre: 'Casco', especificacion: 'tipo II', cantidad: 1, unidad: '1' }],
  firmantes_empresa: [{ nombre: 'Pedro', cargo: 'Director' }],
  fecha: Timestamp.fromMillis(1_760_000_000_000),
  clausulas_version: 'v1',
})
const FIRMA = 'data:image/png;base64,' + 'A'.repeat(100)

describe('hash de integridad', () => {
  it('es SHA-256 hex de 64 caracteres y es determinístico', async () => {
    const h1 = await hashContenidoActa(base(), FIRMA)
    const h2 = await hashContenidoActa(base(), FIRMA)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
    expect(h1).toBe(h2)
  })
  it('cambia si cambia la firma, un elemento, el colaborador, la fecha o la versión de las cláusulas', async () => {
    const h = await hashContenidoActa(base(), FIRMA)
    expect(await hashContenidoActa(base(), FIRMA + 'B')).not.toBe(h)
    expect(await hashContenidoActa({ ...base(), items: [{ ...base().items[0], cantidad: 2 }] }, FIRMA)).not.toBe(h)
    expect(await hashContenidoActa({ ...base(), colaborador: { ...base().colaborador, cedula: '999' } }, FIRMA)).not.toBe(h)
    expect(await hashContenidoActa({ ...base(), fecha: Timestamp.fromMillis(1_760_000_001_000) }, FIRMA)).not.toBe(h)
    expect(await hashContenidoActa({ ...base(), clausulas_version: 'v2' }, FIRMA)).not.toBe(h)
  })
  it('el JSON canónico no depende del orden de las claves de entrada', () => {
    const a = base()
    const b = { clausulas_version: a.clausulas_version, fecha: a.fecha, firmantes_empresa: a.firmantes_empresa, items: a.items, colaborador: a.colaborador }
    expect(contenidoCanonico(a, FIRMA)).toBe(contenidoCanonico(b, FIRMA))
  })
  it('verificarIntegridadActa: íntegra si coincide; rota si alguien cambió el contenido; false sin firma', async () => {
    const hash = await hashContenidoActa(base(), FIRMA)
    const firmada = { ...base(), firma_colaborador: FIRMA, firma_hash: hash }
    expect(await verificarIntegridadActa(firmada)).toBe(true)
    expect(await verificarIntegridadActa({ ...firmada, items: [{ ...firmada.items[0], cantidad: 5 }] })).toBe(false)
    expect(await verificarIntegridadActa({ ...firmada, firma_colaborador: FIRMA + 'X' })).toBe(false)
    expect(await verificarIntegridadActa(base())).toBe(false)
  })
})

describe('cláusulas y encabezado oficial', () => {
  it('son 3 cláusulas y el guard de firma depende de que el texto legal esté cargado', () => {
    expect(CLAUSULAS_EPP).toHaveLength(3)
    expect(clausulasListas()).toBe(!CLAUSULAS_PENDIENTES)
  })
  it('el texto legal está cargado (sin marcadores) y el guard permite firmar', () => {
    expect(CLAUSULAS_PENDIENTES).toBe(false)
    expect(clausulasListas()).toBe(true)
    expect([INTRO_EPP, ENCABEZADO_CLAUSULAS_EPP, ...CLAUSULAS_EPP].some(t => t.includes('[Pendiente'))).toBe(false)
    expect(ENCABEZADO_CLAUSULAS_EPP).toBe('El colaborador manifiesta que:')
    expect(CLAUSULAS_EPP[1]).toBe('En caso de daño de la dotación o parte de ella, el trabajador debe devolver a la empresa.')
  })
  it('el encabezado es el del documento oficial confirmado por Gestión Integral', () => {
    expect(ACTA_ENTREGA_EPP).toEqual({
      sistema: 'SG-SST',
      area: 'ÁREA DE GESTIÓN HUMANA Y H.S.E.Q',
      codigo: 'SST-FT-AEP-18',
      version: '02',
      modificado: '06 FEB 2024',
      nombre: 'FORMATO DE ACTA DE ENTREGA DE EPP',
    })
  })
})
