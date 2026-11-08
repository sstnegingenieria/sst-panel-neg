// @vitest-environment node
//
// REGLAS de la facturación PARCIAL (07-nov): GA escribe la lista + Σ desde
// en_ejecucion; los gestores NO tocan facturas (denylist de la vía operativa
// — la lección "regla más ancha que la pantalla" aplicada ANTES de la 5ª
// aparición); el CIERRE exige facturación completa (total_facturado ≥ valor)
// en los proyectos de la era de la lista, y la era del singular queda intacta.
//
// Se corre con:
//   npx firebase emulators:exec --project demo-neg --only firestore \
//     "npx vitest run --config vitest.emulator.config.ts --no-file-parallelism src/hooks/sigp/__tests__/facturacionParcialFirestoreRules.test.ts"

import { readFileSync } from 'node:fs'
import { describe, it, beforeAll, afterAll } from 'vitest'
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc, Timestamp } from 'firebase/firestore'

let env: RulesTestEnvironment
const cache: Record<string, ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>> = {}
const db = (u: string) => (cache[u] ??= env.authenticatedContext(u).firestore())
const ts = Timestamp.fromDate(new Date('2026-11-07T12:00:00Z'))
const VENTA = 72_944_351

const factura = (numero: string, valor: number) =>
  ({ numero, fecha: ts, valor, registrado_por: 'ga', fecha_registro: ts })
const proyecto = (estado: string, over: Record<string, unknown> = {}) => ({
  consecutivo: 'PRY-2026-058', origen: 'cotizacion', estado,
  snapshot: { cliente: 'Gobierno_SENA', asunto: 'SENA Intercentros', valor_venta: VENTA, esquema_tributario: 'aiu', alcance: [], total_items: 0 },
  historial: [], creado_por: 'sistema', fecha_creacion: ts, ...over,
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-neg',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
  await env.withSecurityRulesDisabled(async ctx => {
    const f = ctx.firestore()
    for (const [uid, rol] of [['ga', 'gerencia_administrativa'], ['aux', 'auxiliar_proyectos'], ['adm', 'admin']])
      await setDoc(doc(f, `users/${uid}`), { rol, estado: 'activo' })
    await setDoc(doc(f, 'proyectos/pEj'), proyecto('en_ejecucion'))
    await setDoc(doc(f, 'proyectos/pEnv'), proyecto('enviado_a_facturacion', { facturas: [factura('FE-1', 50_000_000)], total_facturado: 50_000_000 }))
    await setDoc(doc(f, 'proyectos/pAux'), proyecto('en_ejecucion'))
    // cierre: liquidado + pago + saldos 0, con lista PARCIAL vs COMPLETA vs legacy
    const cerrable = {
      estado: 'liquidado_contratista', pago_cliente: { fecha: ts, valor: VENTA, medio: 'transferencia', registrado_por: 'ga', fecha_registro: ts },
      resumen_asignaciones: { total: 1, por_estado: { liquidada: 1 }, saldos_pendientes: 0, anticipos_girados: 1 },
    }
    await setDoc(doc(f, 'proyectos/pCieParcial'), proyecto('liquidado_contratista', { ...cerrable, facturas: [factura('FE-1', 10)], total_facturado: 10 }))
    await setDoc(doc(f, 'proyectos/pCieCompleta'), proyecto('liquidado_contratista', { ...cerrable, facturas: [factura('FE-1', VENTA)], total_facturado: VENTA }))
    await setDoc(doc(f, 'proyectos/pCieLegacy'), proyecto('liquidado_contratista', { ...cerrable, facturacion: factura('FV-1813', VENTA) }))
  })
}, 60000)
afterAll(async () => { await env?.cleanup() })

const patchParcial = (facturas: unknown[], total: number, estado?: string) => ({
  facturas, total_facturado: total,
  ...(estado ? { estado } : {}),
  historial: [{ de: 'en_ejecucion', a: estado ?? 'en_ejecucion', por: 'ga', fecha: ts, motivo: 'factura parcial' }],
  fecha_actualizacion: ts,
})
const cierre = () => ({
  estado: 'cerrado', cierre: { fecha: ts, cerrado_por: 'ga' },
  historial: [{ de: 'liquidado_contratista', a: 'cerrado', por: 'ga', fecha: ts, motivo: 'cierre' }],
  fecha_actualizacion: ts,
})

describe('registro parcial — GA desde en_ejecucion, gestores JAMÁS', () => {
  it('GA registra una parcial en EN_EJECUCION (sin mover estado) → 200', async () => {
    await assertSucceeds(updateDoc(doc(db('ga'), 'proyectos/pEj'), patchParcial([factura('FE-100', 20_000_000)], 20_000_000)))
  })
  it('GA completa la Σ en enviado_a_facturacion → estado facturado → 200', async () => {
    await assertSucceeds(updateDoc(doc(db('ga'), 'proyectos/pEnv'),
      patchParcial([factura('FE-1', 50_000_000), factura('FE-2', VENTA - 50_000_000)], VENTA, 'facturado')))
  })
  it('⛔ auxiliar (gestor) escribiendo facturas → 403 — la regla no es más ancha que la pantalla', async () => {
    await assertFails(updateDoc(doc(db('aux'), 'proyectos/pAux'), patchParcial([factura('FE-X', 1)], 1)))
  })
})

describe('cierre — exige facturación COMPLETA en la era de la lista', () => {
  it('⛔ GA cierra con facturación PARCIAL → 403', async () => {
    await assertFails(updateDoc(doc(db('ga'), 'proyectos/pCieParcial'), cierre()))
  })
  it('GA cierra con facturación COMPLETA → 200', async () => {
    await assertSucceeds(updateDoc(doc(db('ga'), 'proyectos/pCieCompleta'), cierre()))
  })
  it('legacy (singular, sin total_facturado) cierra como siempre → 200', async () => {
    await assertSucceeds(updateDoc(doc(db('ga'), 'proyectos/pCieLegacy'), cierre()))
  })
})
