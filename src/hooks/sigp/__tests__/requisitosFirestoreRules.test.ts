// @vitest-environment node
//
// Batería de las reglas de Firestore del CHECKLIST DE REQUISITOS (A.2a):
//   - match /licitaciones/{id}/requisitos/{reqId}  (read/create/update, SIN delete)
//   - match /configuracion/plantilla_requisitos    (escritura de la plantilla)
//
// PRINCIPIO DE LA BATERÍA (lección de método del SB2.2): cada vía de
// DENEGACIÓN se prueba con el actor de MÍNIMO PRIVILEGIO que casi puede. Un
// 403 anónimo no prueba nada de una regla por rol — prueba que el catch-all
// existe. Los casos que importan acá:
//   · `operacion_comercial` (Karen), que SÍ gestiona licitaciones, recibiendo
//     403 al crear con un veredicto heredado, al firmar con el uid de otro y
//     al escribir la plantilla.
//   · `admin`, que puede casi todo, recibiendo 403 en el delete.
//   · `gestion_integral`, que lee media casa, sin lectura de requisitos.
//
// NO forma parte del `npm test` por defecto. Se corre con:
//   npx firebase emulators:exec --project demo-neg --only firestore \
//     "npx vitest run --config vitest.emulator.config.ts src/hooks/sigp/__tests__/requisitosFirestoreRules.test.ts"

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
  karen: 'operacion_comercial',        // gestiona licitaciones — el que casi puede
  giovanny: 'gerencia_general',
  marcela: 'gerencia_administrativa',
  diego: 'director_proyectos',
  root: 'admin',
  paula: 'auxiliar_proyectos',         // gestiona proyectos, NO licitaciones
  ingrid: 'gestion_integral',
  sofia: 'sst',
  cesar: 'residente_obra',
} as const

type Actor = keyof typeof ROLES

const LIC_ID = 'lic_0001'
const LIC = `licitaciones/${LIC_ID}`
const REQS = `licitaciones/${LIC_ID}/requisitos`
const REQ = `${REQS}/req_0001`
const REQ_FIRMADO = `${REQS}/req_firmado`
const PLANTILLA = 'configuracion/plantilla_requisitos'
const CRITERIO = 'configuracion/semaforo_versiones'

let env: RulesTestEnvironment

const db = (a: Actor) => env.authenticatedContext(a).firestore()
const dbAnon = () => env.unauthenticatedContext().firestore()

/** Requisito recién capturado: una PREGUNTA, sin veredicto ni firma. */
const reqPendiente = (creadoPor: string, extra?: Record<string, unknown>) => ({
  categoria: 'juridico',
  descripcion: 'Certificado de existencia y representación legal',
  fuente_pliego: '3.2.1',
  tipo_evidencia: 'documento_empresa',
  documento_empresa_id: null,
  persona: null,
  indicador: null,
  operador: null,
  valor_exigido: null,
  valor_neg: null,
  estado: 'pendiente',
  verificado_por: null,
  verificado_en: null,
  observacion: '',
  activo: true,
  creado_por: creadoPor,
  creado_en: null,
  actualizado_por: creadoPor,
  actualizado_en: null,
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

// Estado fresco: los `users` con su rol, la licitación padre, un requisito
// pendiente y uno YA FIRMADO por Pedro (giovanny) para los casos de update.
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore()
    for (const [uid, rol] of Object.entries(ROLES)) {
      await setDoc(doc(d, 'users', uid), { nombre: uid, rol, estado: 'activo' })
    }
    await setDoc(doc(d, LIC), { numero_proceso: 'MC-DNP-004-2026', estado: 'detectada' })
    await setDoc(doc(d, REQ), reqPendiente('karen'))
    await setDoc(doc(d, REQ_FIRMADO), reqPendiente('karen', {
      estado: 'cumple',
      verificado_por: 'giovanny',
      verificado_en: null,
      actualizado_por: 'giovanny',
    }))
    await setDoc(doc(d, PLANTILLA), { versiones: {}, version_actual: 'v1.0' })
    // El registro del criterio lo usa el test de regresión 33. Se siembra
    // aunque no sea el sujeto de esta batería: un `updateDoc` sobre un doc
    // INEXISTENTE lanza NOT_FOUND, y en el lado `assertFails` un NOT_FOUND
    // puede pasar por un 403 — un falso positivo es peor que un falso
    // negativo, porque da confianza donde no la hay.
    await setDoc(doc(d, CRITERIO), { versiones: {}, version_actual: 'v1.0' })
  })
}, TIMEOUT)

