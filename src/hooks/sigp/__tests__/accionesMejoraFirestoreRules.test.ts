// @vitest-environment node
//
// Batería de las reglas de Firestore del MÓDULO AC/AP · F1 (ISO 10.2):
//   - match /acciones_mejora/{accionId}   (read/create/update; delete if false)
//
// PRINCIPIO DE LA BATERÍA (lección de método del SB2.2): cada vía de
// DENEGACIÓN se prueba con el actor de MÍNIMO PRIVILEGIO que casi puede — un
// rol real del panel, autenticado, con `users/{uid}` sembrado — no con un
// anónimo (un 403 anónimo solo prueba el catch-all). Y cada bloque lleva
// CONTROLES POSITIVOS (gestion_integral y admin SÍ pueden) para que un falso
// 403 — p. ej. un payload mal armado en el propio test — no pase por verde.
// Los inválidos se fabrican mutando UN campo del payload válido.
//
// NO forma parte del `npm test` por defecto. Se corre con:
//   npx firebase emulators:exec --project demo-neg --only firestore \
//     "npx vitest run --config vitest.emulator.config.ts --hookTimeout=60000 --testTimeout=60000 src/hooks/sigp/__tests__/accionesMejoraFirestoreRules.test.ts"

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs,
  arrayUnion, deleteField, Timestamp, type Firestore,
} from 'firebase/firestore'

// ── Actores: uid -> rol de `users/{uid}.rol` ──────────────────────────────────
const ROLES = {
  ingrid: 'gestion_integral',          // dueña del módulo (control positivo)
  root: 'admin',                       // respaldo (control positivo)
  giovanny: 'gerencia_general',        // alta dirección: casi puede — NO
  marcela: 'gerencia_administrativa',
  diego: 'director_proyectos',
  karen: 'operacion_comercial',
  paula: 'auxiliar_proyectos',
  sofia: 'sst',
  ramiro: 'residente_sst',
  tomas: 'tecnico',
  cesar: 'residente_obra',
} as const
type Actor = keyof typeof ROLES

const GESTORES: Actor[] = ['ingrid', 'root']
const NEGADOS: Actor[] = ['giovanny', 'marcela', 'diego', 'karen', 'paula', 'sofia', 'ramiro', 'tomas', 'cesar']

const COL = 'acciones_mejora'
const BOR = `${COL}/bor_1`      // borrador de Ingrid
const ABI = `${COL}/abi_1`      // 'abierta' sembrada sin reglas (simula F2)
const ANU = `${COL}/anu_1`      // anulada (terminal)

let env: RulesTestEnvironment

// GOTCHA: `ctx.firestore()` se llama UNA vez por contexto — repetirla lanza
// "Firestore has already been started". Se cachea por actor.
const cache = new Map<string, Firestore>()
const db = (a: Actor): Firestore => {
  let f = cache.get(a)
  if (!f) {
    f = env.authenticatedContext(a).firestore() as unknown as Firestore
    cache.set(a, f)
  }
  return f
}
let anon: Firestore | null = null
const dbAnon = (): Firestore => {
  if (!anon) anon = env.unauthenticatedContext().firestore() as unknown as Firestore
  return anon
}

// ── Fábricas ─────────────────────────────────────────────────────────────────
const ahora = () => Timestamp.now()
const haceDias = (n: number) => Timestamp.fromMillis(Date.now() - n * 86_400_000)

const entrada = (por: string, extra: Record<string, unknown> = {}) => ({
  fecha: ahora(), por, por_nombre: por, ...extra,
})

/** Documento válido tal como lo escribe el cliente al crear. */
const accionValida = (creador: string, extra: Record<string, unknown> = {}) => ({
  tipo: 'correctiva',
  fecha_tratamiento: ahora(),
  cliente_proceso: 'Gerencia de Proyectos',
  lider_proceso: 'Director de proyectos',
  numeral_norma: ['ISO 9001:2015 10.2', 'ISO 45001:2018 10.2'],
  descripcion_nc: 'Se entregó el acta al cliente sin la firma del supervisor.',
  observaciones: '',
  fuente: 'auditoria',
  origen_ref: null,
  causa_raiz: { porque_1: 'No se revisó el acta antes de enviarla.', porque_2: '' },
  estado: 'borrador',
  consecutivo: null,
  creado_por: creador,
  creado_por_nombre: creador,
  fecha_creacion: ahora(),
  fecha_actualizacion: ahora(),
  historial: [entrada(creador, { a: 'borrador', nota: 'Creada' })],
  ...extra,
})

