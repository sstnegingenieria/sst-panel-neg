// @vitest-environment node
//
// Batería de las reglas de Firestore del MÓDULO LICITACIONES (1.2):
//   - match /licitaciones/{id}                  (read/create/update, sin delete)
//   - match /licitaciones/{id}/economia/{docId} (read/write acotado)
//   - match /configuracion/semaforo_versiones   (escritura del criterio)
//
// PRINCIPIO DE LA BATERÍA (lección de método del SB2.2): cada vía de
// DENEGACIÓN se prueba con el actor de MÍNIMO PRIVILEGIO que casi puede — no
// con un anónimo. Un 403 anónimo no prueba nada de una regla por rol: prueba
// que el catch-all existe. El caso que importa acá es `operacion_comercial`
// autenticado, CON acceso pleno a la licitación padre, recibiendo 403 en
// `economia`.
//
// NO forma parte del `npm test` por defecto. Se corre con:
//   npx firebase emulators:exec --project demo-neg --only firestore \
//     "npx vitest run --config vitest.emulator.config.ts src/hooks/sigp/__tests__/licitacionesFirestoreRules.test.ts"

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore'

const TIMEOUT = 30_000

// ── Actores: uid -> rol de `users/{uid}.rol` ──────────────────────────────────
const ROLES = {
  karen: 'operacion_comercial',        // el actor que casi puede
  giovanny: 'gerencia_general',
  marcela: 'gerencia_administrativa',
  diego: 'director_proyectos',
  root: 'admin',
  paula: 'auxiliar_proyectos',         // gestiona proyectos pero NO licitaciones
  ingrid: 'gestion_integral',
  sofia: 'sst',
  ramiro: 'residente_sst',
  cesar: 'residente_obra',
  claro: 'cliente_final',
} as const

type Actor = keyof typeof ROLES

const LIC_ID = 'lic_0001'
const LIC = `licitaciones/${LIC_ID}`
const ECO = `licitaciones/${LIC_ID}/economia/analisis`
const CRITERIO = 'configuracion/semaforo_versiones'

let env: RulesTestEnvironment

const db = (a: Actor) => env.authenticatedContext(a).firestore()
const dbAnon = () => env.unauthenticatedContext().firestore()

const CONS = 'LIC-2026-0001'

/**
 * Documento de licitación válido. CONSECUTIVO DIFERIDO (1.2b): nace en '' y
 * solo se asigna al materializar, así que el fixture lo deja vacío salvo que
 * el caso pida lo contrario.
 */
const licValida = (creadoPor: string, extra?: Record<string, unknown>) => ({
  consecutivo: '',
  numero_proceso: 'MC-DNP-004-2026',
  id_secop: 'CO1.BDOS.1234567',
  origen: 'secop_ii',
  url_proceso: 'https://community.secop.gov.co/x',
  entidad: {
    nombre: 'DNP', nit: '899999037-4', orden: 'Nacional',
    departamento: 'Distrito Capital de Bogotá', ciudad: 'Bogotá',
  },
  objeto: 'Mantenimiento locativo',
  categoria_unspsc: '72101500',
  modalidad: 'minima_cuantia',
  presupuesto_oficial: 6_011_508,
  lotes: 1,
  cronograma: {
    publicacion: null, manifestacion: null, sorteo: null,
    cierre: null, adjudicacion: null,
  },
  semaforo: 'verde',
  semaforo_motivos: [],
  semaforo_version: 'v1.0',
  semaforo_calculado_en: null,
  override_manual: null,
  estado: 'detectada',
  motivo_descarte: null,
  oferta_neg: null,
  oferta_ganador: null,
  ganador: null,
  manifestaciones: null,
  ofertas_recibidas: null,
  responsable_uid: creadoPor,
  creado_por: creadoPor,
  creado_en: null,
  actualizado_por: creadoPor,
  actualizado_en: null,
  activa: true,
  migrado: false,
  capacidad_manual: null,
  ...extra,
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-neg',
    firestore: {
      // El test vive en src/hooks/sigp/__tests__/ → la raíz está 4 niveles arriba.
      rules: readFileSync(resolve(__dirname, '../../../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
}, TIMEOUT)

afterAll(async () => {
  await env.cleanup()
})

// Estado fresco antes de cada test: los `users` con su rol, una licitación
// sembrada, su sub-doc de economía y el registro del criterio.
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore()
    for (const [uid, rol] of Object.entries(ROLES)) {
      await setDoc(doc(d, 'users', uid), { nombre: uid, rol, estado: 'activo' })
    }
    await setDoc(doc(d, LIC), licValida('karen'))
    await setDoc(doc(d, ECO), { oferta_neg: 5_800_000, margen_pct: 18 })
    await setDoc(doc(d, CRITERIO), { versiones: {}, version_actual: 'v1.0' })
  })
}, TIMEOUT)

