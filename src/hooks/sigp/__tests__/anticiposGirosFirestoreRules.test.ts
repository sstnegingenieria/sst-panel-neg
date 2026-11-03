// @vitest-environment node
//
// Batería de los DOS guards de anticipos múltiples (28-oct) sobre
// `proyectos/{id}/asignaciones/{aid}`:
//
//  1. GESTORES: la lista `giros` no la tocan en NINGUNA dirección — igualdad
//     exacta (presencia + contenido + tamaño). Sus rebuilds legítimos del mapa
//     la conservan por spread.
//  2. C2 — GERENCIA acotada: girar/corregir/anular giros (y el `anticipo`
//     legacy) es SOLO de gerencia_administrativa + admin. "Quien avala no
//     paga": gestion_integral (escribe el gate SST) y gerencia_general quedan
//     fuera; sus vías de APROBAR preliquidación (que no tocan giros) siguen
//     intactas.
//
// PRINCIPIO (lección SB2.2): actor de MÍNIMO PRIVILEGIO por vía —
//   diego (director_proyectos) solo gestores · marcela (GA) e ingrid (GI) y
//   giovanny (GG) solo gerencia · root ambas.
//
// ⚠ Los giros se comparan por IGUALDAD EXACTA: los fixtures usan Timestamps
// FIJOS — un ts() por llamada produciría giros "distintos" y falsos 403.
//
// NO forma parte del `npm test` por defecto. Se corre con:
//   npx firebase emulators:exec --project demo-neg --only firestore \
//     "npx vitest run --config vitest.emulator.config.ts src/hooks/sigp/__tests__/anticiposGirosFirestoreRules.test.ts"

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'

const TIMEOUT = 30_000

const ROLES = {
  marcela: 'gerencia_administrativa',   // gira/corrige/anula — la titular
  giovanny: 'gerencia_general',         // rama gerencia SIN giros (C2)
  root: 'admin',                        // respaldo declarado
  ingrid: 'gestion_integral',           // rama gerencia SIN giros (quien avala no paga)
  diego: 'director_proyectos',          // SOLO rama gestores
} as const
type Actor = keyof typeof ROLES

const P1 = 'p1'
const ASIG = `proyectos/${P1}/asignaciones/a1`

let env: RulesTestEnvironment
const db = (a: Actor) => env.authenticatedContext(a).firestore()

// Timestamps FIJOS (ver nota del encabezado).
const T0 = Timestamp.fromMillis(1_790_000_000_000)
const T1 = Timestamp.fromMillis(1_790_000_100_000)
const GIRO1 = { valor: 350_000, fecha: T0, registrado_por: 'marcela' }
const GIRO2 = { valor: 150_000, fecha: T1, registrado_por: 'marcela', motivo: 'materiales subieron', evidencia_url: 'https://x/soporte.pdf' }

const preliqBase = {
  valor_alcance: 1_000_000, valor_contratista: 700_000, anticipo_pct: 50,
  definida_por: 'diego', fecha_definicion: T0,
  aprobada_por: 'marcela', fecha_aprobacion: T0,
}
const preliqGiros = (giros: Record<string, unknown>[] = [GIRO1]) => ({ ...preliqBase, giros })

const asigGirada = (extra?: Record<string, unknown>) => ({
  tipo: 'contratista', estado: 'anticipo_girado',
  contratista_id: 'c1', contratista_nombre: 'Héctor', atomos: ['g1'],
  preliquidacion: preliqGiros(), historial: [], fecha_actualizacion: T0,
  ...extra,
})

const hist = (uid: string, a = 'anticipo_girado') =>
  arrayUnion({ de: 'anticipo_girado', a, por: uid, fecha: T1, motivo: 'batería' })

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-neg',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../../../firestore.rules'), 'utf8'),
      host: (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')[0],
      port: Number((process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')[1]),
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
    await setDoc(doc(d, 'proyectos', P1), { estado: 'anticipo_girado', consecutivo: 'PRY-2026-001', historial: [] })
    await setDoc(doc(d, ASIG), asigGirada())
  })
}, TIMEOUT)

const sembrarAsig = (data: Record<string, unknown>) =>
  env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), ASIG), data) })

// ═══ G. GESTORES — la lista de giros no se toca en ninguna dirección ═══

