// Permisos de UI del módulo Licitaciones (1.4).
//
// El punto de estos tests no es "el array tiene los roles correctos" — es que
// el array de UI y el helper de firestore.rules digan LO MISMO. Cuando se
// separan, la UI muestra un botón que la regla rechaza (molesto) o esconde
// algo que la regla sí permite (invisible, y peor).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ROLES_VE_LICITACIONES, ROLES_VE_ECONOMIA_LICITACION,
  ROLES_EDITA_PLANTILLA_LICITACIONES,
  veLicitacionesUI, gestionaLicitacionesUI, veEconomiaLicitacionUI,
  editaPlantillaLicitacionesUI,
} from '../permisos'
import { ROLES_PANEL_WEB } from '../roles'
import type { Rol } from '../roles'

const REGLAS = readFileSync(resolve(__dirname, '../../../../firestore.rules'), 'utf8')

/** Extrae la lista de roles de un helper `function nombre() { ... in [ ... ] }`. */
function rolesDelHelper(nombre: string): string[] {
  const re = new RegExp(`function\\s+${nombre}\\s*\\(\\)\\s*\\{[\\s\\S]*?in\\s*\\[([\\s\\S]*?)\\]`, 'm')
  const m = re.exec(REGLAS)
  if (!m) throw new Error(`No se encontró el helper ${nombre} en firestore.rules`)
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]).sort()
}

describe('espejo UI ⟷ firestore.rules', () => {
  it('ROLES_VE_LICITACIONES == gestionaLicitaciones()', () => {
    expect([...ROLES_VE_LICITACIONES].sort()).toEqual(rolesDelHelper('gestionaLicitaciones'))
  })

  it('ROLES_EDITA_PLANTILLA_LICITACIONES == editaPlantillaRequisitos()', () => {
    expect([...ROLES_EDITA_PLANTILLA_LICITACIONES].sort())
      .toEqual(rolesDelHelper('editaPlantillaRequisitos'))
  })

  it('ROLES_VE_ECONOMIA_LICITACION == veEconomiaLicitacion()', () => {
    expect([...ROLES_VE_ECONOMIA_LICITACION].sort()).toEqual(rolesDelHelper('veEconomiaLicitacion'))
  })
})

describe('operacion_comercial — el frente de licitaciones', () => {
  it('VE el módulo: las licitaciones son su trabajo', () => {
    expect(veLicitacionesUI('operacion_comercial')).toBe(true)
    expect(gestionaLicitacionesUI('operacion_comercial')).toBe(true)
  })

  it('CLAVE: NO ve la economía', () => {
    // Quien arma la propuesta no ve el techo con el que se la evalúa.
    expect(veEconomiaLicitacionUI('operacion_comercial')).toBe(false)
    expect(ROLES_VE_ECONOMIA_LICITACION).not.toContain('operacion_comercial')
  })

  it('la economía es un SUBCONJUNTO estricto de quien ve el módulo', () => {
    for (const r of ROLES_VE_ECONOMIA_LICITACION) {
      expect(ROLES_VE_LICITACIONES, r).toContain(r)
    }
    expect(ROLES_VE_ECONOMIA_LICITACION.length).toBeLessThan(ROLES_VE_LICITACIONES.length)
  })
})

describe('quién queda fuera del módulo', () => {
  const FUERA: Rol[] = [
    'sst', 'residente_sst', 'gestion_integral', 'auxiliar_proyectos',
    'tecnico', 'contratista', 'cliente_final', 'residente_obra',
  ]

  it('los roles ajenos al frente no ven el módulo', () => {
    for (const r of FUERA) {
      expect(veLicitacionesUI(r), r).toBe(false)
      expect(veEconomiaLicitacionUI(r), r).toBe(false)
    }
  })

  it('auxiliar_proyectos queda fuera aunque gestione proyectos', () => {
    // Es el actor de mínimo privilegio que "casi puede": la batería de reglas
    // lo usa por lo mismo.
    expect(veLicitacionesUI('auxiliar_proyectos')).toBe(false)
  })

  it('sin rol no ve nada', () => {
    expect(veLicitacionesUI(undefined)).toBe(false)
    expect(veEconomiaLicitacionUI(undefined)).toBe(false)
    expect(veLicitacionesUI('')).toBe(false)
  })

  it('cada rol del panel está clasificado: o ve el módulo, o no', () => {
    for (const r of ROLES_PANEL_WEB) {
      expect(typeof veLicitacionesUI(r), r).toBe('boolean')
    }
  })
})

describe('el residente_obra NO entra por esta puerta', () => {
  it('ni al módulo ni a la economía', () => {
    // Regresión permanente del PR #91: el rol nace pudiendo NADA y cada
    // concesión es explícita. Licitaciones no le concede ninguna.
    expect(ROLES_VE_LICITACIONES).not.toContain('residente_obra')
    expect(ROLES_VE_ECONOMIA_LICITACION).not.toContain('residente_obra')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// La plantilla del pliego típico: quién la escribe (A.2b)
// ─────────────────────────────────────────────────────────────────────────────
//
// Estos casos existen porque de ellos depende que el checklist NO muestre un
// botón que la regla va a rechazar. El A.2a dejó un botón muerto a propósito
// (el gate inerte) y este sub-bloque viene a quitarlo: meter otro por no mirar
// la diferencia entre "ve el módulo" y "edita la plantilla" sería irónico.

describe('quién edita la plantilla del pliego típico', () => {
  it('CLAVE: es un SUBCONJUNTO ESTRICTO de quien ve el módulo', () => {
    for (const r of ROLES_EDITA_PLANTILLA_LICITACIONES) {
      expect(ROLES_VE_LICITACIONES, `${r} edita la plantilla pero no ve el módulo`)
        .toContain(r)
    }
    expect(ROLES_EDITA_PLANTILLA_LICITACIONES.length)
      .toBeLessThan(ROLES_VE_LICITACIONES.length)
  })

  it('CLAVE: operacion_comercial VE el módulo y NO edita la plantilla', () => {
    // Karen es la usuaria del módulo y la que trabaja contra la lista. Que no
    // la defina es la segregación del A.2a funcionando, no un olvido — y es la
    // razón por la que el estado "sin plantilla" se bifurca por rol.
    expect(veLicitacionesUI('operacion_comercial')).toBe(true)
    expect(editaPlantillaLicitacionesUI('operacion_comercial')).toBe(false)
  })

  it('gerencia_administrativa tampoco: gestiona licitaciones, no define la lista', () => {
    expect(veLicitacionesUI('gerencia_administrativa')).toBe(true)
    expect(editaPlantillaLicitacionesUI('gerencia_administrativa')).toBe(false)
  })

  it('los tres que sí: gerencia_general, director_proyectos y admin', () => {
    for (const r of ['gerencia_general', 'director_proyectos', 'admin'] as Rol[]) {
      expect(editaPlantillaLicitacionesUI(r), r).toBe(true)
    }
  })

  it('nadie de fuera del panel la edita', () => {
    for (const r of ['tecnico', 'contratista', 'cliente_final', 'residente_obra'] as string[]) {
      expect(editaPlantillaLicitacionesUI(r), r).toBe(false)
    }
    expect(editaPlantillaLicitacionesUI(undefined)).toBe(false)
  })
})