// ───────────────────────── licitaciones — read ─────────────────────────

describe('licitaciones/{id} — read', () => {
  const PERMITIDOS: Actor[] = ['karen', 'giovanny', 'marcela', 'diego', 'root']
  const DENEGADOS: Actor[] = ['sofia', 'ramiro', 'cesar', 'claro', 'paula', 'ingrid']

  for (const a of PERMITIDOS) {
    it(`1. ${ROLES[a]} LEE la licitación → permitido`, async () => {
      await assertSucceeds(getDoc(doc(db(a), LIC)))
    }, TIMEOUT)
  }

  for (const a of DENEGADOS) {
    it(`2. ${ROLES[a]} NO lee la licitación → denegado`, async () => {
      await assertFails(getDoc(doc(db(a), LIC)))
    }, TIMEOUT)
  }

  it('3. el list de la colección sigue el mismo gate (sst denegado)', async () => {
    await assertFails(getDocs(collection(db('sofia'), 'licitaciones')))
    await assertSucceeds(getDocs(collection(db('karen'), 'licitaciones')))
  }, TIMEOUT)

  it('4. anónimo denegado (control del catch-all, no de la regla por rol)', async () => {
    await assertFails(getDoc(doc(dbAnon(), LIC)))
  }, TIMEOUT)
})

// ───────────────────────── licitaciones — create ─────────────────────────

describe('licitaciones/{id} — create', () => {
  const NUEVA = 'licitaciones/lic_nueva'

  it('5. comercial crea una licitación válida → permitido', async () => {
    await assertSucceeds(setDoc(doc(db('karen'), NUEVA), licValida('karen')))
  }, TIMEOUT)

  it('6. RECHAZO: estado distinto de detectada (actor: comercial, que sí puede crear)', async () => {
    await assertFails(setDoc(doc(db('karen'), NUEVA), {
      ...licValida('karen'), estado: 'en_preparacion',
    }))
  }, TIMEOUT)

  it('7. RECHAZO: nace descartada — ni con motivo, el estado inicial es uno solo', async () => {
    await assertFails(setDoc(doc(db('karen'), NUEVA), {
      ...licValida('karen'), estado: 'descartada', motivo_descarte: 'SORTEO', activa: false,
    }))
  }, TIMEOUT)

  it('8. RECHAZO: creado_por suplantado', async () => {
    await assertFails(setDoc(doc(db('karen'), NUEVA), licValida('giovanny')))
  }, TIMEOUT)

  it('9. RECHAZO: activa en false al nacer', async () => {
    await assertFails(setDoc(doc(db('karen'), NUEVA), {
      ...licValida('karen'), activa: false,
    }))
  }, TIMEOUT)

  it('10. RECHAZO: numero_proceso vacío', async () => {
    await assertFails(setDoc(doc(db('karen'), NUEVA), {
      ...licValida('karen'), numero_proceso: '',
    }))
  }, TIMEOUT)

  it('11. RECHAZO: semaforo_version vacío — sin criterio no es auditable', async () => {
    await assertFails(setDoc(doc(db('karen'), NUEVA), {
      ...licValida('karen'), semaforo_version: '',
    }))
  }, TIMEOUT)

  it('12. RECHAZO: auxiliar_proyectos crea — gestiona proyectos, no licitaciones', async () => {
    await assertFails(setDoc(doc(db('paula'), NUEVA), licValida('paula')))
  }, TIMEOUT)

  it('12b. RECHAZO: nacer CON consecutivo — el número se quema al materializar', async () => {
    // Contigüidad ISO: un proceso detectado en SECOP y descartado a los dos
    // minutos no puede haber gastado un LIC.
    await assertFails(setDoc(doc(db('karen'), NUEVA), licValida('karen', {
      consecutivo: CONS,
    })))
  }, TIMEOUT)
})

