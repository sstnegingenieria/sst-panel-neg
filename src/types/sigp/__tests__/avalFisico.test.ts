// Aval SST por formatos FÍSICOS — validación y patch builder puros.
// El contrato: sin escaneo (ni quién, fecha, formatos, motivo) NO hay aval; el
// mismo predicado habilita el botón y valida el guardado; 'otro' exige nombrar
// el formato propio del cliente; la evidencia se copia al historial.
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  MIN_MOTIVO_FISICO, OPCIONES_TIPO_FORMATO, TIPO_FORMATO_OTRO,
  avalFisicoValido, esAvalFisico, etiquetasFormatosAval,
  fechaFormatosATimestampMs, motivoHistorialFisico, patchAvalFisico, validarAvalFisico,
} from '../avalFisico'
import type { EntradaAvalFisico } from '../avalFisico'
import { puedeAvalarFisicoUI, puedeMarcarSstGateUI } from '../permisos'
import { TIPO_LABELS } from '../../formulario'
import type { SstGateProyecto } from '../proyecto'

const HOY = new Date('2026-10-13T15:00:00')

const completa = (extra: Partial<EntradaAvalFisico> = {}): EntradaAvalFisico => ({
  soporte_url: 'https://firebasestorage.googleapis.com/v0/b/x/o/verificacion_sst%2Fp1%2Ffisico%2Fu.pdf?alt=media',
  quien_tiene_original: 'Ing. Pérez',
  cargo: 'Supervisor del cliente',
  fecha_formatos: '2026-10-10',
  tipos_formato: ['ats', 'permiso_alturas'],
  motivo: 'El cliente exige los formatos SST impresos y firmados',
  ...extra,
})

describe('validarAvalFisico — sin evidencia no hay aval', () => {
  it('una entrada completa valida', () => {
    expect(validarAvalFisico(completa(), HOY)).toEqual({})
    expect(avalFisicoValido(completa(), HOY)).toBe(true)
  })

  it('sin escaneo cargado NO valida (el botón no se habilita)', () => {
    expect(validarAvalFisico(completa({ soporte_url: '' }), HOY).soporte_url).toBeTruthy()
    expect(avalFisicoValido(completa({ soporte_url: '   ' }), HOY)).toBe(false)
  })

  it('cada campo obligatorio, ausente, bloquea', () => {
    expect(avalFisicoValido(completa({ quien_tiene_original: '' }), HOY)).toBe(false)
    expect(avalFisicoValido(completa({ quien_tiene_original: 'ab' }), HOY)).toBe(false)
    expect(avalFisicoValido(completa({ fecha_formatos: '' }), HOY)).toBe(false)
    expect(avalFisicoValido(completa({ tipos_formato: [] }), HOY)).toBe(false)
    expect(avalFisicoValido(completa({ motivo: '' }), HOY)).toBe(false)
  })

  it('el cargo es opcional', () => {
    expect(avalFisicoValido(completa({ cargo: undefined }), HOY)).toBe(true)
  })

  it('el motivo tiene longitud mínima — un "x" no es evidencia', () => {
    expect(avalFisicoValido(completa({ motivo: 'x'.repeat(MIN_MOTIVO_FISICO - 1) }), HOY)).toBe(false)
    expect(avalFisicoValido(completa({ motivo: 'x'.repeat(MIN_MOTIVO_FISICO) }), HOY)).toBe(true)
  })

  it('la fecha de los formatos no puede estar en el futuro', () => {
    expect(avalFisicoValido(completa({ fecha_formatos: '2026-10-14' }), HOY)).toBe(false)
  })

  it('el día de HOY es válido a cualquier hora (medianoche local, no mediodía)', () => {
    const temprano = new Date('2026-10-13T06:00:00')
    expect(avalFisicoValido(completa({ fecha_formatos: '2026-10-13' }), temprano)).toBe(true)
  })

  it("'otro' exige nombrar el formato del cliente", () => {
    const base = completa({ tipos_formato: ['ats', TIPO_FORMATO_OTRO] })
    expect(validarAvalFisico(base, HOY).formato_otro).toBeTruthy()
    expect(avalFisicoValido({ ...base, formato_otro: 'Permiso de trabajo Claro' }, HOY)).toBe(true)
    // sin 'otro' el texto libre no se exige
    expect(avalFisicoValido(completa({ tipos_formato: ['ats'] }), HOY)).toBe(true)
  })
})

describe('opciones de formato', () => {
  it('son los 14 tipos de la app + otro', () => {
    expect(OPCIONES_TIPO_FORMATO).toHaveLength(Object.keys(TIPO_LABELS).length + 1)
    expect(OPCIONES_TIPO_FORMATO[OPCIONES_TIPO_FORMATO.length - 1].valor).toBe(TIPO_FORMATO_OTRO)
    expect(Object.keys(TIPO_LABELS)).toHaveLength(14)
  })

  it('etiquetas legibles; "otro" muestra el texto libre', () => {
    expect(etiquetasFormatosAval({ tipos_formato: ['ats', 'otro'], formato_otro: 'Formato Claro' }))
      .toEqual(['ATS', 'Formato Claro'])
  })
})

