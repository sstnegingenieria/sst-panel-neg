// C2.1 paso 6 — REGRESIÓN PERMANENTE del rol residente_obra.
//
// El rol externo nace pudiendo NADA: no pertenece a ningún array de roles
// internos (UI) ni a ningún helper de listas blancas (reglas). Si mañana
// alguien lo agrega a esPersonalPanel() o a ROLES_PANEL_WEB por descuido,
// ESTE archivo falla — cada permiso del residente debe ser una concesión
// explícita en sus propios helpers (accesoResidente / esResidenteDe), nunca
// un efecto colateral.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as roles from '../roles'
import * as permisos from '../permisos'

const RESIDENTE = 'residente_obra'
// Los ÚNICOS lugares donde el rol puede aparecer — la WHITELIST de
// concesiones explícitas. Cada entrada nueva es una decisión consciente y
// rastreable (el punto de auditoría de este archivo):
//  - ROLES_RESIDENTES: su gatekeeper (C2.1 paso 6).
//  - ROLES_VE_ACTIVIDADES / ROLES_GESTIONA_ACTIVIDADES: el módulo de
//    Actividades F1 — el residente OPERA su cliente (decisión 17-ago).
const ARRAYS_PROPIOS = new Set([
  'ROLES_RESIDENTES',
  'ROLES_VE_ACTIVIDADES',
  'ROLES_GESTIONA_ACTIVIDADES',
])

describe('rol residente_obra — nace en cero (UI)', () => {
  it('NO está en NINGÚN array de roles exportado por roles.ts ni permisos.ts (salvo el suyo)', () => {
    const modulos: Record<string, Record<string, unknown>> = { roles, permisos }
    const violaciones: string[] = []
    for (const [mod, exps] of Object.entries(modulos)) {
      for (const [nombre, valor] of Object.entries(exps)) {
        if (!Array.isArray(valor) || ARRAYS_PROPIOS.has(nombre)) continue
        if ((valor as unknown[]).includes(RESIDENTE)) violaciones.push(`${mod}.${nombre}`)
      }
    }
    expect(violaciones).toEqual([])
  })

  it('su propio helper es exacto: accesoResidente = { residente_obra } y nada más', () => {
    expect(roles.ROLES_RESIDENTES).toEqual([RESIDENTE])
    expect(roles.accesoResidente(RESIDENTE)).toBe(true)
    for (const rol of roles.ROLES_PANEL_WEB) {
      expect(roles.accesoResidente(rol)).toBe(false)
    }
    expect(roles.accesoResidente('tecnico')).toBe(false)
  })

  it('las áreas internas lo rechazan: accesoSST y accesoSIGP false', () => {
    expect(roles.accesoSST(RESIDENTE)).toBe(false)
    expect(roles.accesoSIGP(RESIDENTE)).toBe(false)
    expect(roles.ROLES_PANEL_WEB).not.toContain(RESIDENTE)
  })
})

describe('rol residente_obra — nace en cero (reglas, chequeo textual)', () => {
  const rulesPath = resolve(__dirname, '../../../../firestore.rules')
  const rules = readFileSync(rulesPath, 'utf8')

  it('en firestore.rules solo aparece en comentarios o dentro de esResidenteDe', () => {
    const lineas = rules.split('\n')
    const inicio = lineas.findIndex(l => l.includes('function esResidenteDe'))
    expect(inicio).toBeGreaterThan(-1)
    // el bloque de la función: desde su declaración hasta su cierre '}'
    let fin = inicio
    while (fin < lineas.length && !lineas[fin].trim().startsWith('}')) fin++
    const fuera = lineas
      .map((l, i) => ({ l, i }))
      .filter(({ l, i }) => l.includes(RESIDENTE)
        && !(i >= inicio && i <= fin)          // dentro de esResidenteDe: OK
        && !l.trim().startsWith('//'))          // comentario: OK
    expect(fuera.map(f => `línea ${f.i + 1}: ${f.l.trim()}`)).toEqual([])
  })

  it('las CITAS de esResidenteDe( en matches son la única vía de concesión en reglas', () => {
    // El literal del rol solo vive en su helper; los matches conceden
    // CITANDO esResidenteDe(...). Este caso fija que exista al menos una
    // cita (el módulo de Actividades) y que ninguna lista de roles de
    // reglas (rolActual() in [...]) contenga el rol.
    expect(rules.match(/esResidenteDe\(/g)!.length).toBeGreaterThan(1)
    // Ninguna LISTA de roles de reglas (rolActual() in [...], puede abarcar
    // varias líneas) contiene el rol — las listas son de personal interno.
    const listas = rules.match(/rolActual\(\)\s+in\s+\[[^\]]*\]/g) ?? []
    expect(listas.filter(l => l.includes(RESIDENTE))).toEqual([])
  })

  it('esPersonalPanel() NO contiene el rol (la lista blanca interna es suya)', () => {
    const desde = rules.indexOf('function esPersonalPanel')
    const cuerpo = rules.slice(desde, rules.indexOf('}', desde))
    expect(cuerpo).not.toContain(RESIDENTE)
  })

  it('storage.rules no cita el rol (allí gobierna esInterno por claim)', () => {
    const storage = readFileSync(resolve(__dirname, '../../../../storage.rules'), 'utf8')
    expect(storage).not.toContain(RESIDENTE)
  })
})