// ───────────────────────── licitaciones — update ─────────────────────────

describe('licitaciones/{id} — update', () => {
  it('13. avance de estado por un rol del módulo → permitido', async () => {
    await assertSucceeds(updateDoc(doc(db('karen'), LIC), {
      estado: 'en_evaluacion', activa: true, motivo_descarte: null,
      actualizado_por: 'karen',
    }))
  }, TIMEOUT)

  it('14. RECHAZO: consecutivo modificado (actor: gerencia_general)', async () => {
    // El doc sembrado nace en '' — se le asigna uno primero para que el caso
    // pruebe la REESCRITURA y no la asignación inicial.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), LIC), { consecutivo: CONS })
    })
    await assertFails(updateDoc(doc(db('giovanny'), LIC), {
      consecutivo: 'LIC-2026-9999', actualizado_por: 'giovanny',
    }))
  }, TIMEOUT)

  it('15. RECHAZO: creado_por modificado (actor: gerencia_general)', async () => {
    await assertFails(updateDoc(doc(db('giovanny'), LIC), {
      creado_por: 'giovanny', actualizado_por: 'giovanny',
    }))
  }, TIMEOUT)

  it('16. RECHAZO: actualizado_por suplantado', async () => {
    await assertFails(updateDoc(doc(db('karen'), LIC), {
      estado: 'en_evaluacion', actualizado_por: 'giovanny',
    }))
  }, TIMEOUT)

  it('17. RECHAZO: otro actor actualiza SIN re-sellar actualizado_por', async () => {
    // `request.resource.data` es el documento RESULTANTE, no el delta: si el
    // update no toca `actualizado_por`, la regla evalúa el valor viejo. El doc
    // sembrado dice 'karen', así que giovanny no puede actualizar sin sellarse
    // — es la garantía real: nadie escribe dejando el sello de otro.
    await assertFails(updateDoc(doc(db('giovanny'), LIC), { estado: 'en_evaluacion' }))
    // Y sellándose, sí puede.
    await assertSucceeds(updateDoc(doc(db('giovanny'), LIC), {
      estado: 'en_evaluacion', actualizado_por: 'giovanny',
    }))
  }, TIMEOUT)

  it('17b. el último actualizador puede repetir sin re-sellar (el sello ya es correcto)', async () => {
    // Consecuencia documentada de lo anterior, no un agujero: el doc sembrado
    // tiene actualizado_por = 'karen' y karen es quien escribe, así que el
    // sello resultante sigue siendo veraz. `actualizado_en` NO lo exige la
    // regla — la frescura de la fecha la mantienen los patch builders.
    await assertSucceeds(updateDoc(doc(db('karen'), LIC), { estado: 'en_evaluacion' }))
  }, TIMEOUT)

  it('18. RECHAZO: un rol fuera del módulo actualiza (residente_sst)', async () => {
    await assertFails(updateDoc(doc(db('ramiro'), LIC), {
      estado: 'en_evaluacion', actualizado_por: 'ramiro',
    }))
  }, TIMEOUT)
})

// ────────── consecutivo diferido: invariantes 6 y 7 en reglas ──────────

