// @vitest-environment node
//
// REGLAS del bloque maestro de sitios + corrección de clasificación (07-nov).
//
// La 4ª aparición del hallazgo "la regla más ancha que la pantalla": Paula
// (auxiliar_proyectos) podía escribir el snapshot del proyecto a nivel de
// reglas aunque ninguna pantalla se lo ofreciera. Esta batería fija:
//  - ENDURECIMIENTO: la vía operativa de gestores ya NO toca snapshot ni
//    valor_venta_inicial (y la regresión: todo lo demás les sigue pasando).
//  - Vía de CORRECCIÓN (GG/GA/admin) con las precondiciones del acto de los
//    once EN REGLA: sin factura/pago/liquidación/giro/aprobación.
//  - Solicitudes: GA corrige SOLO `preventivo` (+traza) en tipo preventivo.
//  - Maestro `sitios_preventivos`: alta por quien captura, cambio solo
//    GG/GA/admin, sin delete.
//
// Se corre con:
//   npx firebase emulators:exec --project demo-neg --only firestore \
//     "npx vitest run --config vitest.emulator.config.ts --no-file-parallelism src/hooks/sigp/__tests__/correccionPreventivoFirestoreRules.test.ts"

import { readFileSync } from 'node:fs'
import { describe, it, beforeAll, afterAll } from 'vitest'
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc, deleteDoc, getDoc, Timestamp } from 'firebase/firestore'

let env: RulesTestEnvironment
const cache: Record<string, ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>> = {}
const db = (u: string) => (cache[u] ??= env.authenticatedContext(u).firestore())
const ts = Timestamp.fromDate(new Date('2026-11-07T12:00:00Z'))

const snapshotBase = (venta: number) => ({
  cliente: 'VERTIS TORRES', asunto: 'Mantenimiento preventivo pesado — SIMITI (Greenfield · Z2)',
  nombre_sitio: 'SIMITI', codigo_sitio_cliente: 'COBOL7049',
  valor_venta: venta, esquema_tributario: 'iva_pleno',
  alcance: [{ grupo: 'MP — SIMITI', items: 1, subtotal: venta }],
  items_alcance: [{ clave: 'prev:1', descripcion: 'MP — SIMITI', unidad: 'glb', cantidad: 1, valor_total: venta, grupo: 'MP — SIMITI' }],
  total_items: 1,
})

const proyectoPreventivo = (over: Record<string, unknown> = {}) => ({
  consecutivo: 'PRY-2026-080', origen: 'preventivo', estado: 'permisos_en_tramite',
  snapshot: snapshotBase(1_280_269), valor_venta_inicial: 1_280_269,
  resumen_asignaciones: {
    total: 1, por_estado: { preliquidacion_definida: 1 }, anticipos_girados: 0,
    items: [], cobertura_completa: true, atomos_sin_asignar: 0, valor_sin_costear: 0,
    alcance_desactualizado: 0, costo_presupuestado: 614_147, costo_contratistas: 614_147,
    costo_ejecutado_manual: 0, revisar_cobertura: 0, directas_por_estimar: 0,
    contratistas_evaluables: 1, contratistas_evaluados: 0, saldos_pendientes: 0,
  },
  historial: [], creado_por: 'sistema', fecha_creacion: ts,
  ...over,
})

