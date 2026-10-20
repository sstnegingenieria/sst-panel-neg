// @vitest-environment node
//
// Tests funcionales de `useConsecutivo` contra la Firebase Emulator Suite.
// Ejercitan el hook REAL (que usa el `functions`/`auth` de firebase/config.ts,
// conectados a los emuladores en modo test).
//
// NO forman parte del `npm test` por defecto (excluidos en vitest.config.ts).
// Se corren con: `npm run test:emulator` (que los envuelve en `firebase emulators:exec`).
//
// Desde el MAPA PREFIJO→ROLES (19-oct) la CF verifica rol + estado contra el
// DOC de users ANTES de quemar número — cada test siembra el doc del actor
// con `seedUserDoc` y la BATERÍA DE ROLES usa actores de MÍNIMO PRIVILEGIO
// por vía (lección 14-ago: un actor con dos vías no prueba ninguna).
//
// La verificación del contador almacenado se hace con `leerUltimoConsecutivo`
// (REST del emulador con acceso owner), porque `consecutivos` es una colección
// solo-función: las reglas de Firestore deniegan la lectura desde el SDK cliente.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { useConsecutivo } from '../useConsecutivo'
import type { PrefijoConsecutivo } from '../useConsecutivo'
import {
  clearFirestore,
  signInTestUser,
  signOutTestUser,
  waitForEmulators,
  leerUltimoConsecutivo,
  seedUserDoc,
} from '../../../test/emulator-helpers'

const YEAR = new Date().getFullYear()
const TIMEOUT = 30_000

/** Inicia sesión con un usuario propio del rol y siembra su doc de users. */
async function actor(rol: string, estado: 'activo' | 'inactivo' = 'activo') {
  const user = await signInTestUser(`${rol.replace(/_/g, '')}.${estado}@demo-neg.test`, 'password123')
  await seedUserDoc(user.uid, rol, estado)
  return user
}

