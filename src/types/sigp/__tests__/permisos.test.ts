// Permisos de UI — aprobación de formularios SST (cola de revisión).
// El contrato: residente_sst revisa formularios como sst (respaldado por
// puedeRevisarFormularios() en firestore.rules) SIN ganar gestión de users,
// obras ni contratistas; gerencia_general se queda en solo lectura.
import { describe, it, expect } from 'vitest'
import {
  puedeAprobarRegistros,
  ROLES_GESTIONA_OBRAS,
  ROLES_GESTIONA_CONTRATISTAS,
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
