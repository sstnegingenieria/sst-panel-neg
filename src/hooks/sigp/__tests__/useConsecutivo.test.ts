// @vitest-environment node
//
// Tests funcionales de `useConsecutivo` contra la Firebase Emulator Suite.
// Ejercitan el hook REAL (que usa el `functions`/`auth` de firebase/config.ts,
// conectados a los emuladores en modo test).
//
// NO forman parte del `npm test` por defecto (excluidos en vitest.config.ts).
// Se corren con: `npm run test:emulator` (que los envuelve en `firebase emulators:exec`).
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
} from '../../../test/emulator-helpers'

const YEAR = new Date().getFullYear()
const TIMEOUT = 30_000

describe('useConsecutivo (contra emulador)', () => {
  beforeAll(async () => {
    await waitForEmulators()
  }, TIMEOUT)

  // Estado limpio y sesión iniciada antes de cada test. El test "sin auth"
  // cierra sesión localmente; el siguiente beforeEach la vuelve a abrir.
  beforeEach(async () => {
    await clearFirestore()
    await signInTestUser()
  }, TIMEOUT)

  it(
    'genera un consecutivo válido con formato OFR-YYYY-001',
    async () => {
      const { obtener } = useConsecutivo()
      const consecutivo = await obtener('OFR')

      expect(consecutivo).toBe(`OFR-${YEAR}-001`)
      expect(await leerUltimoConsecutivo('OFR', YEAR)).toBe(1)
    },
    TIMEOUT,
  )

  it(
    'mantiene secuencialidad en llamadas sucesivas (001, 002, 003)',
    async () => {
      const { obtener } = useConsecutivo()
      const a = await obtener('OFR')
      const b = await obtener('OFR')
      const c = await obtener('OFR')

      expect([a, b, c]).toEqual([
        `OFR-${YEAR}-001`,
        `OFR-${YEAR}-002`,
        `OFR-${YEAR}-003`,
      ])
      expect(await leerUltimoConsecutivo('OFR', YEAR)).toBe(3)
    },
    TIMEOUT,
  )

  it(
    'genera 10 consecutivos únicos bajo concurrencia (Promise.all)',
    async () => {
      const { obtener } = useConsecutivo()

      const resultados = await Promise.all(
        Array.from({ length: 10 }, () => obtener('OFR')),
      )

      // Unicidad: 10 valores distintos.
      expect(new Set(resultados).size).toBe(10)

      // Formato válido en todos.
      const formato = new RegExp(`^OFR-${YEAR}-\\d{3,}$`)
      for (const r of resultados) expect(r).toMatch(formato)

      // El conjunto de números es exactamente {1..10} (el orden puede variar).
      const numeros = resultados
        .map((r) => Number(r.split('-')[2]))
        .sort((x, y) => x - y)
      expect(numeros).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

      // El contador quedó en 10.
      expect(await leerUltimoConsecutivo('OFR', YEAR)).toBe(10)
    },
    TIMEOUT,
  )

  it(
    'mantiene contadores independientes por prefijo (OFR vs PRY)',
    async () => {
      const { obtener } = useConsecutivo()
      const ofr1 = await obtener('OFR')
      const pry1 = await obtener('PRY')
      const ofr2 = await obtener('OFR')

      expect(ofr1).toBe(`OFR-${YEAR}-001`)
      expect(ofr2).toBe(`OFR-${YEAR}-002`)
      expect(pry1).toBe(`PRY-${YEAR}-001`)
      expect(await leerUltimoConsecutivo('OFR', YEAR)).toBe(2)
      expect(await leerUltimoConsecutivo('PRY', YEAR)).toBe(1)
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
      await expect(obtener('OFR')).rejects.toMatchObject({
        code: expect.stringContaining('unauthenticated'),
      })
    },
    TIMEOUT,
  )
})