/** Payload de anulación válido (el write toca SOLO 4 campos). */
const anulacion = (uid: string, de: string, extra: Record<string, unknown> = {}) => ({
  estado: 'anulada',
  anulacion: { fecha: ahora(), por: uid, por_nombre: uid, motivo: 'Duplicada de otra acción.' },
  fecha_actualizacion: ahora(),
  historial: arrayUnion(entrada(uid, { de, a: 'anulada', nota: 'Anulada: duplicada' })),
  ...extra,
})

/** Payload de edición válido del borrador. */
const edicion = (uid: string, extra: Record<string, unknown> = {}) => ({
  descripcion_nc: 'Descripción corregida tras la reunión de análisis.',
  causa_raiz: { porque_1: 'a', porque_2: 'b', porque_3: 'c' },
  fecha_actualizacion: ahora(),
  historial: arrayUnion(entrada(uid, { de: 'borrador', a: 'borrador', nota: 'Edición' })),
  ...extra,
})

// Historial sembrado (valores FIJOS para poder construir prefijos exactos).
let HIST_BOR: Record<string, unknown>[] = []

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
}, 60_000)

afterAll(async () => {
  await env?.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  HIST_BOR = [entrada('ingrid', { a: 'borrador', nota: 'Creada' })]
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore()
    for (const [uid, rol] of Object.entries(ROLES)) {
      await setDoc(doc(d, 'users', uid), { nombre: uid, rol, estado: 'activo' })
    }
    await setDoc(doc(d, BOR), accionValida('ingrid', { historial: HIST_BOR }))
    // 'abierta' tal como la dejaría F2: consecutivo asignado server-side y un
    // campo que el hasOnly de F1 no conoce (la anulación no debe re-validar
    // la forma del doc completo).
    await setDoc(doc(d, ABI), accionValida('ingrid', {
      estado: 'abierta',
      consecutivo: 'ACAP-2026-001',
      fecha_emision: ahora(),
      historial: [
        entrada('ingrid', { a: 'borrador' }),
        entrada('ingrid', { de: 'borrador', a: 'abierta', nota: 'Emitida (F2)' }),
      ],
    }))
    await setDoc(doc(d, ANU), accionValida('ingrid', {
      estado: 'anulada',
      anulacion: { fecha: ahora(), por: 'ingrid', motivo: 'Registrada por error' },
      historial: [
        entrada('ingrid', { a: 'borrador' }),
        entrada('ingrid', { de: 'borrador', a: 'anulada' }),
      ],
    }))
  })
}, 60_000)

