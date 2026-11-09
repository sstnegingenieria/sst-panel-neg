// @vitest-environment node
//
// Batería de la regla A4 (08-nov) de `verificaciones_sst`:
//   un doc LEGACY `{proyectoId}` con el marcador `migrada_a` está CONGELADO —
//   niega cualquier update (sst_gate / historial / fecha_actualizacion); los docs
//   NUEVOS `{proyectoId}__{contratista_id}` siguen aceptando el gate.
//
// Contexto: el 31-oct la migración copió el gate a los docs por contratista y
// marcó los viejos con `migrada_a`, pero la regla no lo leía: la pantalla de SST
// escribía el gate en el doc VIEJO, la escritura pasaba y no autorizaba nada (la
// regla de liquidación lee `{pid}__{cid}`).
//
// PRINCIPIO DE LA BATERÍA: cada denegación se prueba con el actor de MÍNIMO
// PRIVILEGIO que casi puede (sst / residente_sst / gestion_integral escriben el
// gate en un doc NUEVO — control positivo), no con un anónimo.
//
// NO forma parte del `npm test` por defecto. Se corre con:
//   npx firebase emulators:exec --project demo-neg --only firestore \
//     "npx vitest run --config vitest.emulator.config.ts src/hooks/sigp/__tests__/verificacionesMigradasFirestoreRules.test.ts"
// (el puerto sale de FIRESTORE_EMULATOR_HOST — lo fija emulators:exec — y cae a 8080).

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'

const TIMEOUT = 30_000

const ROLES = {
  ingrid: 'gestion_integral',
  sofia: 'sst',
  ramiro: 'residente_sst',
  root: 'admin',
  marcela: 'gerencia_administrativa',
} as const
type Actor = keyof typeof ROLES

const PID = 'pry_001'
const CID = 'c1'
const LEGACY = `verificaciones_sst/${PID}`
const NUEVO = `verificaciones_sst/${PID}__${CID}`
const PRE = 'verificaciones_sst/pry_777' // legacy SIN migrar (sin marcador)

let env: RulesTestEnvironment
const db = (a: Actor) => env.authenticatedContext(a, { email: `${a}@test.dev` }).firestore()

const proyeccion = (extra: Record<string, unknown> = {}) => ({
  proyecto_id: PID, consecutivo: 'PRY-2026-009', nombre_sitio: 'BECERRILL IV', codigo_sitio_cliente: 'X1',
  cliente_nombre: 'Cliente', contratista_id: CID, contratista_nombre: 'David Bernal',
  estado: 'facturado', obra_id: `pry_${PID}`,
  ...extra,
})

/** Update de aval por APP (flujo de siempre desde la pantalla de SST). */
const avalApp = (uid: string, estado = 'al_dia') => ({
  sst_gate: { estado, verificado_por: uid, fecha: Timestamp.now() },
  fecha_actualizacion: Timestamp.now(),
  historial: arrayUnion({ de: 'pendiente', a: estado, por: uid, fecha: Timestamp.now(), motivo: 'app' }),
})

const upd = (a: Actor, path: string, payload: Record<string, unknown>) =>
  updateDoc(doc(db(a), path), payload)

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
  env = await initializeTestEnvironment({
    projectId: 'demo-neg',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../../../firestore.rules'), 'utf8'),
      host,
      port: Number(port),
    },
  })
}, TIMEOUT)

afterAll(async () => { await env.cleanup() })

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore()
    for (const [uid, rol] of Object.entries(ROLES)) {
      await setDoc(doc(d, 'users', uid), { nombre: uid, rol, estado: 'activo' })
    }
    // Estado real de prod tras la migración del 31-oct:
    await setDoc(doc(d, LEGACY), proyeccion({ migrada_a: [`${PID}__${CID}`] }))
    await setDoc(doc(d, NUEVO), proyeccion({ migrada_desde: PID, activa: true }))
    // Un legacy que NUNCA fue migrado (sin marcador): la regla no debe romperlo.
    await setDoc(doc(d, PRE), proyeccion({ proyecto_id: 'pry_777', consecutivo: 'PRY-2026-099' }))
  })
}, TIMEOUT)