describe('G. gestores: giros por IGUALDAD EXACTA', () => {
  it('G1. rebuild legítimo conservando giros (corrección de valor_contratista) → permitido', async () => {
    await assertSucceeds(updateDoc(doc(db('diego'), ASIG), {
      preliquidacion: { ...preliqGiros(), valor_contratista: 650_000 },
      fecha_actualizacion: T1, historial: hist('diego'),
    }))
  }, TIMEOUT)

  it('G2. gestor MUTA el valor de un giro → denegado', async () => {
    await assertFails(updateDoc(doc(db('diego'), ASIG), {
      preliquidacion: preliqGiros([{ ...GIRO1, valor: 999_999 }]),
      fecha_actualizacion: T1,
    }))
  }, TIMEOUT)

  it('G3. gestor RETIRA la lista (vaciar el incurrido por la puerta de atrás) → denegado', async () => {
    await assertFails(updateDoc(doc(db('diego'), ASIG), {
      preliquidacion: preliqBase,
      fecha_actualizacion: T1,
    }))
  }, TIMEOUT)

  it('G4. gestor APPENDEA un giro (girar es de gerencia) → denegado', async () => {
    await assertFails(updateDoc(doc(db('diego'), ASIG), {
      preliquidacion: preliqGiros([GIRO1, GIRO2]),
      fecha_actualizacion: T1,
    }))
  }, TIMEOUT)

  it('G5. gestor ENCOGE la lista dejando una (borrado físico de un giro) → denegado', async () => {
    await sembrarAsig(asigGirada({ preliquidacion: preliqGiros([GIRO1, GIRO2]) }))
    await assertFails(updateDoc(doc(db('diego'), ASIG), {
      preliquidacion: preliqGiros([GIRO1]),
      fecha_actualizacion: T1,
    }))
  }, TIMEOUT)
})

// ═══ C2. GERENCIA — giran/corrigen/anulan SOLO GA + admin ═══

describe('C2. girar/corregir/anular: gerencia_administrativa + admin; GI y GG fuera', () => {
  it('C1. GA gira el PRIMER giro (aprobada → girada, nace giros[]) → permitido', async () => {
    await sembrarAsig(asigGirada({ estado: 'preliquidacion_aprobada', preliquidacion: preliqBase }))
    await assertSucceeds(updateDoc(doc(db('marcela'), ASIG), {
      estado: 'anticipo_girado',
      preliquidacion: preliqGiros([GIRO1]),
      fecha_actualizacion: T1, historial: hist('marcela'),
    }))
  }, TIMEOUT)

  it('C2. GA registra el giro ADICIONAL (append, estado quieto) → permitido', async () => {
    await assertSucceeds(updateDoc(doc(db('marcela'), ASIG), {
      preliquidacion: preliqGiros([GIRO1, GIRO2]),
      fecha_actualizacion: T1, historial: hist('marcela'),
    }))
  }, TIMEOUT)

  it('C3. GA corrige un giro con traza solo-crecer → permitido', async () => {
    await assertSucceeds(updateDoc(doc(db('marcela'), ASIG), {
      preliquidacion: preliqGiros([{
        ...GIRO1, valor: 300_000,
        correcciones: [{ fecha: T1, por: 'marcela', valor_anterior: 350_000, valor_nuevo: 300_000, motivo: 'typo' }],
      }]),
      fecha_actualizacion: T1, historial: hist('marcela'),
    }))
  }, TIMEOUT)

  it('C4. GA ANULA el único giro (marcador soft) y revierte a aprobada → permitido', async () => {
    await assertSucceeds(updateDoc(doc(db('marcela'), ASIG), {
      estado: 'preliquidacion_aprobada',
      preliquidacion: preliqGiros([{ ...GIRO1, anulado: { fecha: T1, por: 'marcela', motivo: 'no salió' } }]),
      fecha_actualizacion: T1, historial: hist('marcela', 'preliquidacion_aprobada'),
    }))
  }, TIMEOUT)

  it('C5. admin (respaldo declarado) gira adicional → permitido', async () => {
    await assertSucceeds(updateDoc(doc(db('root'), ASIG), {
      preliquidacion: preliqGiros([GIRO1, GIRO2]),
      fecha_actualizacion: T1, historial: hist('root'),
    }))
  }, TIMEOUT)

  for (const a of ['ingrid', 'giovanny'] as Actor[]) {
    it(`C6. ${ROLES[a]} intenta girar un adicional → denegado (quien avala no paga)`, async () => {
      await assertFails(updateDoc(doc(db(a), ASIG), {
        preliquidacion: preliqGiros([GIRO1, GIRO2]),
        fecha_actualizacion: T1, historial: hist(a),
      }))
    }, TIMEOUT)

    it(`C7. ${ROLES[a]} intenta corregir/anular un giro → denegado`, async () => {
      await assertFails(updateDoc(doc(db(a), ASIG), {
        preliquidacion: preliqGiros([{ ...GIRO1, valor: 1 }]),
        fecha_actualizacion: T1,
      }))
    }, TIMEOUT)
  }

  it('C8. REGRESIÓN: GI aprueba una preliquidación con salvedad SIN tocar giros → permitido', async () => {
    const { aprobada_por: _a, fecha_aprobacion: _f, ...sinAprobar } = preliqBase
    await sembrarAsig(asigGirada({
      estado: 'preliquidacion_definida',
      preliquidacion: sinAprobar,
    }))
    // (sin giros: la asignación aún no tiene anticipo)
    await assertSucceeds(updateDoc(doc(db('ingrid'), ASIG), {
      estado: 'preliquidacion_aprobada',
      preliquidacion: { ...preliqBase, salvedad: 'titular de viaje' },
      fecha_actualizacion: T1,
      historial: arrayUnion({ de: 'preliquidacion_definida', a: 'preliquidacion_aprobada', por: 'ingrid', fecha: T1, motivo: 'batería' }),
    }))
  }, TIMEOUT)

  it('C9. legacy: GI muta el `anticipo` singular → denegado; GA sí puede corregirlo', async () => {
    await sembrarAsig(asigGirada({ preliquidacion: { ...preliqBase, anticipo: GIRO1 } }))
    await assertFails(updateDoc(doc(db('ingrid'), ASIG), {
      preliquidacion: { ...preliqBase, anticipo: { ...GIRO1, valor: 1 } },
      fecha_actualizacion: T1,
    }))
    await assertSucceeds(updateDoc(doc(db('marcela'), ASIG), {
      preliquidacion: { ...preliqBase, anticipo: { ...GIRO1, valor: 300_000 } },
      fecha_actualizacion: T1, historial: hist('marcela'),
    }))
  }, TIMEOUT)

  it('C10. legacy → canónico: GA convierte anticipo a giros[] (el builder al tocar) → permitido', async () => {
    await sembrarAsig(asigGirada({ preliquidacion: { ...preliqBase, anticipo: GIRO1 } }))
    await assertSucceeds(updateDoc(doc(db('marcela'), ASIG), {
      preliquidacion: preliqGiros([GIRO1, GIRO2]),
      fecha_actualizacion: T1, historial: hist('marcela'),
    }))
  }, TIMEOUT)
})

