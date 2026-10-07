// OC2 — revisión de Gestión Administrativa: máquina nueva + builders puros.
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  TRANSICIONES_OC, ESTADOS_OC, ESTADO_OC_LABEL, ESTADO_OC_COLOR,
  patchRevisarOc, patchRechazarOc, patchReenviarOc,
  pdfDescargable, pdfMarcado, puedeEditarOc,
} from '../ordenCompra'
import type { OrdenCompra } from '../ordenCompra'

const ahora = Timestamp.fromMillis(1_760_000_000_000)

const base = (patch: Partial<OrdenCompra> = {}): OrdenCompra => ({
  id: 'oc1', consecutivo: 'OC-2026-100', proyecto_id: 'p1', proyecto_consecutivo: 'PRY-2026-001',
  proveedor_id: 'prov1', proveedor_snapshot: { identificacion: '900.1', razon_social: 'ACME' },
  lineas: [{ descripcion: 'Perno', unidad: 'Und', iva_pct: 19, cantidad: 10, valor_unitario: 1000, valor: 10000 }],
  valor_total: 11900,
  cotizacion_proveedor_url: 'https://x/cot.pdf',
  despacho: { direccion: 'Cra 1', contacto: 'Ana', telefono: '300' },
  condiciones: { forma_pago: 'contado' },
  estado: 'emitida', creada_por: 'uid-creador', historial: [], fecha_creacion: ahora,
  ...patch,
})

describe('OC2 — máquina de estados', () => {
  it('emitida espera la REVISIÓN: sale a revisada/rechazada/anulada — jamás a aprobada (cerrada a entradas)', () => {
    expect(TRANSICIONES_OC.emitida).toEqual(['revisada', 'rechazada', 'anulada'])
    for (const e of ESTADOS_OC) expect(TRANSICIONES_OC[e]).not.toContain('aprobada')
  })
  it('rechazada NO es terminal (vuelve a emitida) — anulada SÍ', () => {
    expect(TRANSICIONES_OC.rechazada).toContain('emitida')
    expect(TRANSICIONES_OC.anulada).toEqual([])
  })
  it('aprobada queda como LEGACY con sus salidas intactas (comprada/anulada)', () => {
    expect(TRANSICIONES_OC.aprobada).toEqual(['comprada', 'anulada'])
  })
  it('revisada avanza a comprada (la compra de Paula)', () => {
    expect(TRANSICIONES_OC.revisada).toEqual(['comprada', 'anulada'])
  })
  it('todos los estados tienen label y color', () => {
    for (const e of ESTADOS_OC) {
      expect(ESTADO_OC_LABEL[e]).toBeTruthy()
      expect(ESTADO_OC_COLOR[e]).toBeTruthy()
    }
  })
})

describe('patchRevisarOc — validar con el total leído de la cotización', () => {
  it('valida desde emitida y traza el total que COINCIDE', () => {
    const p = patchRevisarOc(base(), 'uid-marcela', 11900, ahora)
    expect(p?.estado).toBe('revisada')
    expect(p?.revision.total_cotizacion_proveedor).toBe(11900)
    expect(p?.historial.slice(-1)[0]?.motivo).toContain('coincide')
  })
  it('un total que DIFIERE no bloquea — queda en la traza con ambas cifras', () => {
    const p = patchRevisarOc(base(), 'uid-marcela', 9999, ahora)
    expect(p?.estado).toBe('revisada')
    expect(p?.historial.slice(-1)[0]?.motivo).toContain('DIFIERE')
    expect(p?.historial.slice(-1)[0]?.motivo).toContain('11.900')
  })
  it('sin total (o 0) → null: mirar la cotización no es opcional', () => {
    expect(patchRevisarOc(base(), 'uid-marcela', 0, ahora)).toBeNull()
  })
  it('respaldo que revisa lo PROPIO exige salvedad', () => {
    expect(patchRevisarOc(base(), 'uid-creador', 11900, ahora)).toBeNull()
    const p = patchRevisarOc(base(), 'uid-creador', 11900, ahora, 'no hay titular disponible')
    expect(p?.revision.salvedad).toBe('no hay titular disponible')
    expect(p?.historial.slice(-1)[0]?.motivo).toContain('SALVEDAD')
  })
  it('solo desde emitida', () => {
    expect(patchRevisarOc(base({ estado: 'borrador' }), 'u', 11900, ahora)).toBeNull()
    expect(patchRevisarOc(base({ estado: 'aprobada' }), 'u', 11900, ahora)).toBeNull()
  })
})

