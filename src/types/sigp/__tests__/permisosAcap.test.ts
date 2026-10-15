// Permisos de UI del módulo Acciones de Mejora / NC (AC/AP, Fase 1).
// Lo que importa: el array de UI y el helper `gestionaAcAp()` de firestore.rules
// digan LO MISMO (si se separan, la UI muestra un botón que la regla rechaza o
// esconde algo que la regla sí permite).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ROLES_GESTIONA_ACAP, puedeGestionarAcapUI, veAccionesMejoraUI } from '../permisos'
import { ROLES_PANEL_WEB } from '../roles'

const REGLAS = readFileSync(resolve(__dirname, '../../../../firestore.rules'), 'utf8')

/** Extrae la lista de roles de un helper `function nombre() { ... in [ ... ] }`. */
function rolesDelHelper(nombre: string): string[] {
  const re = new RegExp(`function\\s+${nombre}\\s*\\(\\)\\s*\\{[\\s\\S]*?in\\s*\\[([\\s\\S]*?)\\]`, 'm')
  const m = re.exec(REGLAS)
  if (!m) throw new Error(`No se encontró el helper ${nombre} en firestore.rules`)
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]).sort()
}

describe('espejo UI ⟷ firestore.rules', () => {
  it('ROLES_GESTIONA_ACAP == gestionaAcAp()', () => {
    expect([...ROLES_GESTIONA_ACAP].sort()).toEqual(rolesDelHelper('gestionaAcAp'))
  })
})

describe('quién gestiona las acciones de mejora', () => {
  it('SOLO gestion_integral y admin (el detalle de una NC es sensible)', () => {
    expect([...ROLES_GESTIONA_ACAP].sort()).toEqual(['admin', 'gestion_integral'])
    expect(puedeGestionarAcapUI('gestion_integral')).toBe(true)
    expect(puedeGestionarAcapUI('admin')).toBe(true)
  })

  it('ningún otro rol del panel ve ni gestiona el módulo (incl. sst y las gerencias)', () => {
    for (const r of ROLES_PANEL_WEB) {
      if (r === 'gestion_integral' || r === 'admin') continue
      expect(puedeGestionarAcapUI(r)).toBe(false)
      expect(veAccionesMejoraUI(r)).toBe(false)
    }
    expect(puedeGestionarAcapUI(undefined)).toBe(false)
  })
})