// ═══ D. Parte D (31-oct) — la palabra 'solicitudes_anticipo' en el hasOnly
//     de gerencia: evaluar (girar/devolver) pasa; el C2 de giros sigue vivo ═══

describe('D. solicitudes de anticipo — la palabra aditiva de la Parte D', () => {
  const SOLICITUD = {
    estado: 'solicitada', monto_propuesto: 150_000, motivo: 'faltó material',
    soporte_contratista_url: 'https://x/soporte.pdf', solicitado_por: 'diego',
    fecha_solicitud: T0,
  }

  it('D1. GESTOR solicita (campo nuevo + historial) → permitido (su rama no tiene hasOnly)', async () => {
    await assertSucceeds(updateDoc(doc(db('diego'), ASIG), {
      solicitudes_anticipo: [SOLICITUD],
      fecha_actualizacion: T1, historial: hist('diego'),
    }))
  }, TIMEOUT)

  it('D2. GERENCIA gira DESDE la solicitud (giros + solicitudes_anticipo en el MISMO write) → permitido', async () => {
    await sembrarAsig(asigGirada({ solicitudes_anticipo: [SOLICITUD] }))
    await assertSucceeds(updateDoc(doc(db('marcela'), ASIG), {
      preliquidacion: preliqGiros([GIRO1, GIRO2]),
      solicitudes_anticipo: [{ ...SOLICITUD, estado: 'girada', giro_indice: 1, girada: { fecha: T1, por: 'marcela' } }],
      fecha_actualizacion: T1, historial: hist('marcela'),
    }))
  }, TIMEOUT)

  it('D3. GERENCIA devuelve con motivo (solo solicitudes_anticipo + historial) → permitido', async () => {
    await sembrarAsig(asigGirada({ solicitudes_anticipo: [SOLICITUD] }))
    await assertSucceeds(updateDoc(doc(db('marcela'), ASIG), {
      solicitudes_anticipo: [{ ...SOLICITUD, estado: 'devuelta', devolucion: { fecha: T1, por: 'marcela', motivo: 'falta detalle' } }],
      fecha_actualizacion: T1, historial: hist('marcela'),
    }))
  }, TIMEOUT)

  it('D4. REGRESIÓN C2: marcar girada SIN poder tocar giros sigue cerrado para GI/GG', async () => {
    await sembrarAsig(asigGirada({ solicitudes_anticipo: [SOLICITUD] }))
    // GI intenta "girar" (giros cambian) → el C2 lo corta aunque la palabra exista
    await assertFails(updateDoc(doc(db('ingrid'), ASIG), {
      preliquidacion: preliqGiros([GIRO1, GIRO2]),
      solicitudes_anticipo: [{ ...SOLICITUD, estado: 'girada', giro_indice: 1 }],
      fecha_actualizacion: T1, historial: hist('ingrid'),
    }))
  }, TIMEOUT)
})