describe('licitaciones/{id} — consecutivo diferido (invariantes 6 y 7)', () => {
  /** Asigna un consecutivo saltándose las reglas (para probar la reescritura). */
  const sembrarConsecutivo = async (valor: string) => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), LIC), { consecutivo: valor })
    })
  }

  it('35. la transición vacío -> LIC-2026-0001 se permite UNA vez', async () => {
    await assertSucceeds(updateDoc(doc(db('karen'), LIC), {
      estado: 'en_preparacion', activa: true, motivo_descarte: null,
      consecutivo: CONS, actualizado_por: 'karen',
    }))
  }, TIMEOUT)

  it('36. CLAVE: la SEGUNDA reescritura se deniega a gerencia_general', async () => {
    // Primera asignación por la vía legítima.
    await assertSucceeds(updateDoc(doc(db('karen'), LIC), {
      estado: 'en_preparacion', activa: true, motivo_descarte: null,
      consecutivo: CONS, actualizado_por: 'karen',
    }))
    // Segunda: el número ya está quemado y es inmutable — ni la dirección.
    await assertFails(updateDoc(doc(db('giovanny'), LIC), {
      consecutivo: 'LIC-2026-0002', actualizado_por: 'giovanny',
    }))
  }, TIMEOUT)

  it('37. RECHAZO: limpiar un consecutivo ya asignado (actor: admin)', async () => {
    await sembrarConsecutivo(CONS)
    await assertFails(updateDoc(doc(db('root'), LIC), {
      consecutivo: '', actualizado_por: 'root',
    }))
  }, TIMEOUT)

  it('38. RECHAZO: asignar algo que no es de la serie LIC', async () => {
    for (const malo of ['PRY-2026-0001', 'LIC-2026-001', 'inventado', 'lic-2026-0001']) {
      await assertFails(updateDoc(doc(db('karen'), LIC), {
        estado: 'en_preparacion', activa: true, motivo_descarte: null,
        consecutivo: malo, actualizado_por: 'karen',
      }))
    }
  }, TIMEOUT)

  it('39. CLAVE: avanzar a en_preparacion con consecutivo vacío → 403 a comercial', async () => {
    // El actor de mínimo privilegio que SÍ podría hacer la transición: lo
    // único que falla es la invariante 6.
    await assertFails(updateDoc(doc(db('karen'), LIC), {
      estado: 'en_preparacion', activa: true, motivo_descarte: null,
      actualizado_por: 'karen',
    }))
  }, TIMEOUT)

  it('40. los OCHO estados de compromiso y resultado exigen número', async () => {
    const EXIGEN = [
      'en_preparacion', 'manifestada', 'presentada',
      'adjudicada', 'perdida', 'rechazada', 'revocada', 'desierta',
    ]
    for (const estado of EXIGEN) {
      await assertFails(updateDoc(doc(db('karen'), LIC), {
        estado, activa: true, motivo_descarte: null, actualizado_por: 'karen',
      }))
    }
  }, TIMEOUT)

  it('41. los TRES de triage avanzan sin número', async () => {
    await assertSucceeds(updateDoc(doc(db('karen'), LIC), {
      estado: 'en_evaluacion', activa: true, motivo_descarte: null,
      actualizado_por: 'karen',
    }))
  }, TIMEOUT)

  it('42. CLAVE: descartada con consecutivo VACÍO se permite', async () => {
    // El caso normal: se descartó antes de materializar, no gastó número.
    await assertSucceeds(updateDoc(doc(db('karen'), LIC), {
      estado: 'descartada', activa: false, motivo_descarte: 'SORTEO',
      actualizado_por: 'karen',
    }))
  }, TIMEOUT)

  it('43. descartada CONSERVA el número que quemó — hueco legítimo como en SOL', async () => {
    await sembrarConsecutivo(CONS)
    await assertSucceeds(updateDoc(doc(db('karen'), LIC), {
      estado: 'descartada', activa: false, motivo_descarte: 'INDICADORES',
      actualizado_por: 'karen',
    }))
  }, TIMEOUT)

  it('45. CLAVE: un MIGRADO se actualiza en estado de resultado SIN número', async () => {
    // Los ~350 históricos entran con consecutivo '' en estados como `perdida`.
    // Sin la excepción de `migrado` en la regla, CUALQUIER update sobre un
    // histórico quedaría denegado para siempre.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), LIC), licValida('karen', {
        migrado: true, estado: 'perdida', activa: false, consecutivo: '',
      }))
    })
    await assertSucceeds(updateDoc(doc(db('karen'), LIC), {
      objeto: 'Objeto corregido tras la migración', actualizado_por: 'karen',
    }))
  }, TIMEOUT)

  it('46. el mismo update sobre un NO migrado se deniega (la excepción es real)', async () => {
    // Actor y patch idénticos al 45: lo ÚNICO que cambia es `migrado`.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), LIC), licValida('karen', {
        migrado: false, estado: 'perdida', activa: false, consecutivo: '',
      }))
    })
    await assertFails(updateDoc(doc(db('karen'), LIC), {
      objeto: 'Objeto corregido', actualizado_por: 'karen',
    }))
  }, TIMEOUT)

  it('47. RECHAZO: `migrado` es inmutable — un histórico no se vuelve numerado', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), LIC), licValida('karen', {
        migrado: true, estado: 'perdida', activa: false,
      }))
    })
    await assertFails(updateDoc(doc(db('karen'), LIC), {
      migrado: false, actualizado_por: 'karen',
    }))
    // Y al revés, sobre el doc no migrado del beforeEach.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), LIC), licValida('karen'))
    })
    await assertFails(updateDoc(doc(db('root'), LIC), {
      migrado: true, actualizado_por: 'root',
    }))
  }, TIMEOUT)

  it('48. un migrado tampoco puede reescribir un consecutivo (invariante 7 intacta)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), LIC), licValida('karen', {
        migrado: true, estado: 'perdida', activa: false, consecutivo: CONS,
      }))
    })
    await assertFails(updateDoc(doc(db('karen'), LIC), {
      consecutivo: 'LIC-2026-0002', actualizado_por: 'karen',
    }))
  }, TIMEOUT)

  it('44. con número ya asignado, el resto del recorrido no lo vuelve a tocar', async () => {
    await sembrarConsecutivo(CONS)
    await assertSucceeds(updateDoc(doc(db('karen'), LIC), {
      estado: 'presentada', activa: true, motivo_descarte: null,
      actualizado_por: 'karen',
    }))
    await assertSucceeds(updateDoc(doc(db('karen'), LIC), {
      estado: 'adjudicada', activa: false, motivo_descarte: null,
      actualizado_por: 'karen',
    }))
  }, TIMEOUT)
})