describe('patchAvalFisico — el write exacto', () => {
  const ahoraSrv = Symbol('serverTimestamp')
  const ahoraCli = Timestamp.fromMillis(1760000000000)
  const fechaF = Timestamp.fromMillis(fechaFormatosATimestampMs('2026-10-10'))

  it('null si la entrada no valida o no hay uid', () => {
    expect(patchAvalFisico(completa({ soporte_url: '' }), 'ingrid', 'pendiente', ahoraSrv, ahoraCli, fechaF, HOY)).toBeNull()
    expect(patchAvalFisico(completa(), '', 'pendiente', ahoraSrv, ahoraCli, fechaF, HOY)).toBeNull()
  })

  it('arma sst_gate físico: al_dia + origen + evidencia, fecha del SERVIDOR', () => {
    const p = patchAvalFisico(completa(), 'ingrid', 'pendiente', ahoraSrv, ahoraCli, fechaF, HOY)!
    const g = p.sst_gate as Record<string, any>
    expect(g.estado).toBe('al_dia')
    expect(g.origen).toBe('fisico')
    expect(g.verificado_por).toBe('ingrid')
    expect(g.fecha).toBe(ahoraSrv)
    expect(g.fisico.registrado_por).toBe('ingrid')
    expect(g.fisico.fecha_registro).toBe(ahoraSrv)
    expect(g.fisico.fecha_formatos).toBe(fechaF)
    expect(g.fisico.tipos_formato).toEqual(['ats', 'permiso_alturas'])
    expect(g.fisico.cargo).toBe('Supervisor del cliente')
    // sin 'otro' no se arrastra formato_otro
    expect('formato_otro' in g.fisico).toBe(false)
    // jamás una observación de novedad en un aval al día
    expect('observacion' in g).toBe(false)
  })

  it('la entrada del historial COPIA la evidencia (con Timestamp real, apta para arrayUnion)', () => {
    const p = patchAvalFisico(completa(), 'ingrid', 'con_novedad', ahoraSrv, ahoraCli, fechaF, HOY)!
    expect(p.entradaHistorial.de).toBe('con_novedad')
    expect(p.entradaHistorial.a).toBe('al_dia')
    expect(p.entradaHistorial.por).toBe('ingrid')
    expect(p.entradaHistorial.fecha).toBe(ahoraCli)
    expect(p.entradaHistorial.fisico?.soporte_url).toBe(completa().soporte_url)
    expect(p.entradaHistorial.fisico?.fecha_registro).toBe(ahoraCli)
    expect(p.entradaHistorial.motivo).toContain('FORMATOS FÍSICOS')
    expect(p.entradaHistorial.motivo).toContain('Ing. Pérez')
  })

  it("'otro' viaja con su texto libre", () => {
    const p = patchAvalFisico(
      completa({ tipos_formato: [TIPO_FORMATO_OTRO], formato_otro: ' Formato Claro ' }),
      'ingrid', 'pendiente', ahoraSrv, ahoraCli, fechaF, HOY)!
    expect((p.sst_gate as any).fisico.formato_otro).toBe('Formato Claro')
  })
})

describe('esAvalFisico — el badge', () => {
  const g = (extra: Partial<SstGateProyecto>): SstGateProyecto => ({
    estado: 'al_dia', verificado_por: 'u', fecha: Timestamp.fromMillis(1), ...extra,
  })
  it('solo con origen físico Y evidencia presente', () => {
    expect(esAvalFisico(undefined)).toBe(false)
    expect(esAvalFisico(g({}))).toBe(false)                       // histórico = app
    expect(esAvalFisico(g({ origen: 'app' }))).toBe(false)
    expect(esAvalFisico(g({ origen: 'fisico' }))).toBe(false)     // sin evidencia no es físico
  })
  it('motivoHistorialFisico nombra quién tiene el original', () => {
    expect(motivoHistorialFisico({ quien_tiene_original: ' Ana ', motivo: ' por el cliente ' }))
      .toContain('Ana')
  })
})

describe('permisos — la vía física es SOLO de gestion_integral', () => {
  it('únicamente gestion_integral avala físico', () => {
    expect(puedeAvalarFisicoUI('gestion_integral')).toBe(true)
    for (const r of ['sst', 'residente_sst', 'admin', 'gerencia_general', 'gerencia_administrativa',
      'director_proyectos', 'auxiliar_proyectos', 'operacion_comercial', 'residente_obra', 'tecnico', undefined]) {
      expect(puedeAvalarFisicoUI(r), String(r)).toBe(false)
    }
  })

  it('el aval por app conserva su helper (sst/residente_sst/gestion_integral)', () => {
    expect(puedeMarcarSstGateUI('sst')).toBe(true)
    expect(puedeMarcarSstGateUI('residente_sst')).toBe(true)
    expect(puedeMarcarSstGateUI('gestion_integral')).toBe(true)
    expect(puedeMarcarSstGateUI('admin')).toBe(false)
  })
})