/** El patch que produce planCorreccionPreventivo (venta jungle). */
const patchCorreccion = () => ({
  valor_venta_inicial: 2_680_336,
  snapshot: { ...snapshotBase(2_680_336), asunto: 'Mantenimiento preventivo pesado — SIMITI (Greenfield · jungle · Z2)' },
  historial: [{ de: 'permisos_en_tramite', a: 'permisos_en_tramite', por: 'x', fecha: ts, motivo: 'corrección' }],
  fecha_actualizacion: ts,
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-neg',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
  await env.withSecurityRulesDisabled(async ctx => {
    const f = ctx.firestore()
    for (const [uid, rol] of [
      ['adm', 'admin'], ['gg', 'gerencia_general'], ['ga', 'gerencia_administrativa'],
      ['aux', 'auxiliar_proyectos'], ['dir', 'director_proyectos'],
      ['com', 'operacion_comercial'], ['sst1', 'sst'],
    ]) await setDoc(doc(f, `users/${uid}`), { rol, estado: 'activo' })

    await setDoc(doc(f, 'proyectos/p1'), proyectoPreventivo())
    await setDoc(doc(f, 'proyectos/p1/asignaciones/a1'), {
      contratista_id: 'c1', contratista_nombre: 'David Bernal', estado: 'preliquidacion_definida',
      atomos: ['prev:1'], atomos_nivel: 'item', modalidad: 'todo_costo', compras_reembolsos: [],
      historial: [], fecha: ts, fecha_creacion: ts,
      preliquidacion: { valor_alcance: 1_280_269, valor_contratista: 614_147, anticipo_pct: 65, definida_por: 'aux', fecha_definicion: ts },
    })
    await setDoc(doc(f, 'solicitudes/p1'), {
      consecutivo: 'SOL-2026-110', tipo: 'preventivo', estado: 'aceptada',
      descripcion: 'MP SIMITI', historial: [], fecha_creacion: ts,
      preventivo: { sitio_id: 'COBOL7049', sitio_nombre: 'SIMITI', tipo_sitio: 'greenfield', intensidad: 'pesado', es_jungle: false, departamento: 'Bolívar', zona: 'Z2', es_sai: false },
    })
    await setDoc(doc(f, 'solicitudes/sc'), {
      consecutivo: 'SOL-2026-001', estado: 'en_estudio', descripcion: 'comercial', historial: [], fecha_creacion: ts,
    })
    // p2: con anticipo girado (resumen) — la precondición dura
    await setDoc(doc(f, 'proyectos/p2'), proyectoPreventivo({
      consecutivo: 'PRY-2026-081',
      resumen_asignaciones: { ...proyectoPreventivo().resumen_asignaciones, por_estado: { anticipo_girado: 1 }, anticipos_girados: 1 },
    }))
    // p3: con factura registrada
    await setDoc(doc(f, 'proyectos/p3'), proyectoPreventivo({
      consecutivo: 'PRY-2026-082', estado: 'facturado',
      facturacion: { numero: 'FV-1830', fecha: ts, valor: 1_280_269, registrado_por: 'ga', fecha_registro: ts },
    }))
    // p4: origen cotización (la vía de corrección no aplica)
    await setDoc(doc(f, 'proyectos/p4'), proyectoPreventivo({ consecutivo: 'PRY-2026-083', origen: 'cotizacion' }))
    // p5/p6: docs FRESCOS para los casos negativos — si comparten doc con un
    // positivo previo, el snapshot ya corregido sale del diff y la escritura
    // pasa por otra vía legítima (falso verde del caso, no hueco de regla).
    await setDoc(doc(f, 'proyectos/p5'), proyectoPreventivo({ consecutivo: 'PRY-2026-084' }))
    await setDoc(doc(f, 'proyectos/p6'), proyectoPreventivo({ consecutivo: 'PRY-2026-085' }))
    // maestro sembrado para update/delete
    await setDoc(doc(f, 'sitios_preventivos/COBOL7049'), {
      codigo: 'COBOL7049', nombre: 'SIMITI', departamento: 'Bolívar', zona: 'Z2',
      clasificacion: { tipo_sitio: 'greenfield', intensidad: 'pesado', es_jungle: false },
      establecida_por: 'siembra', origen: 'siembra', historial: [], fecha_creacion: ts,
    })
  })
}, 60000)
afterAll(async () => { await env?.cleanup() })

describe('proyectos — vía de corrección (GG/GA/admin) y endurecimiento', () => {
  it('GA corrige un preventivo limpio → 200 (hoy era 403: su hasOnly no traía snapshot)', async () => {
    await assertSucceeds(updateDoc(doc(db('ga'), 'proyectos/p1'), patchCorreccion()))
  })
  it('GG corrige → 200 (por la vía nueva — la operativa ya no le presta el snapshot)', async () => {
    await assertSucceeds(updateDoc(doc(db('gg'), 'proyectos/p1'), patchCorreccion()))
  })
  it('⛔ ENDURECIMIENTO: auxiliar (quien captura) tocando snapshot → 403 — la 4ª "regla más ancha que la pantalla" cerrada', async () => {
    await assertFails(updateDoc(doc(db('aux'), 'proyectos/p5'), patchCorreccion()))
  })
  it('⛔ director tocando valor_venta_inicial a secas → 403', async () => {
    await assertFails(updateDoc(doc(db('dir'), 'proyectos/p5'), { valor_venta_inicial: 999 }))
  })
  it('REGRESIÓN del endurecimiento: la vía operativa sin snapshot sigue viva (permisos + historial)', async () => {
    await assertSucceeds(updateDoc(doc(db('aux'), 'proyectos/p1'), {
      permisos: { estado: 'aprobado', fecha_resolucion: ts, entidad: 'Alcaldía' },
      historial: [{ de: 'permisos_en_tramite', a: 'permisos_en_tramite', por: 'aux', fecha: ts, motivo: 'permiso aprobado' }],
      fecha_actualizacion: ts,
    }))
  })
  it('⛔ GA con ANTICIPO GIRADO en el resumen → 403 (dinero encima: no es corregir)', async () => {
    await assertFails(updateDoc(doc(db('ga'), 'proyectos/p2'), patchCorreccion()))
  })
  it('⛔ GA con FACTURA registrada → 403', async () => {
    await assertFails(updateDoc(doc(db('ga'), 'proyectos/p3'), patchCorreccion()))
  })
  it('⛔ GA sobre origen COTIZACIÓN → 403 (el precio no sale de la matriz)', async () => {
    await assertFails(updateDoc(doc(db('ga'), 'proyectos/p4'), patchCorreccion()))
  })
  it('⛔ GA colando un campo extra (estado) junto al snapshot → 403 (hasOnly)', async () => {
    await assertFails(updateDoc(doc(db('ga'), 'proyectos/p6'), { ...patchCorreccion(), estado: 'en_ejecucion' }))
  })
})

