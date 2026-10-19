// @vitest-environment node
//
// Tareas de AC/AP (Fase 2) contra las REGLAS REALES de firestore.rules.
// No hay cambios de reglas en esta fase: este archivo fija que la forma que
// produce construirTareaAcap (campo `fase`, contexto `ac_ap`) PASA las reglas
// existentes y que la consulta de vuelta del módulo (contexto.tipo +
// contexto.id) es legal. Un actor de mínimo privilegio por vía.
//
// NOTA: en SERIE con las otras baterías de reglas (--no-file-parallelism):
//   npx firebase emulators:exec --project demo-neg --only firestore \
//     "npx vitest run --config vitest.emulator.config.ts --no-file-parallelism --hookTimeout=60000 --testTimeout=60000 src/hooks/sigp/__tests__/tareasAcapFirestoreRules.test.ts"

import { readFileSync } from 'node:fs'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { addDoc, collection, doc, getDocs, query, setDoc, updateDoc, where, Timestamp } from 'firebase/firestore'
import { construirTareaAcap, patchIniciarTarea, type Tarea } from '../../../types/sigp/tarea'

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
    await setDoc(doc(f, 'users/gi'), { rol: 'gestion_integral', estado: 'activo' })     // asigna a otros
    await setDoc(doc(f, 'users/paula'), { rol: 'auxiliar_proyectos', estado: 'activo' }) // asignada (no asigna a otros)
    await setDoc(doc(f, 'users/com'), { rol: 'operacion_comercial', estado: 'activo' })  // personal de panel, sin vía
    await setDoc(doc(f, 'users/tec'), { rol: 'tecnico', estado: 'activo' })              // fuera del panel
  })
}, 60000)
afterAll(async () => { await env?.cleanup() })

const FECHA = Timestamp.fromDate(new Date(2026, 10, 30, 12))
const tareaAcap = (creador = 'gi', extra: Partial<{ fase: 'P' | 'H' | 'V' | 'A'; responsable: string; acapId: string }> = {}): Tarea =>
  construirTareaAcap({
    titulo: 'Capacitar al equipo en el procedimiento',
    responsable: { uid: extra.responsable ?? 'paula', nombre: 'Paula' },
    fechaLimite: FECHA,
    acapId: extra.acapId ?? 'acap-1',
    consecutivo: 'AC-2026-001',
    fase: extra.fase ?? 'H',
  }, { uid: creador, nombre: 'Ingrid' }, Timestamp.now())!

describe('crear: la tarea que arma el builder pasa las reglas', () => {
  it('GI (asigna a otros) crea una tarea ac_ap para Paula', async () => {
    await assertSucceeds(addDoc(collection(db('gi'), 'tareas'), tareaAcap()))
  })

  it('un rol SIN vía de asignación (auxiliar) NO puede crearla para otro…', async () => {
    await assertFails(addDoc(collection(db('paula'), 'tareas'), tareaAcap('paula', { responsable: 'com' })))
  })

  it('…pero sí una propia (auto-tarea) — control positivo del actor', async () => {
    await assertSucceeds(addDoc(collection(db('paula'), 'tareas'), tareaAcap('paula', { responsable: 'paula' })))
  })

  it('no se puede suplantar al creador (creada_por != auth.uid)', async () => {
    await assertFails(addDoc(collection(db('gi'), 'tareas'), { ...tareaAcap('gi'), creada_por: 'otro' }))
  })
})

describe('leer de vuelta: where contexto.tipo == ac_ap && contexto.id == X', () => {
  beforeAll(async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      const f = ctx.firestore()
      await setDoc(doc(f, 'tareas/lectura-1'), tareaAcap('gi', { acapId: 'acap-lectura', fase: 'P' }))
      await setDoc(doc(f, 'tareas/lectura-2'), tareaAcap('gi', { acapId: 'acap-lectura', fase: 'A' }))
      await setDoc(doc(f, 'tareas/otra'), tareaAcap('gi', { acapId: 'acap-otra' }))
    })
  })
  const consulta = (u: string) => getDocs(query(collection(db(u), 'tareas'),
    where('contexto.tipo', '==', 'ac_ap'), where('contexto.id', '==', 'acap-lectura')))

  it('GI lee las tareas de ESA acción (y solo esas)', async () => {
    const snap = await assertSucceeds(consulta('gi'))
    expect(snap.docs.map(d => d.data().fase).sort()).toEqual(['A', 'P'])
  })

  it('cualquier personal del panel puede listar (no hace falta ser asignado ni asignador)', async () => {
    await assertSucceeds(consulta('com'))
  })

  it('fuera del panel (técnico) no lee', async () => {
    await assertFails(consulta('tec'))
  })
})

describe('actualizar: el campo `fase`', () => {
  const sembrar = async (id: string) => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), `tareas/${id}`), tareaAcap('gi'))
    })
  }

  it('la asignada (Paula) arranca su tarea: el patch del builder pasa (incluye `activa`)', async () => {
    await sembrar('upd-1')
    const t = tareaAcap('gi')
    const patch = patchIniciarTarea(t, { uid: 'paula', nombre: 'Paula' }, Timestamp.now())!
    await assertSucceeds(updateDoc(doc(db('paula'), 'tareas/upd-1'), patch as Record<string, unknown>))
  })

  it('la asignada NO puede cambiarle la fase (su vía es hasOnly de 7 campos)', async () => {
    await sembrar('upd-2')
    await assertFails(updateDoc(doc(db('paula'), 'tareas/upd-2'), { fase: 'A', fecha_actualizacion: Timestamp.now() }))
  })

  it('GI (la asignadora) SÍ puede corregir la fase', async () => {
    await sembrar('upd-3')
    await assertSucceeds(updateDoc(doc(db('gi'), 'tareas/upd-3'), { fase: 'V', fecha_actualizacion: Timestamp.now() }))
  })

  it('un tercero del panel sin vía (comercial) no puede tocarla', async () => {
    await sembrar('upd-4')
    await assertFails(updateDoc(doc(db('com'), 'tareas/upd-4'), { fase: 'A' }))
  })
})