describe('useConsecutivo (contra emulador)', () => {
  beforeAll(async () => {
    await waitForEmulators()
  }, TIMEOUT)

  // Estado limpio y sesión de admin (rol con todas las vías) antes de cada
  // test de FORMATO; los de la batería de roles abren su propio actor.
  beforeEach(async () => {
    await clearFirestore()
    await actor('admin')
  }, TIMEOUT)

  it(
    'genera un consecutivo válido con formato SOL-YYYY-001',
    async () => {
      const { obtener } = useConsecutivo()
      const consecutivo = await obtener('SOL')

      expect(consecutivo).toBe(`SOL-${YEAR}-001`)
      expect(await leerUltimoConsecutivo('SOL', YEAR)).toBe(1)
    },
    TIMEOUT,
  )

  it(
    'mantiene secuencialidad en llamadas sucesivas (001, 002, 003)',
    async () => {
      const { obtener } = useConsecutivo()
      const a = await obtener('SOL')
      const b = await obtener('SOL')
      const c = await obtener('SOL')

      expect([a, b, c]).toEqual([
        `SOL-${YEAR}-001`,
        `SOL-${YEAR}-002`,
        `SOL-${YEAR}-003`,
      ])
      expect(await leerUltimoConsecutivo('SOL', YEAR)).toBe(3)
    },
    TIMEOUT,
  )

  it(
    'genera 10 consecutivos únicos bajo concurrencia (Promise.all)',
    async () => {
      const { obtener } = useConsecutivo()

      const resultados = await Promise.all(
        Array.from({ length: 10 }, () => obtener('SOL')),
      )

      // Unicidad: 10 valores distintos.
      expect(new Set(resultados).size).toBe(10)

      // Formato válido en todos.
      const formato = new RegExp(`^SOL-${YEAR}-\\d{3,}$`)
      for (const r of resultados) expect(r).toMatch(formato)

      // El conjunto de números es exactamente {1..10} (el orden puede variar).
      const numeros = resultados
        .map((r) => Number(r.split('-')[2]))
        .sort((x, y) => x - y)
      expect(numeros).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

      // El contador quedó en 10.
      expect(await leerUltimoConsecutivo('SOL', YEAR)).toBe(10)
    },
    TIMEOUT,
  )

  it(
    'mantiene contadores independientes por prefijo (SOL vs COT)',
    async () => {
      const { obtener } = useConsecutivo()
      const sol1 = await obtener('SOL')
      const cot1 = await obtener('COT')
      const sol2 = await obtener('SOL')

      expect(sol1).toBe(`SOL-${YEAR}-001`)
      expect(sol2).toBe(`SOL-${YEAR}-002`)
      expect(cot1).toBe(`COT-${YEAR}-001`)
      expect(await leerUltimoConsecutivo('SOL', YEAR)).toBe(2)
      expect(await leerUltimoConsecutivo('COT', YEAR)).toBe(1)
    },
    TIMEOUT,
  )

  it(
    'LIC usa padding 4 y serie ANUAL: LIC-YYYY-0001 (y no mueve el padding de los de 3)',
    async () => {
      const { obtener } = useConsecutivo()
      const a = await obtener('LIC')
      const b = await obtener('LIC')
      const cot = await obtener('COT')

      expect(a).toBe(`LIC-${YEAR}-0001`)
      expect(b).toBe(`LIC-${YEAR}-0002`)
      expect(cot).toBe(`COT-${YEAR}-001`)
      expect(await leerUltimoConsecutivo('LIC', YEAR)).toBe(2)
    },
    TIMEOUT,
  )

  it(
    'AC / AP / MEJ: serie ANUAL propia, padding 3, contadores independientes',
    async () => {
      const { obtener } = useConsecutivo()
      const ac1 = await obtener('AC')
      const ap1 = await obtener('AP')
      const mej1 = await obtener('MEJ')
      const ac2 = await obtener('AC')

      expect(ac1).toBe(`AC-${YEAR}-001`)
      expect(ac2).toBe(`AC-${YEAR}-002`)
      expect(ap1).toBe(`AP-${YEAR}-001`)
      expect(mej1).toBe(`MEJ-${YEAR}-001`)
      expect(await leerUltimoConsecutivo('AC', YEAR)).toBe(2)
      expect(await leerUltimoConsecutivo('AP', YEAR)).toBe(1)
      expect(await leerUltimoConsecutivo('MEJ', YEAR)).toBe(1)
    },
    TIMEOUT,
  )

  it(
    'rechaza un prefijo inválido con code invalid-argument',
    async () => {
      const { obtener } = useConsecutivo()
      await expect(
        obtener('XXX' as PrefijoConsecutivo),
      ).rejects.toMatchObject({
        code: expect.stringContaining('invalid-argument'),
      })
    },
    TIMEOUT,
  )

  it(
    'los RESERVADOS (OFR/ACT/LIQ/FAC/NC/PRY) quedaron FUERA — invalid-argument incluso para admin',
    async () => {
      const { obtener } = useConsecutivo()
      for (const p of ['OFR', 'ACT', 'LIQ', 'FAC', 'NC', 'PRY']) {
        await expect(
          obtener(p as PrefijoConsecutivo),
        ).rejects.toMatchObject({ code: expect.stringContaining('invalid-argument') })
      }
      // Ningún contador fabricado por los intentos.
      for (const p of ['OFR', 'ACT', 'PRY']) {
        expect(await leerUltimoConsecutivo(p, YEAR)).toBeUndefined()
      }
    },
    TIMEOUT,
  )

  it(
    'rechaza cuando falta el prefijo con code invalid-argument',
    async () => {
      const { obtener } = useConsecutivo()
      await expect(
        obtener(undefined as unknown as PrefijoConsecutivo),
      ).rejects.toMatchObject({
        code: expect.stringContaining('invalid-argument'),
      })
    },
    TIMEOUT,
  )

  it(
    'rechaza llamadas sin autenticación con code unauthenticated',
    async () => {
      await signOutTestUser()
      const { obtener } = useConsecutivo()
      await expect(obtener('SOL')).rejects.toMatchObject({
        code: expect.stringContaining('unauthenticated'),
      })
    },
    TIMEOUT,
  )

  // ── BATERÍA DEL MAPA PREFIJO→ROLES — mínimo privilegio por vía ──

  it(
    'comercial (solo vía clientes) quema SOL/VIS/COT/CAT y LIC, pero NO OC ni PEA ni AC',
    async () => {
      await actor('operacion_comercial')
      const { obtener } = useConsecutivo()
      expect(await obtener('SOL')).toBe(`SOL-${YEAR}-001`)
      expect(await obtener('COT')).toBe(`COT-${YEAR}-001`)
      expect(await obtener('LIC')).toBe(`LIC-${YEAR}-0001`)
      for (const p of ['OC', 'PEA', 'AC'] as PrefijoConsecutivo[]) {
        await expect(obtener(p)).rejects.toMatchObject({
          code: expect.stringContaining('permission-denied'),
        })
      }
      expect(await leerUltimoConsecutivo('OC', YEAR)).toBeUndefined()
    },
    TIMEOUT,
  )

  it(
    'residente_obra (solo vía PEA) quema PEA y NADA más',
    async () => {
      await actor('residente_obra')
      const { obtener } = useConsecutivo()
      expect(await obtener('PEA')).toBe(`PEA-${YEAR}-001`)
      for (const p of ['SOL', 'COT', 'OC', 'LIC', 'AC'] as PrefijoConsecutivo[]) {
        await expect(obtener(p)).rejects.toMatchObject({
          code: expect.stringContaining('permission-denied'),
        })
      }
    },
    TIMEOUT,
  )

  it(
    'gestion_integral (vía AC/AP/MEJ) quema los tres y NO los comerciales ni OC',
    async () => {
      await actor('gestion_integral')
      const { obtener } = useConsecutivo()
      expect(await obtener('AC')).toBe(`AC-${YEAR}-001`)
      expect(await obtener('AP')).toBe(`AP-${YEAR}-001`)
      expect(await obtener('MEJ')).toBe(`MEJ-${YEAR}-001`)
      for (const p of ['SOL', 'COT', 'OC', 'PEA', 'LIC'] as PrefijoConsecutivo[]) {
        await expect(obtener(p)).rejects.toMatchObject({
          code: expect.stringContaining('permission-denied'),
        })
      }
    },
    TIMEOUT,
  )

  it(
    'gerencia_administrativa SOLO quema LIC (su única vía del mapa)',
    async () => {
      await actor('gerencia_administrativa')
      const { obtener } = useConsecutivo()
      expect(await obtener('LIC')).toBe(`LIC-${YEAR}-0001`)
      for (const p of ['SOL', 'OC', 'PEA', 'AC'] as PrefijoConsecutivo[]) {
        await expect(obtener(p)).rejects.toMatchObject({
          code: expect.stringContaining('permission-denied'),
        })
      }
    },
    TIMEOUT,
  )

  it(
    'sst (sin vía alguna) y tecnico (app móvil) NO queman nada — el hallazgo original cerrado',
    async () => {
      for (const rol of ['sst', 'tecnico']) {
        await actor(rol)
        const { obtener } = useConsecutivo()
        for (const p of ['SOL', 'COT', 'OC', 'PEA', 'LIC', 'AC'] as PrefijoConsecutivo[]) {
          await expect(obtener(p)).rejects.toMatchObject({
            code: expect.stringContaining('permission-denied'),
          })
        }
      }
      // Cero contadores fabricados por toda la pasada negativa.
      expect(await leerUltimoConsecutivo('SOL', YEAR)).toBeUndefined()
    },
    TIMEOUT,
  )

  it(
    'usuario INACTIVO no quema aunque su rol esté en el mapa',
    async () => {
      await actor('admin', 'inactivo')
      const { obtener } = useConsecutivo()
      await expect(obtener('SOL')).rejects.toMatchObject({
        code: expect.stringContaining('permission-denied'),
      })
    },
    TIMEOUT,
  )

  it(
    'usuario autenticado SIN doc de users no quema (sin doc legible no hay número)',
    async () => {
      await signInTestUser('sindoc@demo-neg.test', 'password123')
      const { obtener } = useConsecutivo()
      await expect(obtener('SOL')).rejects.toMatchObject({
        code: expect.stringContaining('permission-denied'),
      })
    },
    TIMEOUT,
  )
})
