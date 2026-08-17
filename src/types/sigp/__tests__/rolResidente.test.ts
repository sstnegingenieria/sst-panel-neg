// C2.1 paso 6 — REGRESIÓN PERMANENTE del rol residente_cliente.
//
// El rol externo nace pudiendo NADA: no pertenece a ningún array de roles
// internos (UI) ni a ningún helper de listas blancas (reglas). Si mañana
// alguien lo agrega a esPersonalPanel() o a ROLES_PANEL_WEB por descuido,
// ESTE archivo falla — cada permiso del residente debe ser una concesión
// explícita en sus propios helpers (accesoClientes / esResidenteDe), nunca
// un efecto colateral.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as roles from '../roles'
import * as permisos from '../permisos'

const RESIDENTE = 'residente_cliente'
// Los ÚNICOS lugares donde el rol puede aparecer (sus propios helpers).
const ARRAYS_PROPIOS = new Set(['ROLES_CON_ACCESO_CLIENTES'])

describe('rol residente_cliente — nace en cero (UI)', () => {
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

  it('su propio helper es exacto: accesoClientes = { residente_cliente } y nada más', () => {
    expect(roles.ROLES_CON_ACCESO_CLIENTES).toEqual([RESIDENTE])
    expect(roles.accesoClientes(RESIDENTE)).toBe(true)
    for (const rol of roles.ROLES_PANEL_WEB) {
      expect(roles.accesoClientes(rol)).toBe(false)
    }
    expect(roles.accesoClientes('tecnico')).toBe(false)
  })

  it('las áreas internas lo rechazan: accesoSST y accesoSIGP false', () => {
    expect(roles.accesoSST(RESIDENTE)).toBe(false)
    expect(roles.accesoSIGP(RESIDENTE)).toBe(false)
    expect(roles.ROLES_PANEL_WEB).not.toContain(RESIDENTE)
  })
})

describe('rol residente_cliente — nace en cero (reglas, chequeo textual)', () => {
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
