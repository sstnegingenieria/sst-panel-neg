// Aprobador de respaldo con salvedad (23-jul-2026) — capa de permisos UI.
// Contrato: la titular es gerencia_administrativa (sin salvedad); los
// respaldos (gerencia_general, gestion_integral, admin) SIEMPRE con
// salvedad; los roles de PROYECTOS jamás aprueban (segregación: quien
// define no aprueba).
import { describe, it, expect } from 'vitest'
import {
  ROLES_APRUEBA_PRELIQUIDACION, puedeAprobarPreliquidacionUI,
  aprobacionRequiereSalvedad,
} from '../permisos'

describe('aprobación de preliquidación con respaldo', () => {
  it('titular + 3 respaldos son los únicos aprobadores', () => {
    expect([...ROLES_APRUEBA_PRELIQUIDACION].sort()).toEqual(
      ['admin', 'gerencia_administrativa', 'gerencia_general', 'gestion_integral'])
  })

  it('los roles de PROYECTOS no aprueban (definir y aprobar en la misma área rompe la segregación)', () => {
    for (const rol of ['operacion_comercial', 'auxiliar_proyectos', 'director_proyectos']) {
      expect(puedeAprobarPreliquidacionUI(rol), rol).toBe(false)
    }
  })

  it('la titular aprueba SIN salvedad; todo respaldo la exige', () => {
    expect(aprobacionRequiereSalvedad('gerencia_administrativa')).toBe(false)
    for (const rol of ['gerencia_general', 'gestion_integral', 'admin']) {
      expect(aprobacionRequiereSalvedad(rol), rol).toBe(true)
    }
  })

  it('un rol sin permiso de aprobar tampoco "requiere salvedad" (no aprueba y punto)', () => {
    expect(aprobacionRequiereSalvedad('operacion_comercial')).toBe(false)
    expect(aprobacionRequiereSalvedad('sst')).toBe(false)
    expect(aprobacionRequiereSalvedad(undefined)).toBe(false)
  })
})