// ════════════════════════ (A) CONTROLES POSITIVOS ════════════════════════
describe('(A) controles positivos — gestion_integral y admin SÍ pueden', () => {
  for (const a of GESTORES) {
    it(`${a}: lee un doc (get)`, async () => {
      await assertSucceeds(getDoc(doc(db(a), BOR)))
    })
    it(`${a}: lista la colección`, async () => {
      await assertSucceeds(getDocs(collection(db(a), COL)))
    })
    it(`${a}: crea un borrador válido`, async () => {
      await assertSucceeds(setDoc(doc(db(a), COL, `nueva_${a}`), accionValida(a)))
    })
    it(`${a}: edita el borrador (historial +1)`, async () => {
      await assertSucceeds(updateDoc(doc(db(a), BOR), edicion(a)))
    })
    it(`${a}: anula el borrador con motivo`, async () => {
      await assertSucceeds(updateDoc(doc(db(a), BOR), anulacion(a, 'borrador')))
    })
  }

  it('crea con SOLO los campos obligatorios mínimos (causa_raiz vacía)', async () => {
    await assertSucceeds(setDoc(doc(db('ingrid'), COL, 'minima'), {
      tipo: 'mejora',
      fecha_tratamiento: ahora(),
      descripcion_nc: 'Oportunidad de mejora en el control documental.',
      fuente: 'objetivos_sgi',
      estado: 'borrador',
      creado_por: 'ingrid',
      fecha_creacion: ahora(),
      historial: [{ fecha: ahora(), por: 'ingrid', a: 'borrador' }],
      causa_raiz: {},
    }))
  })

  it('crea con origen_ref string, los 5 porqués y numeral_norma en el BORDE (20 × 100)', async () => {
    await assertSucceeds(setDoc(doc(db('ingrid'), COL, 'borde'), accionValida('ingrid', {
      tipo: 'preventiva',
      fuente: 'rechazo_sst',
      origen_ref: 'formularios/abc123',
      numeral_norma: Array.from({ length: 20 }, (_, i) => String(i).padEnd(100, 'x')),
      causa_raiz: { porque_1: '1', porque_2: '2', porque_3: '3', porque_4: '4', porque_5: 'x'.repeat(2000) },
    })))
  })

  it('crea con numeral_norma VACÍA y con un solo elemento (control de la ida y vuelta)', async () => {
    await assertSucceeds(setDoc(doc(db('ingrid'), COL, 'nn0'), accionValida('ingrid', { numeral_norma: [] })))
    await assertSucceeds(setDoc(doc(db('ingrid'), COL, 'nn1'), accionValida('ingrid', { numeral_norma: ['8.7'] })))
  })

  it('edita SIN tocar el historial (queda igual)', async () => {
    await assertSucceeds(updateDoc(doc(db('ingrid'), BOR), {
      observaciones: 'Nota interna', fecha_actualizacion: ahora(),
    }))
  })

  it('admin anula un borrador creado por gestion_integral', async () => {
    await assertSucceeds(updateDoc(doc(db('root'), BOR), anulacion('root', 'borrador')))
  })

  it('edición con historial reescrito EXPLÍCITO (prefijo intacto + 1) pasa', async () => {
    await assertSucceeds(updateDoc(doc(db('ingrid'), BOR), {
      observaciones: 'x',
      historial: [...HIST_BOR, entrada('ingrid', { nota: 'sin a/de' })],
    }))
  })
})

// ════════════════════════ (B) DENEGADOS POR ROL ════════════════════════
describe('(B) denegados por rol — ningún otro rol del panel toca la matriz', () => {
  for (const a of NEGADOS) {
    it(`${a} (${ROLES[a]}): get 403`, async () => {
      await assertFails(getDoc(doc(db(a), BOR)))
    })
    it(`${a} (${ROLES[a]}): list 403`, async () => {
      await assertFails(getDocs(collection(db(a), COL)))
    })
    it(`${a} (${ROLES[a]}): create 403 (payload válido, creado_por propio)`, async () => {
      await assertFails(setDoc(doc(db(a), COL, `intento_${a}`), accionValida(a)))
    })
    it(`${a} (${ROLES[a]}): update/edición 403`, async () => {
      await assertFails(updateDoc(doc(db(a), BOR), edicion(a)))
    })
    it(`${a} (${ROLES[a]}): anular 403`, async () => {
      await assertFails(updateDoc(doc(db(a), BOR), anulacion(a, 'borrador')))
    })
  }

  it('anónimo: get 403', async () => {
    await assertFails(getDoc(doc(dbAnon(), BOR)))
  })
  it('anónimo: create 403', async () => {
    await assertFails(setDoc(doc(dbAnon(), COL, 'anon'), accionValida('anon')))
  })
})

