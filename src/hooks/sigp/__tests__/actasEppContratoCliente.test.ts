// @vitest-environment node
//
// CONTRATO CLIENTE ⟷ REGLAS del módulo Actas de entrega de EPP.
//
// La batería actasEppFirestoreRules.test.ts fabrica a mano los documentos que la regla debe
// aceptar o rechazar. Esta prueba cierra el otro lado: los documentos que produce el CÓDIGO REAL
// del cliente — los builders de types/sigp/epp.ts y el hash de utils/sigp/eppFirma.ts, los mismos
// que usa la UI vía useEpp — PASAN las reglas. Si alguien cambia un builder (o la regla) y se
// desalinean, la UI empieza a fallar en producción con un "permiso denegado" que ninguna de las
// dos baterías aisladas vería.
//
// Correrlo EN SERIE con la batería de reglas (--no-file-parallelism): comparten el emulador.
//   npx firebase emulators:exec --project demo-neg --only firestore \
//     "npx vitest run --config vitest.emulator.config.ts --no-file-parallelism --hookTimeout=60000 --testTimeout=60000 src/hooks/sigp/__tests__/actasEppContratoCliente.test.ts"

import { readFileSync } from 'node:fs'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { addDoc, collection, doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore'
import {
  construirAltaActa, construirAltaCatalogo, patchAnularActa, patchEditarActa, patchFirmarActa,
  patchEditarCatalogo, semillaCatalogo, FORM_CATALOGO_VACIO, PREFIJO_FIRMA_PNG,
  type ActaEpp, type ActaFormData,
} from '../../../types/sigp/epp'
import { hashContenidoActa, verificarIntegridadActa } from '../../../utils/sigp/eppFirma'
import { fechaInputDeTimestamp } from '../../../types/sigp/accionMejora'

let env: RulesTestEnvironment
const cache: Record<string, ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>> = {}
const db = (u: string) => (cache[u] ??= env.authenticatedContext(u).firestore())

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-neg',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async ctx => {
    const f = ctx.firestore()
    await setDoc(doc(f, 'users/gi'), { rol: 'gestion_integral', estado: 'activo' })
    await setDoc(doc(f, 'users/sst1'), { rol: 'sst', estado: 'activo' })
  })
}, 60000)
afterAll(async () => { await env?.cleanup() })

const FIRMA = PREFIJO_FIRMA_PNG + 'iVBORw0KGgoAAAANSUhEUgAA'.repeat(40)

const form = (extra: Partial<ActaFormData> = {}): ActaFormData => ({
  colaborador: { fuente: 'contratista', ref_id: '1098765432', nombre: 'Ana Gómez', cedula: '1098765432', cargo: 'Auxiliar', contratista_nombre: 'Servicios SAS' },
  items: [
    { nombre: 'Casco blanco dieléctrico', especificacion: 'Humanpack Acrux tipo II', cantidad: 1, unidad: '1' },
    { nombre: 'Guantes G40', especificacion: 'poliuretano', cantidad: 2, unidad: '1 par' },
  ],
  fecha: fechaInputDeTimestamp(Timestamp.now()),   // la regla acota la fecha de entrega: siempre hoy
  firmantes_empresa: [{ nombre: 'Pedro Rodríguez', cargo: 'Director general' }, { nombre: 'Ingrid Laverde', cargo: 'Dir. GH/HSEQ' }],
  ...extra,
})

const actor = { uid: 'gi', nombre: 'Ingrid' }

