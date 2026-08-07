// Permisos de UI — aprobación de formularios SST (cola de revisión).
// El contrato: residente_sst revisa formularios como sst (respaldado por
// puedeRevisarFormularios() en firestore.rules) SIN ganar gestión de users,
// obras ni contratistas; gerencia_general se queda en solo lectura.
import { describe, it, expect } from 'vitest'
import {
  puedeAprobarRegistros,
  ROLES_GESTIONA_OBRAS,
  ROLES_GESTIONA_CONTRATISTAS,
  ROLES_VE_PROYECTOS,
  ROLES_GESTIONA_PROYECTOS,
  veProyectosUI,
  puedeGestionarProyectosUI,
  ROLES_GESTIONA_CLIENTES,
} from '../permisos'

describe('puedeAprobarRegistros — cola de revisión SST', () => {
  it('residente_sst puede aprobar/rechazar (nuevo)', () => {
    expect(puedeAprobarRegistros('residente_sst')).toBe(true)
  })

  it('sst, admin y gestion_integral siguen pudiendo (sin regresión)', () => {
    expect(puedeAprobarRegistros('sst')).toBe(true)
    expect(puedeAprobarRegistros('admin')).toBe(true)
    expect(puedeAprobarRegistros('gestion_integral')).toBe(true)
  })

  it('gerencia_general NO aprueba (solo lectura vía puedeVerSSTSoloLectura)', () => {
    expect(puedeAprobarRegistros('gerencia_general')).toBe(false)
  })

  it('tecnico y rol ausente NO aprueban', () => {
    expect(puedeAprobarRegistros('tecnico')).toBe(false)
    expect(puedeAprobarRegistros(undefined)).toBe(false)
  })
})

describe('residente_sst — sin sobre-otorgamiento fuera de la cola SST', () => {
  it('NO gestiona obras ni contratistas', () => {
    expect(ROLES_GESTIONA_OBRAS.includes('residente_sst')).toBe(false)
    expect(ROLES_GESTIONA_CONTRATISTAS.includes('residente_sst')).toBe(false)
  })
})

// ── §16 (ii) — comercial fuera de proyectos (espeja firestore.rules) ────────
describe('§16 (ii) — veProyectosUI / puedeGestionarProyectosUI', () => {
  it('ROLES_VE_PROYECTOS = exactamente los 6 de puedeVerProyectos() en reglas', () => {
    expect([...ROLES_VE_PROYECTOS].sort()).toEqual([
      'admin', 'auxiliar_proyectos', 'director_proyectos',
      'gerencia_administrativa', 'gerencia_general', 'gestion_integral',
    ])
  })

  it('operacion_comercial NO ve proyectos (ni sst/residente_sst/tecnico)', () => {
    for (const r of ['operacion_comercial', 'sst', 'residente_sst', 'tecnico', undefined])
      expect(veProyectosUI(r)).toBe(false)
  })

  it('los 6 roles SÍ ven proyectos', () => {
    for (const r of ROLES_VE_PROYECTOS) expect(veProyectosUI(r)).toBe(true)
  })

  it('gestión de proyectos = espejo de puedeCrearProyectos() (4 roles, sin comercial)', () => {
    expect([...ROLES_GESTIONA_PROYECTOS].sort()).toEqual([
      'admin', 'auxiliar_proyectos', 'director_proyectos', 'gerencia_general',
    ])
    expect(puedeGestionarProyectosUI('operacion_comercial')).toBe(false)
    expect(puedeGestionarProyectosUI('gerencia_administrativa')).toBe(false)
    expect(puedeGestionarProyectosUI('gestion_integral')).toBe(false)
  })

  it('comercial CONSERVA su dominio: clientes/solicitudes/cotizaciones', () => {
    expect(ROLES_GESTIONA_CLIENTES.includes('operacion_comercial')).toBe(true)
  })
})