// ════════════════════════ (C) DELETE ════════════════════════
describe('(C) delete denegado a TODOS, admin incluido', () => {
  for (const a of [...GESTORES, 'giovanny'] as Actor[]) {
    it(`${a}: delete del borrador 403`, async () => {
      await assertFails(deleteDoc(doc(db(a), BOR)))
    })
  }
  it('admin: delete de una ANULADA 403', async () => {
    await assertFails(deleteDoc(doc(db('root'), ANU)))
  })
  it('admin: delete de una ABIERTA 403', async () => {
    await assertFails(deleteDoc(doc(db('root'), ABI)))
  })
  it('anónimo: delete 403', async () => {
    await assertFails(deleteDoc(doc(dbAnon(), BOR)))
  })
})

// ════════════════════════ (D) CREATE INVÁLIDO ════════════════════════
describe('(D) create inválido (actor: gestion_integral — el que SÍ puede crear)', () => {
  const crear = (extra: Record<string, unknown>) =>
    setDoc(doc(db('ingrid'), COL, 'inv'), accionValida('ingrid', extra))

  it('creado_por de otro (suplantación) 403', async () => {
    await assertFails(crear({
      creado_por: 'diego',
      historial: [entrada('ingrid', { a: 'borrador' })],
    }))
  })
  it("nace 'abierta' 403", async () => {
    await assertFails(crear({ estado: 'abierta', historial: [entrada('ingrid', { a: 'abierta' })] }))
  })
  it("nace 'anulada' 403", async () => {
    await assertFails(crear({ estado: 'anulada', historial: [entrada('ingrid', { a: 'anulada' })] }))
  })
  it('consecutivo no nulo 403', async () => {
    await assertFails(crear({ consecutivo: 'ACAP-2026-001' }))
  })
  it('anulacion presente al nacer 403', async () => {
    await assertFails(crear({ anulacion: { fecha: ahora(), por: 'ingrid', motivo: 'x' } }))
  })
  it('historial con 0 entradas 403', async () => {
    await assertFails(crear({ historial: [] }))
  })
  it('historial con 2 entradas 403', async () => {
    await assertFails(crear({
      historial: [entrada('ingrid', { a: 'borrador' }), entrada('ingrid', { a: 'borrador' })],
    }))
  })
  it('entrada inicial firmada por OTRO 403', async () => {
    await assertFails(crear({ historial: [entrada('diego', { a: 'borrador' })] }))
  })
  it("entrada inicial con a != 'borrador' 403", async () => {
    await assertFails(crear({ historial: [entrada('ingrid', { a: 'abierta' })] }))
  })
  it('entrada inicial SIN a 403', async () => {
    await assertFails(crear({ historial: [entrada('ingrid')] }))
  })
  it('entrada inicial con de (historia fabricada) 403', async () => {
    await assertFails(crear({ historial: [entrada('ingrid', { de: 'abierta', a: 'borrador' })] }))
  })
  it('entrada inicial con campo extra 403', async () => {
    await assertFails(crear({ historial: [entrada('ingrid', { a: 'borrador', rol: 'admin' })] }))
  })
  it('entrada inicial retro-fechada (10 días) 403', async () => {
    await assertFails(crear({ historial: [{ fecha: haceDias(10), por: 'ingrid', a: 'borrador' }] }))
  })
  it('tipo inválido 403', async () => {
    await assertFails(crear({ tipo: 'reactiva' }))
  })
  it('fuente inválida 403', async () => {
    await assertFails(crear({ fuente: 'whatsapp' }))
  })
  it('campo extra 403', async () => {
    await assertFails(crear({ prioridad: 'alta' }))
  })
  it('descripcion_nc vacía 403', async () => {
    await assertFails(crear({ descripcion_nc: '' }))
  })
  it('descripcion_nc solo espacios 403', async () => {
    await assertFails(crear({ descripcion_nc: '    ' }))
  })
  it('descripcion_nc > 4000 403', async () => {
    await assertFails(crear({ descripcion_nc: 'x'.repeat(4001) }))
  })
  it('sin descripcion_nc (obligatorio) 403', async () => {
    await assertFails(setDoc(doc(db('ingrid'), COL, 'inv'), (() => {
      const d: Record<string, unknown> = accionValida('ingrid'); delete d.descripcion_nc; return d
    })()))
  })
  it('sin causa_raiz (obligatorio) 403', async () => {
    await assertFails(setDoc(doc(db('ingrid'), COL, 'inv'), (() => {
      const d: Record<string, unknown> = accionValida('ingrid'); delete d.causa_raiz; return d
    })()))
  })
  it('causa_raiz con porque_6 403', async () => {
    await assertFails(crear({ causa_raiz: { porque_1: 'a', porque_6: 'b' } }))
  })
  it('causa_raiz con porqué > 2000 403', async () => {
    await assertFails(crear({ causa_raiz: { porque_2: 'x'.repeat(2001) } }))
  })
  it('causa_raiz con porqué no-string 403', async () => {
    await assertFails(crear({ causa_raiz: { porque_1: 42 } }))
  })
  it('fecha_tratamiento no-timestamp 403', async () => {
    await assertFails(crear({ fecha_tratamiento: '2026-10-14' }))
  })
  it('fecha_creacion retro-fechada (10 días) 403', async () => {
    await assertFails(crear({ fecha_creacion: haceDias(10) }))
  })
  it('numeral_norma con 21 elementos 403', async () => {
    await assertFails(crear({ numeral_norma: Array.from({ length: 21 }, (_, i) => `n${i}`) }))
  })
  it('numeral_norma con un elemento de 101 caracteres 403', async () => {
    await assertFails(crear({ numeral_norma: ['ok', 'x'.repeat(101)] }))
  })
  it("numeral_norma: elemento de 121 chars con '|' (intento de burlar la regex) 403", async () => {
    await assertFails(crear({ numeral_norma: ['a'.repeat(60) + '|' + 'b'.repeat(60)] }))
  })
  it('numeral_norma con un elemento no-string (número — join lo convertiría) 403', async () => {
    await assertFails(crear({ numeral_norma: ['10.2', 102] }))
  })
  it('numeral_norma con un elemento booleano 403', async () => {
    await assertFails(crear({ numeral_norma: [true] }))
  })
  it('numeral_norma con un elemento map 403', async () => {
    await assertFails(crear({ numeral_norma: [{ n: '10.2' }] }))
  })
  it("numeral_norma: elemento corto con '|' 403", async () => {
    await assertFails(crear({ numeral_norma: ['10.2|8.7'] }))
  })
  it('numeral_norma con un elemento vacío (al inicio) 403', async () => {
    await assertFails(crear({ numeral_norma: ['', '10.2'] }))
  })
  it('numeral_norma con un elemento vacío (al final) 403', async () => {
    await assertFails(crear({ numeral_norma: ['10.2', ''] }))
  })
  it('numeral_norma no-lista (string) 403', async () => {
    await assertFails(crear({ numeral_norma: '10.2' }))
  })
  it('cliente_proceso > 300 403', async () => {
    await assertFails(crear({ cliente_proceso: 'x'.repeat(301) }))
  })
  it('origen_ref no-string (número) 403', async () => {
    await assertFails(crear({ origen_ref: 123 }))
  })
})