describe('los documentos de los builders reales PASAN las reglas', () => {
  it('ciclo completo: crear → editar → firmar (hash real) → verificar integridad → anular la firmada', async () => {
    const ref = await addDoc(collection(db('gi'), 'actas_epp'),
      construirAltaActa(form(), 'v1', actor, Timestamp.now())!).catch(e => { throw new Error('PASO CREAR: ' + e.message) })

    const leer = async () => ({ id: ref.id, ...((await getDoc(ref)).data() as ActaEpp) })

    const a0 = await leer()
    const ed = patchEditarActa(a0, form({ items: [{ nombre: 'Casco', especificacion: 'tipo II', cantidad: 2, unidad: '1' }] }), actor, Timestamp.now())!
    await assertSucceeds(updateDoc(ref, ed as Record<string, unknown>).catch(e => { throw new Error('PASO EDITAR: ' + e.message) }))

    const a1 = await leer()
    expect(a1.items).toHaveLength(1)
    const hash = await hashContenidoActa(a1, FIRMA)
    const fir = patchFirmarActa(a1, FIRMA, hash, actor, Timestamp.now())!
    await assertSucceeds(updateDoc(ref, fir as Record<string, unknown>).catch(e => { throw new Error('PASO FIRMAR: ' + e.message) }))

    const a2 = await leer()
    expect(a2.estado).toBe('firmada')
    expect(a2.firmado).toBe(true)
    expect(a2.historial).toHaveLength(3)
    expect(await verificarIntegridadActa(a2)).toBe(true)

    // Firmada: el cliente ya no ofrece editar ni firmar…
    expect(patchEditarActa(a2, form(), actor, Timestamp.now())).toBeNull()
    expect(patchFirmarActa(a2, FIRMA, hash, actor, Timestamp.now())).toBeNull()
    // …y si alguien lo fuerza por API, la regla lo frena igual.
    await assertFails(updateDoc(ref, { items: [], fecha_actualizacion: Timestamp.now() }))
    await assertFails(updateDoc(ref, { firma_colaborador: FIRMA + 'A', fecha_actualizacion: Timestamp.now() }))

    // Anular la FIRMADA con el builder real: marca + motivo, contenido y firma intactos.
    const anul = patchAnularActa(a2, 'Entrega registrada a la persona equivocada', actor, Timestamp.now())!
    await assertSucceeds(updateDoc(ref, anul as Record<string, unknown>).catch(e => { throw new Error('PASO ANULAR: ' + e.message) }))
    const fin = await leer()
    expect(fin.estado).toBe('anulada')
    expect(fin.firma_colaborador).toBe(FIRMA)
    expect(fin.firma_hash).toBe(hash)
    expect(await verificarIntegridadActa(fin)).toBe(true)         // lo firmado sigue siendo íntegro
    expect(fin.historial).toHaveLength(4)
  })

  it('un borrador se anula con el builder real', async () => {
    const ref = await addDoc(collection(db('gi'), 'actas_epp'), construirAltaActa(form(), 'v1', actor, Timestamp.now())!)
    const a = { id: ref.id, ...((await getDoc(ref)).data() as ActaEpp) }
    await assertSucceeds(updateDoc(ref, patchAnularActa(a, 'Duplicada', actor, Timestamp.now())! as Record<string, unknown>))
  })

  it('un rol sin permiso (sst) no puede crear con el mismo documento válido', async () => {
    const alta = construirAltaActa(form(), 'v1', { uid: 'sst1', nombre: 'SST' }, Timestamp.now())!
    await assertFails(addDoc(collection(db('sst1'), 'actas_epp'), alta))
  })

  it('la SEMILLA del catálogo (9 elementos) pasa las reglas; editar y desactivar con los builders también', async () => {
    for (const { id, data } of semillaCatalogo('gi', Timestamp.now())) {
      await assertSucceeds(setDoc(doc(db('gi'), 'catalogo_epp', id), data).catch(e => { throw new Error('SEMILLA ' + id + ': ' + e.message) }))
    }
    const alta = construirAltaCatalogo({ ...FORM_CATALOGO_VACIO, nombre: 'Arnés', especificacion: 'cuerpo completo', cantidad_default: '1' }, 'gi', Timestamp.now())!
    const ref = await addDoc(collection(db('gi'), 'catalogo_epp'), alta)
    await assertSucceeds(updateDoc(ref, patchEditarCatalogo({ ...FORM_CATALOGO_VACIO, nombre: 'Arnés dieléctrico', unidad: '1' }, 'gi', Timestamp.now())!))
    // sst lee el catálogo pero no lo escribe.
    await assertSucceeds(getDoc(doc(db('sst1'), 'catalogo_epp', 'casco-blanco-dielectrico')))
    await assertFails(addDoc(collection(db('sst1'), 'catalogo_epp'), construirAltaCatalogo({ ...FORM_CATALOGO_VACIO, nombre: 'X' }, 'sst1', Timestamp.now())!))
  })
})