// ═════════════════════════════════════════════════════════════════════════════
// requisitos — read
// ═════════════════════════════════════════════════════════════════════════════

describe('requisitos — read', () => {
  const PERMITIDOS: Actor[] = ['karen', 'giovanny', 'marcela', 'diego', 'root']
  const DENEGADOS: Actor[] = ['sofia', 'cesar', 'paula', 'ingrid']

  for (const a of PERMITIDOS) {
    it(`1. ${ROLES[a]} LEE el requisito → permitido`, async () => {
      await assertSucceeds(getDoc(doc(db(a), REQ)))
    }, TIMEOUT)
  }

  for (const a of DENEGADOS) {
    it(`2. ${ROLES[a]} NO lee el requisito`, async () => {
      await assertFails(getDoc(doc(db(a), REQ)))
    }, TIMEOUT)
  }

  it('3. CLAVE: `sst` no lee — su frente es el aval, no el pliego', async () => {
    await assertFails(getDoc(doc(db('sofia'), REQ)))
    await assertFails(getDocs(collection(db('sofia'), REQS)))
  }, TIMEOUT)

  it('4. CLAVE: `residente_obra` no lee — su módulo es Actividades', async () => {
    await assertFails(getDoc(doc(db('cesar'), REQ)))
    await assertFails(getDocs(collection(db('cesar'), REQS)))
  }, TIMEOUT)

  it('5. el LIST de la subcolección sigue la misma puerta', async () => {
    await assertSucceeds(getDocs(collection(db('karen'), REQS)))
    await assertFails(getDocs(collection(db('paula'), REQS)))
  }, TIMEOUT)

  it('6. anónimo no lee', async () => {
    await assertFails(getDoc(doc(dbAnon(), REQ)))
  }, TIMEOUT)
})

// ═════════════════════════════════════════════════════════════════════════════
// requisitos — create: nace como PREGUNTA
// ═════════════════════════════════════════════════════════════════════════════

describe('requisitos — create', () => {
  it('7. karen crea un requisito pendiente y activo → permitido', async () => {
    await assertSucceeds(
      setDoc(doc(db('karen'), `${REQS}/nuevo`), reqPendiente('karen')),
    )
  }, TIMEOUT)

  it('8. CLAVE: karen NO puede crear con `estado` distinto de pendiente', async () => {
    // La pata de reglas de la invariante 1: ni clonando una plantilla ni por
    // un write a mano entra un veredicto heredado. El actor de mínimo
    // privilegio es justamente quien SÍ puede crear.
    for (const estado of ['cumple', 'no_cumple', 'no_aplica']) {
      await assertFails(
        setDoc(doc(db('karen'), `${REQS}/n_${estado}`), reqPendiente('karen', { estado })),
      )
    }
  }, TIMEOUT)

  it('9. tampoco creando ya firmado (cumple + verificado_por propio)', async () => {
    await assertFails(
      setDoc(doc(db('karen'), `${REQS}/n_firmado`), reqPendiente('karen', {
        estado: 'cumple', verificado_por: 'karen',
      })),
    )
  }, TIMEOUT)

  it('10. RECHAZO: descripción vacía o en blanco', async () => {
    await assertFails(
      setDoc(doc(db('karen'), `${REQS}/n_sin_desc`), reqPendiente('karen', { descripcion: '' })),
    )
  }, TIMEOUT)

  it('11. RECHAZO: nacer inactivo — un requisito invisible es evidencia que engaña', async () => {
    await assertFails(
      setDoc(doc(db('karen'), `${REQS}/n_inactivo`), reqPendiente('karen', { activo: false })),
    )
  }, TIMEOUT)

  it('12. RECHAZO: suplantar el creador', async () => {
    await assertFails(
      setDoc(doc(db('karen'), `${REQS}/n_suplanta`), reqPendiente('giovanny')),
    )
  }, TIMEOUT)

  it('13. un rol fuera del módulo no crea, ni con el payload perfecto', async () => {
    await assertFails(setDoc(doc(db('paula'), `${REQS}/n_paula`), reqPendiente('paula')))
    await assertFails(setDoc(doc(db('ingrid'), `${REQS}/n_ingrid`), reqPendiente('ingrid')))
    await assertFails(setDoc(doc(db('sofia'), `${REQS}/n_sofia`), reqPendiente('sofia')))
  }, TIMEOUT)
})

