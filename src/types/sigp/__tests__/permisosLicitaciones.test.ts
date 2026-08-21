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
  veLicitacionesUI, gestionaLicitacionesUI, veEconomiaLicitacionUI,
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
