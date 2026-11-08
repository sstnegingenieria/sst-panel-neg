// @vitest-environment node
//
// REGLAS del corte de avance de obra (07-nov): el AVANCE lo escriben los
// GESTORES (vía operativa — quien mide); el CORTE lo crea SOLO GERENCIA
// (quien factura sobre él) y es INMUTABLE (documento emitido con hash).
// La segregación captura/emisión queda EN REGLA, no solo en UI.
//
// Se corre con:
//   npx firebase emulators:exec --project demo-neg --only firestore \
//     "npx vitest run --config vitest.emulator.config.ts --no-file-parallelism src/hooks/sigp/__tests__/corteObraFirestoreRules.test.ts"

import { readFileSync } from 'node:fs'
import { describe, it, beforeAll, afterAll } from 'vitest'
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore'

let env: RulesTestEnvironment
const cache: Record<string, ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>> = {}
const db = (u: string) => (cache[u] ??= env.authenticatedContext(u).firestore())
const ts = Timestamp.fromDate(new Date('2026-11-07T12:00:00Z'))

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-neg',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
  await env.withSecurityRulesDisabled(async ctx => {
    const f = ctx.firestore()
    for (const [uid, rol] of [['ga', 'gerencia_administrativa'], ['aux', 'auxiliar_proyectos'], ['adm', 'admin']])
      await setDoc(doc(f, `users/${uid}`), { rol, estado: 'activo' })
    await setDoc(doc(f, 'proyectos/p58'), {
      consecutivo: 'PRY-2026-058', origen: 'cotizacion', estado: 'en_ejecucion',
      snapshot: { cliente: 'SENA', asunto: 'x', valor_venta: 1000, esquema_tributario: 'aiu', alcance: [], total_items: 0, items_alcance: [{ clave: 'i1', descripcion: 'd', unidad: 'm2', cantidad: 10, valor_total: 1000, grupo: 'G' }] },
      historial: [], creado_por: 'sistema', fecha_creacion: ts,
    })
    await setDoc(doc(f, 'proyectos/p58/cortes/c1'), {
      consecutivo: 'CRT-2026-001', numero_corte: 1, proyecto_id: 'p58', proyecto_consecutivo: 'PRY-2026-058',
      cliente: 'SENA', fecha_emision: ts, emitido_por: 'ga', cotizacion_version_medida: 3,
      items: [], cd_contratado: 1000, cd_acum_anterior: 0, cd_acum: 400, pct_global: 40,
      resumen: { esquema: 'aiu', delta_cd: 400, admin: 40, imprevistos: 0, utilidad: 20, base_iva: 20, iva: 4, total: 464 },
      fecha_creacion: ts,
    })
  })
}, 60000)
afterAll(async () => { await env?.cleanup() })

const corteNuevo = (emitidoPor: string) => ({
  consecutivo: 'CRT-2026-002', numero_corte: 2, proyecto_id: 'p58', proyecto_consecutivo: 'PRY-2026-058',
  cliente: 'SENA', fecha_emision: ts, emitido_por: emitidoPor, cotizacion_version_medida: 3,
  items: [], cd_contratado: 1000, cd_acum_anterior: 400, cd_acum: 800, pct_global: 80,
  resumen: { esquema: 'aiu', delta_cd: 400, admin: 40, imprevistos: 0, utilidad: 20, base_iva: 20, iva: 4, total: 464 },
  fecha_creacion: ts,
})

describe('cortes — crea solo gerencia, inmutables; avance de gestores', () => {
  it('gestor (aux) escribe avance_items en el padre → 200 (quien mide)', async () => {
    await assertSucceeds(updateDoc(doc(db('aux'), 'proyectos/p58'), {
      avance_items: [{ clave: 'i1', cantidad: 4, registros: [{ fecha: ts, por: 'aux', cantidad: 4 }] }],
      fecha_actualizacion: ts,
    }))
  })
  it('⛔ GA escribiendo avance_items → 403 (quien emite no mide)', async () => {
    await assertFails(updateDoc(doc(db('ga'), 'proyectos/p58'), {
      avance_items: [{ clave: 'i1', cantidad: 9, registros: [] }], fecha_actualizacion: ts,
    }))
  })
  it('GA crea el corte → 200; ⛔ gestor crea corte → 403 (quien mide no emite)', async () => {
    await assertSucceeds(setDoc(doc(db('ga'), 'proyectos/p58/cortes/c2'), corteNuevo('ga')))
    await assertFails(setDoc(doc(db('aux'), 'proyectos/p58/cortes/c3'), corteNuevo('aux')))
  })
  it('⛔ suplantación: GA firmando emitido_por de otro → 403; sin consecutivo → 403; total 0 → 403', async () => {
    await assertFails(setDoc(doc(db('ga'), 'proyectos/p58/cortes/c4'), { ...corteNuevo('otro') }))
    await assertFails(setDoc(doc(db('ga'), 'proyectos/p58/cortes/c5'), { ...corteNuevo('ga'), consecutivo: '' }))
    await assertFails(setDoc(doc(db('ga'), 'proyectos/p58/cortes/c6'), { ...corteNuevo('ga'), resumen: { ...corteNuevo('ga').resumen, total: 0 } }))
  })
  it('⛔ INMUTABLE: ni GA ni admin editan o borran un corte emitido', async () => {
    await assertFails(updateDoc(doc(db('ga'), 'proyectos/p58/cortes/c1'), { observaciones: 'editar un hecho' }))
    await assertFails(deleteDoc(doc(db('adm'), 'proyectos/p58/cortes/c1')))
  })
})