// ───────────────────────── licitaciones — delete ─────────────────────────

describe('licitaciones/{id} — delete SIEMPRE denegado', () => {
  const TODOS = Object.keys(ROLES) as Actor[]

  it('19. RECHAZO: admin no borra — un proceso de SECOP se descarta, no se borra', async () => {
    await assertFails(deleteDoc(doc(db('root'), LIC)))
  }, TIMEOUT)

  it('20. RECHAZO: ningún rol del sistema borra', async () => {
    for (const a of TODOS) {
      await assertFails(deleteDoc(doc(db(a), LIC)))
    }
  }, TIMEOUT)
})

// ─────────────────── economia — la vía que de verdad importa ───────────────────

describe('licitaciones/{id}/economia — sin operacion_comercial', () => {
  const PERMITIDOS: Actor[] = ['giovanny', 'marcela', 'diego', 'root']

  it('21. CLAVE: comercial LEE la licitación padre pero NO su economía', async () => {
    // Mismo actor, mismo test: el 200 del padre es lo que hace válido el 403
    // del hijo. Sin la primera aserción, el 403 podría venir de cualquier lado.
    await assertSucceeds(getDoc(doc(db('karen'), LIC)))
    await assertFails(getDoc(doc(db('karen'), ECO)))
  }, TIMEOUT)

  it('22. CLAVE: comercial no ESCRIBE la economía', async () => {
    await assertFails(setDoc(doc(db('karen'), ECO), { oferta_neg: 1 }))
    await assertFails(updateDoc(doc(db('karen'), ECO), { oferta_neg: 1 }))
  }, TIMEOUT)

  it('23. CLAVE: comercial no lista la subcolección', async () => {
    await assertFails(getDocs(collection(db('karen'), 'licitaciones', LIC_ID, 'economia')))
  }, TIMEOUT)

  for (const a of PERMITIDOS) {
    it(`24. ${ROLES[a]} lee, crea y actualiza la economía → permitido`, async () => {
      await assertSucceeds(getDoc(doc(db(a), ECO)))
      await assertSucceeds(setDoc(doc(db(a), ECO), { oferta_neg: 5_700_000 }))
      await assertSucceeds(updateDoc(doc(db(a), ECO), { margen_pct: 20 }))
    }, TIMEOUT)
  }

  it('24b. SOFT-DELETE: el delete se deniega a TODOS, admin incluido', async () => {
    // Actor de MÁXIMO privilegio: si admin no borra, nadie borra. El análisis
    // económico es evidencia de cómo se decidió una oferta — se corrige con
    // una versión nueva, no se borra (restricción 5.1).
    await assertFails(deleteDoc(doc(db('root'), ECO)))
    for (const a of PERMITIDOS) {
      await assertFails(deleteDoc(doc(db(a), ECO)))
    }
  }, TIMEOUT)

  it('25. el match del padre NO cubre la subcolección (no se usó {id=**})', async () => {
    // auxiliar_proyectos no está en ninguno de los dos helpers: doble 403.
    await assertFails(getDoc(doc(db('paula'), LIC)))
    await assertFails(getDoc(doc(db('paula'), ECO)))
  }, TIMEOUT)
})