// ═════════════════════════════════════════════════════════════════════════════
// requisitos — update: nadie firma con el nombre de otro
// ═════════════════════════════════════════════════════════════════════════════

describe('requisitos — update', () => {
  it('14. karen marca `cumple` firmando con SU uid → permitido', async () => {
    await assertSucceeds(updateDoc(doc(db('karen'), REQ), {
      estado: 'cumple', verificado_por: 'karen', actualizado_por: 'karen',
    }))
  }, TIMEOUT)

  it('15. CLAVE: karen NO puede firmar un veredicto con el uid de otro', async () => {
    for (const estado of ['cumple', 'no_cumple', 'no_aplica']) {
      await assertFails(updateDoc(doc(db('karen'), REQ), {
        estado, verificado_por: 'giovanny', actualizado_por: 'karen',
      }))
    }
  }, TIMEOUT)

  it('16. ni dejando `verificado_por` en null al marcar un veredicto', async () => {
    await assertFails(updateDoc(doc(db('karen'), REQ), {
      estado: 'cumple', verificado_por: null, actualizado_por: 'karen',
    }))
  }, TIMEOUT)

  it('17. devolver a `pendiente` está abierto a cualquiera del módulo', async () => {
    // El resultado ES pendiente, así que la cláusula de la firma no aplica —
    // y es la escotilla que permite reabrir lo que otro verificó.
    await assertSucceeds(updateDoc(doc(db('diego'), REQ_FIRMADO), {
      estado: 'pendiente', verificado_por: null, actualizado_por: 'diego',
    }))
  }, TIMEOUT)

  it('18. CONSECUENCIA DECLARADA: tocar un requisito firmado por otro exige re-firmarlo', async () => {
    // `req_firmado` está en `cumple` con verificado_por: giovanny.
    // Karen editando solo la observación deja el resultado en `cumple` con la
    // firma de Pedro → DENEGADO.
    await assertFails(updateDoc(doc(db('karen'), REQ_FIRMADO), {
      observacion: 'reviso de paso', actualizado_por: 'karen',
    }))
    // Re-firmándolo ella (lo que hace `patchMarcarRequisito`) → permitido, y
    // queda honesto: Karen es la nueva verificadora.
    await assertSucceeds(updateDoc(doc(db('karen'), REQ_FIRMADO), {
      observacion: 'reviso de paso', verificado_por: 'karen', actualizado_por: 'karen',
    }))
  }, TIMEOUT)

  it('19. el dueño de la firma sí puede editar lo suyo sin cambiarla', async () => {
    await assertSucceeds(updateDoc(doc(db('giovanny'), REQ_FIRMADO), {
      observacion: 'matrícula verificada en el portal', actualizado_por: 'giovanny',
    }))
  }, TIMEOUT)

  it('20. RECHAZO: suplantar `actualizado_por`', async () => {
    await assertFails(updateDoc(doc(db('karen'), REQ), { actualizado_por: 'giovanny' }))
  }, TIMEOUT)

  it('21. RECHAZO: reescribir `creado_por`', async () => {
    await assertFails(updateDoc(doc(db('karen'), REQ), {
      creado_por: 'karen2', actualizado_por: 'karen',
    }))
  }, TIMEOUT)

  it('22. SOFT-DELETE: marcar `activo: false` es un update normal → permitido', async () => {
    await assertSucceeds(updateDoc(doc(db('karen'), REQ), {
      activo: false, actualizado_por: 'karen',
    }))
  }, TIMEOUT)

  it('23. un rol fuera del módulo no actualiza', async () => {
    await assertFails(updateDoc(doc(db('paula'), REQ), { actualizado_por: 'paula' }))
    await assertFails(updateDoc(doc(db('sofia'), REQ), { actualizado_por: 'sofia' }))
  }, TIMEOUT)
})

// ═════════════════════════════════════════════════════════════════════════════
// requisitos — delete: DENEGADO SIEMPRE
// ═════════════════════════════════════════════════════════════════════════════