// ════════════════════════ (E) UPDATE INVÁLIDO ════════════════════════
describe('(E) update inválido (actor: gestion_integral — el que SÍ puede editar)', () => {
  const upd = (data: Record<string, unknown>, ref = BOR) => updateDoc(doc(db('ingrid'), ref), data)

  it('cambiar creado_por 403', async () => {
    await assertFails(upd(edicion('ingrid', { creado_por: 'diego' })))
  })
  it('cambiar creado_por_nombre 403', async () => {
    await assertFails(upd(edicion('ingrid', { creado_por_nombre: 'Otro' })))
  })
  it('borrar creado_por_nombre (deleteField) 403', async () => {
    await assertFails(upd(edicion('ingrid', { creado_por_nombre: deleteField() })))
  })
  it('cambiar fecha_creacion 403', async () => {
    await assertFails(upd(edicion('ingrid', { fecha_creacion: ahora() })))
  })
  it('setear consecutivo 403', async () => {
    await assertFails(upd(edicion('ingrid', { consecutivo: 'ACAP-2026-007' })))
  })
  it("borrador → 'abierta' 403 (emitir es F2)", async () => {
    await assertFails(upd({
      estado: 'abierta', fecha_actualizacion: ahora(),
      historial: arrayUnion(entrada('ingrid', { de: 'borrador', a: 'abierta' })),
    }))
  })
  it("borrador → 'abierta' CON consecutivo 403", async () => {
    await assertFails(upd({
      estado: 'abierta', consecutivo: 'ACAP-2026-001', fecha_actualizacion: ahora(),
      historial: arrayUnion(entrada('ingrid', { de: 'borrador', a: 'abierta' })),
    }))
  })
  it("estado a un valor raro ('cerrada') 403", async () => {
    await assertFails(upd({
      estado: 'cerrada',
      historial: arrayUnion(entrada('ingrid', { de: 'borrador', a: 'cerrada' })),
    }))
  })
  it("→ 'anulada' sin bloque anulacion 403", async () => {
    await assertFails(upd({
      estado: 'anulada',
      historial: arrayUnion(entrada('ingrid', { de: 'borrador', a: 'anulada' })),
    }))
  })
  it('edición que introduce anulacion sin cambiar estado 403', async () => {
    await assertFails(upd(edicion('ingrid', {
      anulacion: { fecha: ahora(), por: 'ingrid', motivo: 'x' },
    })))
  })
  it('editar una ANULADA 403', async () => {
    await assertFails(upd({
      descripcion_nc: 'reescrita',
      historial: arrayUnion(entrada('ingrid', { de: 'anulada', a: 'anulada' })),
    }, ANU))
  })
  it('editar una ANULADA sin tocar historial 403', async () => {
    await assertFails(upd({ observaciones: 'x' }, ANU))
  })
  it('des-anular (anulada → borrador) 403', async () => {
    await assertFails(upd({
      estado: 'borrador', anulacion: deleteField(),
      historial: arrayUnion(entrada('ingrid', { de: 'anulada', a: 'borrador' })),
    }, ANU))
  })
  it('re-anular una anulada 403', async () => {
    await assertFails(upd(anulacion('ingrid', 'anulada'), ANU))
  })
  it('editar campos descriptivos EN el write de anulación 403', async () => {
    await assertFails(upd(anulacion('ingrid', 'borrador', { descripcion_nc: 'cambiada al anular' })))
  })
  it('truncar el historial (vaciarlo) 403', async () => {
    await assertFails(upd({ observaciones: 'x', historial: [] }))
  })
  it('reemplazar la entrada del historial (mismo tamaño) 403', async () => {
    await assertFails(upd({ observaciones: 'x', historial: [entrada('ingrid', { a: 'borrador', nota: 'otra' })] }))
  })
  it('reemplazar el prefijo y agregar una (tamaño +1, prefijo alterado) 403', async () => {
    await assertFails(upd({
      observaciones: 'x',
      historial: [entrada('ingrid', { a: 'borrador', nota: 'otra' }), entrada('ingrid')],
    }))
  })
  it('agregar 2 entradas de una vez 403', async () => {
    await assertFails(upd({
      observaciones: 'x',
      historial: [...HIST_BOR, entrada('ingrid'), entrada('ingrid')],
    }))
  })
  it('entrada nueva con `por` ajeno 403', async () => {
    await assertFails(upd(edicion('ingrid', {
      historial: arrayUnion(entrada('diego', { de: 'borrador', a: 'borrador' })),
    })))
  })
  it("entrada nueva que miente sobre el estado resultante (a: 'anulada' en una edición) 403", async () => {
    await assertFails(upd(edicion('ingrid', {
      historial: arrayUnion(entrada('ingrid', { de: 'borrador', a: 'anulada' })),
    })))
  })
  it("entrada nueva que miente sobre el estado previo (de: 'abierta') 403", async () => {
    await assertFails(upd(edicion('ingrid', {
      historial: arrayUnion(entrada('ingrid', { de: 'abierta', a: 'borrador' })),
    })))
  })
  it('entrada nueva con nota > 2500 403', async () => {
    await assertFails(upd(edicion('ingrid', {
      historial: arrayUnion(entrada('ingrid', { nota: 'x'.repeat(2501) })),
    })))
  })
  it('edición con tipo inválido 403', async () => {
    await assertFails(upd(edicion('ingrid', { tipo: 'reactiva' })))
  })
  it('edición con fuente inválida 403', async () => {
    await assertFails(upd(edicion('ingrid', { fuente: 'chisme' })))
  })
  it('edición con descripcion_nc vacía 403', async () => {
    await assertFails(upd(edicion('ingrid', { descripcion_nc: '  ' })))
  })
  it('edición con campo extra 403', async () => {
    await assertFails(upd(edicion('ingrid', { prioridad: 'alta' })))
  })
  it('edición que borra causa_raiz (obligatorio) 403', async () => {
    await assertFails(upd(edicion('ingrid', { causa_raiz: deleteField() })))
  })
  it('anulación con motivo vacío 403', async () => {
    await assertFails(upd(anulacion('ingrid', 'borrador', {
      anulacion: { fecha: ahora(), por: 'ingrid', motivo: '' },
    })))
  })
  it('anulación con motivo solo espacios 403', async () => {
    await assertFails(upd(anulacion('ingrid', 'borrador', {
      anulacion: { fecha: ahora(), por: 'ingrid', motivo: '   ' },
    })))
  })
  it('anulación sin motivo 403', async () => {
    await assertFails(upd(anulacion('ingrid', 'borrador', {
      anulacion: { fecha: ahora(), por: 'ingrid' },
    })))
  })
  it('anulación con `por` ajeno (atribuida a otro) 403', async () => {
    await assertFails(upd(anulacion('ingrid', 'borrador', {
      anulacion: { fecha: ahora(), por: 'giovanny', motivo: 'x' },
    })))
  })
  it('anulación retro-fechada (10 días) 403', async () => {
    await assertFails(upd(anulacion('ingrid', 'borrador', {
      anulacion: { fecha: haceDias(10), por: 'ingrid', motivo: 'x' },
    })))
  })
  it('anulación SIN entrada de historial 403', async () => {
    const p: Record<string, unknown> = anulacion('ingrid', 'borrador'); delete p.historial
    await assertFails(upd(p))
  })
  it('anulación cuya entrada no declara `a` 403', async () => {
    await assertFails(upd(anulacion('ingrid', 'borrador', {
      historial: arrayUnion(entrada('ingrid', { de: 'borrador', nota: 'sin a' })),
    })))
  })
})

