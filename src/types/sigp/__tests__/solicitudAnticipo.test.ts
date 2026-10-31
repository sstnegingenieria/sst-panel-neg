// Parte D (31-oct) — SOLICITUD de anticipo adicional: dos pasos, dos
// personas (calca OC). Solo el giro ADICIONAL; dos soportes SEPARADOS;
// solicita=gestores, gira=GA/admin; nadie solicita Y gira; devuelta NO
// terminal. Sin aprobación intermedia: la evaluación de Marcela es el
// segundo par de ojos.
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  patchSolicitarAnticipo, patchDevolverSolicitudAnticipo,
  patchReenviarSolicitudAnticipo, patchGirarDesdeSolicitud,
  girosDe, anticipoTotalDe, resumenAsignacionesDe,
} from '../asignacion'
import type { AsignacionContratista } from '../asignacion'

const ts = Timestamp.fromDate(new Date('2026-10-31T15:00:00'))
const ALCANCE = { alcance: [{ grupo: 'G1', items: 1, subtotal: 1_000_000 }] }

const girada = (over: Partial<AsignacionContratista> = {}): AsignacionContratista => ({
  id: 'a1', estado: 'anticipo_girado', contratista_id: 'c1', contratista_nombre: 'Héctor',
  atomos: ['G1'], fecha: ts, fecha_creacion: ts, asignado_por: 'u1',
  modalidad: 'todo_costo', compras_reembolsos: [], historial: [],
  habilitacion_snapshot: { estado: 'activo', fecha_consulta: ts, fuente: 'test' },
  preliquidacion: {
    valor_alcance: 1_000_000, valor_contratista: 700_000, anticipo_pct: 50,
    definida_por: 'diego', fecha_definicion: ts, aprobada_por: 'marcela', fecha_aprobacion: ts,
    giros: [{ valor: 350_000, fecha: ts, registrado_por: 'marcela' }],
  },
  ...over,
} as AsignacionContratista)

const DATOS = { monto_propuesto: 150_000, motivo: 'faltó material por lluvia', soporte_url: 'https://x/soporte.pdf', soporte_nombre: 'soporte.pdf' }
const GIRO = { valor: 150_000, fecha: ts, registrado_por: 'marcela', por_nombre: 'Marcela', evidencia_url: 'https://x/transfer.pdf', evidencia_nombre: 'transfer.pdf' }

const conSolicitud = () => {
  const r = patchSolicitarAnticipo(girada(), DATOS, 'diego', ts, 'Diego')!
  return { ...girada(), ...r.sub } as AsignacionContratista
}

describe('PASO 1 — solicitar (Proyectos)', () => {
  it('feliz: queda solicitada con los datos, el soporte DEL CONTRATISTA y el solicitante', () => {
    const r = patchSolicitarAnticipo(girada(), DATOS, 'diego', ts, 'Diego')!
    const s = r.sub.solicitudes_anticipo![0]
    expect(s.estado).toBe('solicitada')
    expect(s.monto_propuesto).toBe(150_000)
    expect(s.soporte_contratista_url).toBe('https://x/soporte.pdf')
    expect(s.solicitado_por).toBe('diego')
    expect(r.entradaHistorial.motivo).toContain('SOLICITUD de anticipo adicional — 150000')
  })
  it('rehúsa: sin giro previo (no es ADICIONAL), directa, sin motivo/soporte/monto, o con una en vuelo', () => {
    expect(patchSolicitarAnticipo(girada({ estado: 'preliquidacion_aprobada' }), DATOS, 'd', ts)).toBeNull()
    expect(patchSolicitarAnticipo(girada({ tipo: 'administracion_directa' }), DATOS, 'd', ts)).toBeNull()
    expect(patchSolicitarAnticipo(girada(), { ...DATOS, motivo: '  ' }, 'd', ts)).toBeNull()
    expect(patchSolicitarAnticipo(girada(), { ...DATOS, soporte_url: '' }, 'd', ts)).toBeNull()
    expect(patchSolicitarAnticipo(girada(), { ...DATOS, monto_propuesto: 0 }, 'd', ts)).toBeNull()
    expect(patchSolicitarAnticipo(conSolicitud(), DATOS, 'd', ts)).toBeNull()
  })
})