describe('requisitos — delete denegado para TODOS', () => {
  for (const a of ['karen', 'giovanny', 'marcela', 'diego', 'root'] as Actor[]) {
    it(`24. ${ROLES[a]} NO puede borrar un requisito`, async () => {
      await assertFails(deleteDoc(doc(db(a), REQ)))
    }, TIMEOUT)
  }

  it('25. CLAVE: ni `admin` — un requisito se marca inactivo o va a no_aplica', async () => {
    await assertFails(deleteDoc(doc(db('root'), REQ)))
    await assertFails(deleteDoc(doc(db('root'), REQ_FIRMADO)))
  }, TIMEOUT)
})

// ═════════════════════════════════════════════════════════════════════════════
// plantilla_requisitos
// ═════════════════════════════════════════════════════════════════════════════

describe('configuracion/plantilla_requisitos', () => {
  const LEEN: Actor[] = ['karen', 'giovanny', 'marcela', 'diego', 'root', 'paula', 'ingrid']
  const NO_LEEN: Actor[] = ['sofia', 'cesar']
  const ESCRIBEN: Actor[] = ['giovanny', 'marcela', 'root']
  const NO_ESCRIBEN: Actor[] = ['karen', 'diego', 'paula', 'ingrid', 'sofia', 'cesar']

  for (const a of LEEN) {
    it(`26. ${ROLES[a]} LEE la plantilla (accesoSIGP) → permitido`, async () => {
      await assertSucceeds(getDoc(doc(db(a), PLANTILLA)))
    }, TIMEOUT)
  }

  for (const a of NO_LEEN) {
    it(`27. ${ROLES[a]} NO lee la plantilla`, async () => {
      await assertFails(getDoc(doc(db(a), PLANTILLA)))
    }, TIMEOUT)
  }

  for (const a of ESCRIBEN) {
    it(`28. ${ROLES[a]} ESCRIBE la plantilla → permitido`, async () => {
      await assertSucceeds(updateDoc(doc(db(a), PLANTILLA), { version_actual: 'v1.1' }))
    }, TIMEOUT)
  }

  for (const a of NO_ESCRIBEN) {
    it(`29. ${ROLES[a]} NO escribe la plantilla`, async () => {
      await assertFails(updateDoc(doc(db(a), PLANTILLA), { version_actual: 'v1.1' }))
    }, TIMEOUT)
  }

  it('30. CLAVE: karen LEE pero NO escribe — trabaja contra la lista, no la define', async () => {
    await assertSucceeds(getDoc(doc(db('karen'), PLANTILLA)))
    await assertFails(updateDoc(doc(db('karen'), PLANTILLA), { version_actual: 'v1.1' }))
  }, TIMEOUT)

  it('31. sin delete: el historial de versiones de la plantilla no se borra', async () => {
    for (const a of ['giovanny', 'marcela', 'root'] as Actor[]) {
      await assertFails(deleteDoc(doc(db(a), PLANTILLA)))
    }
  }, TIMEOUT)

  it('32. anónimo: ni lee ni escribe', async () => {
    await assertFails(getDoc(doc(dbAnon(), PLANTILLA)))
    await assertFails(updateDoc(doc(dbAnon(), PLANTILLA), { version_actual: 'v1.1' }))
  }, TIMEOUT)
})

// ═════════════════════════════════════════════════════════════════════════════
// REGRESIÓN: lo que esta batería NO debe haber movido
// ═════════════════════════════════════════════════════════════════════════════

describe('regresión — los bloques vecinos siguen como estaban', () => {
  it('33. `semaforo_versiones` conserva su escritura (GG/GA/admin) y karen fuera', async () => {
    await assertSucceeds(updateDoc(doc(db('marcela'), CRITERIO), {
      version_actual: 'v1.0',
    }))
    await assertFails(updateDoc(doc(db('karen'), CRITERIO), {
      version_actual: 'v1.0',
    }))
  }, TIMEOUT)

  it('34. la economía de la licitación sigue SIN karen', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${LIC}/economia/analisis`), { oferta_neg: 1 })
    })
    await assertFails(getDoc(doc(db('karen'), `${LIC}/economia/analisis`)))
    await assertSucceeds(getDoc(doc(db('marcela'), `${LIC}/economia/analisis`)))
  }, TIMEOUT)

  it('35. el padre `licitaciones/{id}` sigue leyéndose por el módulo', async () => {
    await assertSucceeds(getDoc(doc(db('karen'), LIC)))
    await assertFails(getDoc(doc(db('sofia'), LIC)))
  }, TIMEOUT)
})
