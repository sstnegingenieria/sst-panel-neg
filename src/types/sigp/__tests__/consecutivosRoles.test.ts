// TEST ESPEJO del mapa prefijo→roles de `generarConsecutivo` (19-oct-2026).
//
// El criterio del mapa es que la CF HACE CUMPLIR la política que la UI ya
// expresaba — no inventa una nueva. Este test compara ROLES_POR_PREFIJO del
// archivo REAL de functions contra los arrays de permisos.ts que gatean cada
// pantalla que quema números: si alguien mueve un rol en un lado y no en el
// otro, la suite CAE (el mismo seguro del test que parsea firestore.rules
// en Licitaciones). AC/AP/MEJ no tienen array en nuestro permisos.ts (el
// módulo de acciones de mejora es del frente SGI/SST) — su definición es el
// MANDATO del 19-oct: gestion_integral + admin, fijado aquí como literal.
import { describe, it, expect, vi } from 'vitest'

vi.mock('firebase-functions/v2/https', () => ({
  onCall: (_opts: unknown, handler: unknown) => handler,
  HttpsError: class HttpsError extends Error {},
}))
vi.mock('firebase-admin', () => ({ default: {}, firestore: () => ({}) }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => null } }))
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cf = require('../../../../functions/consecutivos.js') as {
  PREFIJOS_VALIDOS: string[]
  ROLES_POR_PREFIJO: Record<string, string[]>
}

import {
  ROLES_GESTIONA_CLIENTES,
  ROLES_CREA_OC,
  ROLES_GESTIONA_ACTIVIDADES,
  ROLES_VE_LICITACIONES,
} from '../permisos'

const igualesSinOrden = (a: string[], b: string[]) =>
  expect([...a].sort()).toEqual([...b].sort())

describe('espejo CF ⟷ permisos.ts — mapa prefijo→roles', () => {
  it('SOL/VIS/COT/CAT espejan ROLES_GESTIONA_CLIENTES (quien registra/cotiza, quema)', () => {
    for (const p of ['SOL', 'VIS', 'COT', 'CAT']) {
      igualesSinOrden(cf.ROLES_POR_PREFIJO[p], ROLES_GESTIONA_CLIENTES as unknown as string[])
    }
  })

  it('OC espeja ROLES_CREA_OC (quien emite la orden, quema)', () => {
    igualesSinOrden(cf.ROLES_POR_PREFIJO.OC, ROLES_CREA_OC as unknown as string[])
  })

  it('PEA espeja ROLES_GESTIONA_ACTIVIDADES — los residentes emiten sus propuestas', () => {
    igualesSinOrden(cf.ROLES_POR_PREFIJO.PEA, ROLES_GESTIONA_ACTIVIDADES as unknown as string[])
    expect(cf.ROLES_POR_PREFIJO.PEA).toContain('residente_obra')
  })

  it('LIC espeja ROLES_VE_LICITACIONES (quien ve el módulo lo opera)', () => {
    igualesSinOrden(cf.ROLES_POR_PREFIJO.LIC, ROLES_VE_LICITACIONES as unknown as string[])
  })

  it('AC/AP/MEJ = gestion_integral + admin (mandato 19-oct, módulo del frente SGI/SST)', () => {
    for (const p of ['AC', 'AP', 'MEJ']) {
      igualesSinOrden(cf.ROLES_POR_PREFIJO[p], ['gestion_integral', 'admin'])
    }
  })

  it('DENY-BY-DEFAULT: la whitelist son EXACTAMENTE las claves del mapa, sin reservados', () => {
    expect(cf.PREFIJOS_VALIDOS).toEqual(Object.keys(cf.ROLES_POR_PREFIJO))
    for (const p of ['OFR', 'ACT', 'LIQ', 'FAC', 'NC', 'PRY']) {
      expect(cf.ROLES_POR_PREFIJO[p]).toBeUndefined()
    }
  })

  it('nadie quema PRY por el callable (lo quema la CF crearProyectoAlAprobar en su transacción)', () => {
    expect(cf.PREFIJOS_VALIDOS).not.toContain('PRY')
  })
})
