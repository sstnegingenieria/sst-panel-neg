// @vitest-environment node
//
// CONTRATO CLIENTE ⟷ REGLAS del módulo Acciones de Mejora / NC (AC/AP, F1).
//
// La batería accionesMejoraFirestoreRules.test.ts fabrica a mano los documentos
// que la regla debe aceptar o rechazar. Esta prueba cierra el otro lado: los
// documentos que produce el CÓDIGO REAL del cliente — los builders de
// types/sigp/accionMejora.ts, los mismos que usa la UI vía useAccionesMejora —
// PASAN las reglas. Si alguien cambia un builder (o la regla) y se desalinean,
// la UI empieza a fallar en producción con un "permiso denegado" que ninguna
// de las dos baterías aisladas vería.
//
// NOTA: correrlo EN SERIE con la batería de reglas (--no-file-parallelism): esa
// batería hace clearFirestore() y, en paralelo, borra los usuarios que este archivo
// siembra (falso PERMISSION_DENIED — verificado).
//
// Se corre con:
//   npx firebase emulators:exec --project demo-neg --only firestore \
//     "npx vitest run --config vitest.emulator.config.ts --no-file-parallelism --hookTimeout=60000 --testTimeout=60000 src/hooks/sigp/__tests__/accionesMejoraContratoCliente.test.ts"

import { readFileSync } from 'node:fs'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { addDoc, collection, doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore'
import {
  FORM_ACCION_VACIO, construirAlta, patchAnular, patchEditar,
  type AccionFormData, type AccionMejora,
} from '../../../types/sigp/accionMejora'

let env: RulesTestEnvironment
const cache: Record<string, ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>> = {}
const db = (u: string) => (cache[u] ??= env.authenticatedContext(u).firestore())

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-neg',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
  await env.withSecurityRulesDisabled(async ctx => {
    const f = ctx.firestore()
    await setDoc(doc(f, 'users/gi'), { rol: 'gestion_integral', estado: 'activo' })
    await setDoc(doc(f, 'users/sst1'), { rol: 'sst', estado: 'activo' })
  })
}, 60000)
afterAll(async () => { await env?.cleanup() })

const form = (extra: Partial<AccionFormData> = {}): AccionFormData => ({
  ...FORM_ACCION_VACIO,
  tipo: 'correctiva', fecha: '2026-10-14', fuente: 'auditoria',
  descripcion_nc: 'Se entregó el informe sin la revisión del líder.',
  ...extra,
})

const COMPLETO = form({
  cliente_proceso: 'Claro · Mantenimiento', lider_proceso: 'Pedro',
  observaciones: 'Detectado en la auditoría interna.',
  numeral_texto: '9001:2015 10.2, 14001:2015 10.2 | 45001:2018 10.2',
  porques: ['uno', 'dos', 'tres', 'cuatro', 'cinco'],
})

describe('los documentos de los builders reales PASAN las reglas', () => {
  it('alta con nombre del actor y todos los campos (incl. numeral con "|" y los 5 por qués)', async () => {
    const alta = construirAlta(COMPLETO, { uid: 'gi', nombre: 'Ingrid' }, Timestamp.now())!
    expect(alta.numeral_norma.every(n => !n.includes('|'))).toBe(true)
    await assertSucceeds(addDoc(collection(db('gi'), 'acciones_mejora'), alta))
  })

  it('alta con el MÍNIMO obligatorio y sin nombre de actor (campos opcionales ausentes)', async () => {
    const alta = construirAlta(form(), { uid: 'gi' }, Timestamp.now())!
    expect(alta).not.toHaveProperty('creado_por_nombre')
    await assertSucceeds(addDoc(collection(db('gi'), 'acciones_mejora'), alta))
  })

  it('ciclo completo: crear → editar el borrador → anular, cada paso con su builder', async () => {
    const actor = { uid: 'gi', nombre: 'Ingrid' }
    const ref = await addDoc(collection(db('gi'), 'acciones_mejora'), construirAlta(form(), actor, Timestamp.now())!).catch(e => { throw new Error('PASO CREAR: ' + e.message) })

    const antes = { id: ref.id, ...((await getDoc(ref)).data() as AccionMejora) }
    const edit = patchEditar(antes, COMPLETO, actor, Timestamp.now())!
    await assertSucceeds(updateDoc(ref, edit as Record<string, unknown>).catch(e => { throw new Error('PASO EDITAR: ' + e.message) }))

    const mid = { id: ref.id, ...((await getDoc(ref)).data() as AccionMejora) }
    expect(mid.historial).toHaveLength(2)
    expect(mid.causa_raiz.porque_5).toBe('cinco')

    const anul = patchAnular(mid, 'Duplicada de otra acción', actor, Timestamp.now())!
    await assertSucceeds(updateDoc(ref, anul as Record<string, unknown>).catch(e => { throw new Error('PASO ANULAR: ' + e.message) }))

    const fin = { id: ref.id, ...((await getDoc(ref)).data() as AccionMejora) }
    expect(fin.estado).toBe('anulada')
    expect(fin.historial).toHaveLength(3)
    // El cliente ya no ofrece editar/anular una anulada…
    expect(patchEditar(fin, form(), actor, Timestamp.now())).toBeNull()
    expect(patchAnular(fin, 'otra vez', actor, Timestamp.now())).toBeNull()
    // …y si alguien lo fuerza por API, la regla lo frena igual (terminal).
    await assertFails(updateDoc(ref, { descripcion_nc: 'forzado', fecha_actualizacion: Timestamp.now() }))
  })

  it('un rol que NO gestiona (sst) no puede crear con el mismo documento válido', async () => {
    const alta = construirAlta(form(), { uid: 'sst1', nombre: 'SST' }, Timestamp.now())!
    await assertFails(addDoc(collection(db('sst1'), 'acciones_mejora'), alta))
  })
})