describe('A4 — doc NUEVO `{pid}__{cid}`: el gate se sigue escribiendo', () => {
  it('1. CONTROL POSITIVO: sst marca al_dia en el doc nuevo → permitido', async () => {
    await assertSucceeds(upd('sofia', NUEVO, avalApp('sofia')))
  }, TIMEOUT)

  it('2. residente_sst marca al_dia en el doc nuevo → permitido', async () => {
    await assertSucceeds(upd('ramiro', NUEVO, avalApp('ramiro')))
  }, TIMEOUT)

  it('3. gestion_integral marca con_novedad (con observación) en el doc nuevo → permitido', async () => {
    const p = avalApp('ingrid', 'con_novedad')
    ;(p.sst_gate as Record<string, unknown>).observacion = 'Faltan formatos de alturas'
    await assertSucceeds(upd('ingrid', NUEVO, p))
  }, TIMEOUT)
})

describe('A4 — doc LEGACY con `migrada_a`: congelado', () => {
  it('4. sst escribe el gate en el doc viejo → DENEGADO (el caso del 08-nov)', async () => {
    await assertFails(upd('sofia', LEGACY, avalApp('sofia')))
  }, TIMEOUT)

  it('5. residente_sst escribe el gate en el doc viejo → DENEGADO', async () => {
    await assertFails(upd('ramiro', LEGACY, avalApp('ramiro')))
  }, TIMEOUT)

  it('6. gestion_integral (Ingrid) escribe el gate en el doc viejo → DENEGADO', async () => {
    await assertFails(upd('ingrid', LEGACY, avalApp('ingrid')))
  }, TIMEOUT)

  it('7. gestion_integral con con_novedad en el doc viejo → DENEGADO', async () => {
    const p = avalApp('ingrid', 'con_novedad')
    ;(p.sst_gate as Record<string, unknown>).observacion = 'novedad'
    await assertFails(upd('ingrid', LEGACY, p))
  }, TIMEOUT)

  it('8. solo agregar al historial del doc viejo → DENEGADO', async () => {
    await assertFails(upd('sofia', LEGACY, {
      historial: arrayUnion({ de: 'pendiente', a: 'al_dia', por: 'sofia', fecha: Timestamp.now(), motivo: 'x' }),
    }))
  }, TIMEOUT)

  it('9. solo fecha_actualizacion del doc viejo → DENEGADO (ningún update pasa)', async () => {
    await assertFails(upd('sofia', LEGACY, { fecha_actualizacion: Timestamp.now() }))
  }, TIMEOUT)

  it('10. tras los intentos denegados el doc viejo queda INTACTO', async () => {
    await assertFails(upd('sofia', LEGACY, avalApp('sofia')))
    await env.withSecurityRulesDisabled(async (ctx) => {
      const d = (await getDoc(doc(ctx.firestore(), LEGACY))).data()!
      expect(d.sst_gate).toBeUndefined()
      expect(d.historial).toBeUndefined()
      expect(d.migrada_a).toEqual([`${PID}__${CID}`])
    })
  }, TIMEOUT)

  it('11. quitar el marcador `migrada_a` desde el cliente → DENEGADO (no se descongela)', async () => {
    await assertFails(upd('sofia', LEGACY, { migrada_a: null, sst_gate: avalApp('sofia').sst_gate }))
  }, TIMEOUT)
})

describe('A4 — no rompe lo que no debe', () => {
  it('12. un legacy SIN `migrada_a` (nunca migrado) sigue aceptando el gate', async () => {
    await assertSucceeds(upd('sofia', PRE, avalApp('sofia')))
  }, TIMEOUT)

  it('13. el doc viejo sigue siendo LEGIBLE para SST (la lectura no cambia)', async () => {
    await assertSucceeds(getDoc(doc(db('sofia'), LEGACY)))
    await assertSucceeds(getDoc(doc(db('marcela'), LEGACY)))
  }, TIMEOUT)

  it('14. admin sigue en solo lectura (no escribe ni el doc nuevo)', async () => {
    await assertFails(upd('root', NUEVO, avalApp('root')))
  }, TIMEOUT)

  it('15. nadie crea ni borra docs desde el cliente (sin cambio)', async () => {
    await assertFails(setDoc(doc(db('sofia'), 'verificaciones_sst/otro__c2'), proyeccion()))
  }, TIMEOUT)
})
