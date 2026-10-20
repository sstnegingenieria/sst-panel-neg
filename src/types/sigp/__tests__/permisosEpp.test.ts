// Permisos de UI del módulo Actas de entrega de EPP (SST-FT-AEP-18). Lo que importa: el
// array de UI y el helper `gestionaEpp()` de firestore.rules digan LO MISMO (si se separan, la
// UI muestra un botón que la regla rechaza o esconde algo que la regla sí permite).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ROLES_GESTIONA_EPP, puedeGestionarEppUI, veEppUI } from '../permisos'
import { ROLES_PANEL_WEB } from '../roles'

const REGLAS = readFileSync(resolve(__dirname, '../../../../firestore.rules'), 'utf8')

function rolesDelHelper(nombre: string): string[] {
  const re = new RegExp(`function\\s+${nombre}\\s*\\(\\)\\s*\\{[\\s\\S]*?in\\s*\\[([\\s\\S]*?)\\]`, 'm')
  const m = re.exec(REGLAS)
  if (!m) throw new Error(`No se encontró el helper ${nombre} en firestore.rules`)
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]).sort()
}

describe('espejo UI ⟷ firestore.rules', () => {
  it('ROLES_GESTIONA_EPP == gestionaEpp()', () => {
    expect([...ROLES_GESTIONA_EPP].sort()).toEqual(rolesDelHelper('gestionaEpp'))
  })
  it('las dos colecciones citan SOLO gestionaEpp() para escribir (ninguna lista de roles suelta)', () => {
    const bloque = REGLAS.slice(REGLAS.indexOf('match /catalogo_epp/'), REGLAS.indexOf('CATCH-ALL'))
    // Toda regla de escritura/lectura de actas pasa por gestionaEpp().
    for (const verbo of ['allow create', 'allow update']) {
      const idx = [...bloque.matchAll(new RegExp(verbo, 'g'))].map(m => m.index!)
      expect(idx.length).toBeGreaterThanOrEqual(2)           // catálogo + actas
      for (const i of idx) expect(bloque.slice(i, i + 80)).toContain('gestionaEpp()')
    }
    expect(bloque).toMatch(/match \/actas_epp\/\{actaId\}[\s\S]*?allow read: if gestionaEpp\(\)/)
    expect(bloque.match(/allow delete: if false/g)).toHaveLength(2)
  })
})

describe('quién gestiona las actas de EPP', () => {
  it('SOLO gestion_integral y admin (el acta lleva la cédula del colaborador)', () => {
    expect([...ROLES_GESTIONA_EPP].sort()).toEqual(['admin', 'gestion_integral'])
    expect(puedeGestionarEppUI('gestion_integral')).toBe(true)
    expect(puedeGestionarEppUI('admin')).toBe(true)
  })
  it('ningún otro rol del panel ve ni gestiona el módulo', () => {
    for (const r of ROLES_PANEL_WEB) {
      if (r === 'gestion_integral' || r === 'admin') continue
      expect(puedeGestionarEppUI(r)).toBe(false)
      expect(veEppUI(r)).toBe(false)
    }
    expect(puedeGestionarEppUI(undefined)).toBe(false)
  })
})
