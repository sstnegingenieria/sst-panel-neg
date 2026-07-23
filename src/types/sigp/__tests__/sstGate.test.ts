// Gate SST (Administrativa · Bloque 3a) — helpers puros del modelo.
// El contrato: ausencia de sst_gate == 'pendiente'; solo 'al_dia' habilita
// la liquidación (Bloque 3b); la cola de verificación es el tramo
// administrativo ya ejecutado (facturado / pagado_cliente).
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  ESTADOS_PROYECTO, ESTADOS_SST_GATE, SST_GATE_LABEL, SST_GATE_COLOR,
  estadoSstGate, sstGateAlDia, enColaVerificacionSst,
} from '../proyecto'
import type { SstGateProyecto, EstadoProyecto } from '../proyecto'

const gate = (estado: SstGateProyecto['estado'], observacion?: string): SstGateProyecto => ({
  estado,
  verificado_por: 'uid_sst',
  fecha: Timestamp.fromMillis(1753200000000),
  ...(observacion ? { observacion } : {}),
})

describe('estadoSstGate — ausente = pendiente', () => {
  it('sin sst_gate devuelve pendiente (todos los proyectos históricos)', () => {
    expect(estadoSstGate({})).toBe('pendiente')
    expect(estadoSstGate({ sst_gate: undefined })).toBe('pendiente')
  })

  it('con sst_gate devuelve su estado', () => {
    expect(estadoSstGate({ sst_gate: gate('al_dia') })).toBe('al_dia')
    expect(estadoSstGate({ sst_gate: gate('con_novedad', 'faltan permisos') })).toBe('con_novedad')
    expect(estadoSstGate({ sst_gate: gate('pendiente') })).toBe('pendiente')
  })
})

describe('sstGateAlDia — condición de la liquidación (Bloque 3b)', () => {
  it('solo al_dia habilita', () => {
    expect(sstGateAlDia({ sst_gate: gate('al_dia') })).toBe(true)
    expect(sstGateAlDia({ sst_gate: gate('con_novedad', 'x') })).toBe(false)
    expect(sstGateAlDia({ sst_gate: gate('pendiente') })).toBe(false)
    expect(sstGateAlDia({})).toBe(false)
  })
})

describe('enColaVerificacionSst — tramo administrativo ejecutado', () => {
  it('facturado y pagado_cliente entran a la cola', () => {
    expect(enColaVerificacionSst('facturado')).toBe(true)
    expect(enColaVerificacionSst('pagado_cliente')).toBe(true)
  })

  it('ningún otro estado del ciclo entra', () => {
    const fuera = ESTADOS_PROYECTO.filter(
      (e): e is EstadoProyecto => e !== 'facturado' && e !== 'pagado_cliente',
    )
    for (const e of fuera) expect(enColaVerificacionSst(e), e).toBe(false)
  })
})

describe('constantes del gate', () => {
  it('los 3 estados tienen label y color (sin azules)', () => {
    expect(ESTADOS_SST_GATE).toEqual(['pendiente', 'al_dia', 'con_novedad'])
    for (const e of ESTADOS_SST_GATE) {
      expect(SST_GATE_LABEL[e]).toBeTruthy()
      expect(SST_GATE_COLOR[e]).toBeTruthy()
      expect(SST_GATE_COLOR[e]).not.toMatch(/blue|sky|indigo|cyan/)
    }
  })
})