describe('asignaciones — la vía de gerencia existente cubre el valor_alcance', () => {
  it('GA actualiza preliquidacion.valor_alcance + historial (contratista intacto) → 200', async () => {
    const vivo = (await getDoc(doc(db('ga'), 'proyectos/p1/asignaciones/a1'))).data()!
    await assertSucceeds(updateDoc(doc(db('ga'), 'proyectos/p1/asignaciones/a1'), {
      preliquidacion: { ...vivo.preliquidacion, valor_alcance: 2_680_336 },
      historial: [...vivo.historial, { de: 'preliquidacion_definida', a: 'preliquidacion_definida', por: 'ga', fecha: ts, motivo: 'corrección' }],
      fecha_actualizacion: ts,
    }))
  })
})

describe('solicitudes — GA corrige SOLO el dato del preventivo', () => {
  const patchSol = () => ({
    preventivo: { sitio_id: 'COBOL7049', sitio_nombre: 'SIMITI', tipo_sitio: 'greenfield', intensidad: 'pesado', es_jungle: true, departamento: 'Bolívar', zona: 'Z2', es_sai: false },
    historial: [{ de: 'aceptada', a: 'aceptada', por: 'ga', fecha: ts, motivo: 'corrección' }],
    fecha_actualizacion: ts,
  })
  it('GA en solicitud preventiva (preventivo + historial) → 200', async () => {
    await assertSucceeds(updateDoc(doc(db('ga'), 'solicitudes/p1'), patchSol()))
  })
  it('⛔ GA en solicitud COMERCIAL → 403; ⛔ GA tocando la descripción → 403', async () => {
    await assertFails(updateDoc(doc(db('ga'), 'solicitudes/sc'), patchSol()))
    await assertFails(updateDoc(doc(db('ga'), 'solicitudes/p1'), { ...patchSol(), descripcion: 'otra' }))
  })
})

describe('sitios_preventivos — alta por captura, cambio solo gerencia, sin delete', () => {
  const sitio = (codigo: string) => ({
    codigo, nombre: 'PESCA', departamento: 'Boyacá', zona: 'Z1',
    clasificacion: { tipo_sitio: 'greenfield', intensidad: 'pesado', es_jungle: true },
    establecida_por: 'aux', origen: 'solicitud', historial: [], fecha_creacion: ts,
  })
  it('auxiliar (quien registra) CREA un sitio nuevo → 200; comercial también; GA también', async () => {
    await assertSucceeds(setDoc(doc(db('aux'), 'sitios_preventivos/COBOY7035'), sitio('COBOY7035')))
    await assertSucceeds(setDoc(doc(db('com'), 'sitios_preventivos/COBOY7036'), sitio('COBOY7036')))
    await assertSucceeds(setDoc(doc(db('ga'), 'sitios_preventivos/COBOY7037'), sitio('COBOY7037')))
  })
  it('⛔ sst no crea; lectura para accesoSIGP → 200 y para sst → 403', async () => {
    await assertFails(setDoc(doc(db('sst1'), 'sitios_preventivos/COBOY7038'), sitio('COBOY7038')))
    await assertSucceeds(getDoc(doc(db('aux'), 'sitios_preventivos/COBOL7049')))
    await assertFails(getDoc(doc(db('sst1'), 'sitios_preventivos/COBOL7049')))
  })
  it('cambiar la clasificación: GA/GG → 200; ⛔ auxiliar → 403 (quien captura no reescribe el hecho)', async () => {
    const cambio = { clasificacion: { tipo_sitio: 'greenfield', intensidad: 'pesado', es_jungle: true }, fecha_actualizacion: ts }
    await assertSucceeds(updateDoc(doc(db('ga'), 'sitios_preventivos/COBOL7049'), cambio))
    await assertSucceeds(updateDoc(doc(db('gg'), 'sitios_preventivos/COBOL7049'), cambio))
    await assertFails(updateDoc(doc(db('aux'), 'sitios_preventivos/COBOL7049'), cambio))
  })
  it('⛔ delete: ni admin — el maestro no se borra', async () => {
    await assertFails(deleteDoc(doc(db('adm'), 'sitios_preventivos/COBOL7049')))
  })
})