// ──────────────── configuracion/semaforo_versiones — el criterio ────────────────

describe('configuracion/semaforo_versiones — segregación de funciones', () => {
  it('26. comercial LEE el criterio que la gobierna', async () => {
    await assertSucceeds(getDoc(doc(db('karen'), CRITERIO)))
  }, TIMEOUT)

  it('27. CLAVE: comercial NO escribe el criterio (mismo actor que sí lo lee)', async () => {
    await assertFails(updateDoc(doc(db('karen'), CRITERIO), { version_actual: 'v2.0' }))
    await assertFails(setDoc(doc(db('karen'), CRITERIO), { versiones: {}, version_actual: 'v2.0' }))
  }, TIMEOUT)

  it('28. gerencia_general SÍ escribe el criterio', async () => {
    await assertSucceeds(updateDoc(doc(db('giovanny'), CRITERIO), { version_actual: 'v2.0' }))
  }, TIMEOUT)

  it('29. gerencia_administrativa SÍ escribe (es lo que agrega este match)', async () => {
    await assertSucceeds(updateDoc(doc(db('marcela'), CRITERIO), { version_actual: 'v2.0' }))
  }, TIMEOUT)

  it('30. admin SÍ escribe', async () => {
    await assertSucceeds(updateDoc(doc(db('root'), CRITERIO), { version_actual: 'v2.0' }))
  }, TIMEOUT)

  it('31. RECHAZO: director_proyectos no escribe el criterio', async () => {
    await assertFails(updateDoc(doc(db('diego'), CRITERIO), { version_actual: 'v2.0' }))
  }, TIMEOUT)

  it('32. RECHAZO: delete del criterio denegado incluso a gerencia_general', async () => {
    await assertFails(deleteDoc(doc(db('giovanny'), CRITERIO)))
    await assertFails(deleteDoc(doc(db('root'), CRITERIO)))
  }, TIMEOUT)

  it('33. REGRESIÓN: configuracion/indicadores NO ganó a gerencia_administrativa', async () => {
    // El match nuevo es de un doc específico; el genérico sigue en [GG, admin].
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'configuracion/indicadores'), { meta_margen_pct: 15 })
    })
    await assertFails(updateDoc(doc(db('marcela'), 'configuracion/indicadores'), {
      meta_margen_pct: 20,
    }))
    await assertSucceeds(updateDoc(doc(db('giovanny'), 'configuracion/indicadores'), {
      meta_margen_pct: 20,
    }))
  }, TIMEOUT)

  it('34. REGRESIÓN: configuracion/horario sigue legible por cualquier autenticado', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'configuracion/horario'), { hora_fin_jornada: '18:00' })
    })
    await assertSucceeds(getDoc(doc(db('sofia'), 'configuracion/horario')))
  }, TIMEOUT)
})