describe('devolver y reenviar — la devuelta NO es terminal', () => {
  it('devolver exige motivo y deja la devolución VISIBLE; reenviar la reabre con datos nuevos', () => {
    const a = conSolicitud()
    expect(patchDevolverSolicitudAnticipo(a, '   ', 'marcela', ts)).toBeNull()
    const d = patchDevolverSolicitudAnticipo(a, 'falta el detalle del material', 'marcela', ts, 'Marcela')!
    const dev = d.sub.solicitudes_anticipo![0]
    expect(dev.estado).toBe('devuelta')
    expect(dev.devolucion?.motivo).toBe('falta el detalle del material')
    expect(d.entradaHistorial.motivo).toContain('DEVUELTA')
    // reenvío: nuevos datos, vuelve a solicitada, quien reenvía es el solicitante
    const a2 = { ...a, ...d.sub } as AsignacionContratista
    expect(patchReenviarSolicitudAnticipo(a, DATOS, 'diego', ts)).toBeNull()   // solo sobre devuelta
    const r = patchReenviarSolicitudAnticipo(a2, { ...DATOS, monto_propuesto: 120_000, soporte_url: 'https://x/v2.pdf' }, 'paula', ts, 'Paula')!
    const re = r.sub.solicitudes_anticipo![0]
    expect(re.estado).toBe('solicitada')
    expect(re.monto_propuesto).toBe(120_000)
    expect(re.solicitado_por).toBe('paula')
    expect(r.entradaHistorial.motivo).toContain('responde a la devolución: falta el detalle del material')
  })
})

describe('PASO 2 — girar desde la solicitud (Gerencia)', () => {
  it('feliz: giro por la maquinaria de la C (motivo de la solicitud, comprobante propio), solicitud girada con puntero', () => {
    const a = conSolicitud()
    const r = patchGirarDesdeSolicitud(a, GIRO, 'marcela', ts)!
    const giros = girosDe(r.sub.preliquidacion!)
    expect(giros).toHaveLength(2)
    expect(giros[1].motivo).toBe('faltó material por lluvia')     // soporte 1 ≠ soporte 2
    expect(giros[1].evidencia_url).toBe('https://x/transfer.pdf')
    const s = r.sub.solicitudes_anticipo![0]
    expect(s.estado).toBe('girada')
    expect(s.giro_indice).toBe(1)
    expect(anticipoTotalDe(r.sub.preliquidacion!)).toBe(500_000)
    expect(r.entradaHistorial.motivo).toContain('desde la SOLICITUD de Diego')
  })
  it('NADIE solicita y gira — rehúsa aunque sea admin en los dos lados', () => {
    const a = { ...girada(), ...patchSolicitarAnticipo(girada(), DATOS, 'root', ts, 'Admin')!.sub } as AsignacionContratista
    expect(patchGirarDesdeSolicitud(a, { ...GIRO, registrado_por: 'root' }, 'root', ts)).toBeNull()
  })
  it('exige comprobante (C1b) y solicitud en evaluación; si el monto difiere queda dicho con las dos cifras', () => {
    const a = conSolicitud()
    expect(patchGirarDesdeSolicitud(a, { ...GIRO, evidencia_url: undefined }, 'marcela', ts)).toBeNull()
    expect(patchGirarDesdeSolicitud(girada(), GIRO, 'marcela', ts)).toBeNull()   // sin solicitud
    const r = patchGirarDesdeSolicitud(a, { ...GIRO, valor: 140_000 }, 'marcela', ts)!
    expect(r.entradaHistorial.motivo).toContain('propuesto 150000, girado 140000')
  })
  it('sobre-acordado: el aviso de la C viaja intacto', () => {
    const a = conSolicitud()
    const r = patchGirarDesdeSolicitud(a, { ...GIRO, valor: 400_000 }, 'marcela', ts)!
    expect(r.sobreAcordado).toBe(true)
  })
})

describe('resumen — la cola de Gerencia', () => {
  it('solicitada cuenta; devuelta y girada no', () => {
    const base = girada()
    expect(resumenAsignacionesDe([conSolicitud()], ALCANCE).solicitudes_anticipo_pendientes).toBe(1)
    const dev = { ...conSolicitud(), ...patchDevolverSolicitudAnticipo(conSolicitud(), 'x', 'm', ts)!.sub } as AsignacionContratista
    expect(resumenAsignacionesDe([dev], ALCANCE).solicitudes_anticipo_pendientes).toBe(0)
    const gir = { ...conSolicitud(), ...patchGirarDesdeSolicitud(conSolicitud(), GIRO, 'marcela', ts)!.sub } as AsignacionContratista
    expect(resumenAsignacionesDe([gir], ALCANCE).solicitudes_anticipo_pendientes).toBe(0)
    expect(resumenAsignacionesDe([base], ALCANCE).solicitudes_anticipo_pendientes).toBe(0)
  })
})