describe('patchRechazarOc / patchReenviarOc — la vuelta completa', () => {
  it('devolver exige motivo y deja el rechazo vigente', () => {
    expect(patchRechazarOc(base(), 'uid-marcela', '  ', ahora)).toBeNull()
    const p = patchRechazarOc(base(), 'uid-marcela', 'falta el flete', ahora)
    expect(p?.estado).toBe('rechazada')
    expect(p?.rechazo.motivo).toBe('falta el flete')
  })
  it('re-enviar: SOLO el creador (admin escotilla), limpia el rechazo, historial cuenta la vuelta', () => {
    const oc = base({ estado: 'rechazada', rechazo: { por: 'm', fecha: ahora, motivo: 'x' } })
    expect(patchReenviarOc(oc, 'uid-otro', ahora)).toBeNull()
    expect(patchReenviarOc(oc, 'uid-otro', ahora, true)?.estado).toBe('emitida')
    const p = patchReenviarOc(oc, 'uid-creador', ahora)
    expect(p?.estado).toBe('emitida')
    expect(p?.rechazo).toBeNull()
    expect(p?.historial.slice(-1)[0]?.de).toBe('rechazada')
  })
  it('re-enviar pasa por las MISMAS validaciones de emitir (sin cotización adjunta → null)', () => {
    const oc = base({ estado: 'rechazada', cotizacion_proveedor_url: '' })
    expect(patchReenviarOc(oc, 'uid-creador', ahora)).toBeNull()
  })
  it('dos vueltas quedan contadas en el historial', () => {
    let oc = base()
    const r1 = patchRechazarOc(oc, 'm', 'vuelta 1', ahora)!
    oc = { ...oc, estado: 'rechazada', rechazo: r1.rechazo, historial: r1.historial }
    const e1 = patchReenviarOc(oc, 'uid-creador', ahora)!
    oc = { ...oc, estado: 'emitida', rechazo: null, historial: e1.historial }
    const r2 = patchRechazarOc(oc, 'm', 'vuelta 2', ahora)!
    const vueltas = r2.historial.filter(h => h.a === 'rechazada')
    expect(vueltas).toHaveLength(2)
    expect(vueltas[0].motivo).toContain('vuelta 1')
    expect(vueltas[1].motivo).toContain('vuelta 2')
  })
})

describe('OC2 — la tinta del PDF y la editabilidad', () => {
  it('descargable desde que existe con consecutivo; borrador no', () => {
    expect(pdfDescargable('borrador')).toBe(false)
    for (const e of ['emitida', 'rechazada', 'revisada', 'aprobada', 'comprada'] as const)
      expect(pdfDescargable(e)).toBe(true)
  })
  it('marcado en emitida/rechazada; limpio validada, LEGACY aprobada y comprada', () => {
    expect(pdfMarcado('emitida')).toBe(true)
    expect(pdfMarcado('rechazada')).toBe(true)
    expect(pdfMarcado('revisada')).toBe(false)
    expect(pdfMarcado('aprobada')).toBe(false)   // pasó su gate bajo la regla vigente en su momento
    expect(pdfMarcado('comprada')).toBe(false)
  })
  it('rechazada la edita SOLO su creador (admin escotilla)', () => {
    const oc = base({ estado: 'rechazada' })
    expect(puedeEditarOc(oc, 'uid-creador')).toBe(true)
    expect(puedeEditarOc(oc, 'uid-otro')).toBe(false)
    expect(puedeEditarOc(oc, 'uid-otro', true)).toBe(true)
    expect(puedeEditarOc(base({ estado: 'revisada' }), 'uid-creador')).toBe(false)
  })
})