// ════════════════════════ (F) ABIERTA (simula F2) ════════════════════════
describe("(F) una 'abierta' sembrada (F2) se anula pero NO se edita", () => {
  for (const a of GESTORES) {
    it(`${a}: anula la abierta con motivo 200`, async () => {
      await assertSucceeds(updateDoc(doc(db(a), ABI), anulacion(a, 'abierta')))
    })
  }
  it('gestion_integral: editar descripcion_nc de la abierta 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), ABI), {
      descripcion_nc: 'reescrita tras emitir',
      historial: arrayUnion(entrada('ingrid', { de: 'abierta', a: 'abierta' })),
    }))
  })
  it('gestion_integral: editar causa_raiz de la abierta (sin historial) 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), ABI), { causa_raiz: { porque_1: 'otra' } }))
  })
  it('gestion_integral: regresar la abierta a borrador 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), ABI), {
      estado: 'borrador',
      historial: arrayUnion(entrada('ingrid', { de: 'abierta', a: 'borrador' })),
    }))
  })
  it('gestion_integral: tocar el consecutivo de la abierta 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), ABI), { consecutivo: 'ACAP-2026-999' }))
  })
  it('gestion_integral: anular la abierta mintiendo `de` (borrador) 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), ABI), anulacion('ingrid', 'borrador')))
  })
  it('gerencia_general: anular la abierta 403', async () => {
    await assertFails(updateDoc(doc(db('giovanny'), ABI), anulacion('giovanny', 'abierta')))
  })
})
