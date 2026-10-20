// @vitest-environment node
//
// Batería de las reglas de Firestore del MÓDULO ACTAS DE ENTREGA DE EPP (SST-FT-AEP-18):
//   - match /catalogo_epp/{itemId}   (read personal del panel; write GI/admin; sin delete)
//   - match /actas_epp/{actaId}      (read/create/update GI/admin; firmada INMUTABLE; sin delete)
//
// PRINCIPIO (lección de método del SB2.2): cada vía de DENEGACIÓN se prueba con el actor de
// MÍNIMO PRIVILEGIO que casi puede — un rol real del panel, autenticado, con `users/{uid}`
// sembrado — no con un anónimo. Y cada bloque lleva CONTROLES POSITIVOS (gestion_integral y
// admin SÍ pueden) para que un falso 403 por un payload mal armado no pase por verde. Los
// inválidos se fabrican mutando UN campo del payload válido.
//
// NO forma parte del `npm test` por defecto. Se corre con:
//   npx firebase emulators:exec --project demo-neg --only firestore \
//     "npx vitest run --config vitest.emulator.config.ts --hookTimeout=60000 --testTimeout=60000 --no-file-parallelism src/hooks/sigp/__tests__/actasEppFirestoreRules.test.ts"

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, writeBatch,
  arrayUnion, deleteField, Timestamp, type Firestore,
} from 'firebase/firestore'

const ROLES = {
  ingrid: 'gestion_integral',          // dueña del módulo (control positivo)
  root: 'admin',                       // respaldo (control positivo)
  giovanny: 'gerencia_general',        // casi puede — NO
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
// Roles del panel (esPersonalPanel): leen el catálogo aunque no lo editen.
const PANEL_NO_GESTOR: Actor[] = ['giovanny', 'marcela', 'diego', 'karen', 'paula', 'sofia', 'ramiro']

const ACTAS = 'actas_epp'
const CAT = 'catalogo_epp'
const BOR = `${ACTAS}/bor_1`
const FIR = `${ACTAS}/fir_1`
const ANU = `${ACTAS}/anu_1`
const ITEM = `${CAT}/casco`

let env: RulesTestEnvironment
const cache = new Map<string, Firestore>()
const db = (a: Actor): Firestore => {
  let f = cache.get(a)
  if (!f) { f = env.authenticatedContext(a).firestore() as unknown as Firestore; cache.set(a, f) }
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
const entrada = (por: string, extra: Record<string, unknown> = {}) => ({ fecha: ahora(), por, por_nombre: por, ...extra })

// PNG de verdad: cabecera de archivo (iVBORw0KGgo) + cuerpo base64 de longitud múltiplo de 4.
const FIRMA = 'data:image/png;base64,iVBORw0KGgo' + 'A'.repeat(301)
const FIRMA_B = 'data:image/png;base64,iVBORw0KGgo' + 'B'.repeat(301)
const HASH = 'a'.repeat(64)

const colaborador = (extra: Record<string, unknown> = {}) => ({
  fuente: 'directo', ref_id: 'emp_1', nombre: 'Juan Pérez', cedula: '1012345678', cargo: 'Técnico', ...extra,
})
const item = (extra: Record<string, unknown> = {}) => ({
  nombre: 'Casco blanco dieléctrico', especificacion: 'Humanpack Acrux tipo II', cantidad: 1, unidad: '1', ...extra,
})

/** Acta válida tal como la escribe el cliente al crear (borrador). */
const actaValida = (creador: string, extra: Record<string, unknown> = {}) => ({
  colaborador: colaborador(),
  items: [item(), item({ nombre: 'Guantes G40', unidad: '1 par' })],
  firmantes_empresa: [{ nombre: 'Pedro Rodríguez', cargo: 'Director general' }],
  fecha: ahora(),
  clausulas_version: 'v1',
  estado: 'borrador',
  firmado: false,
  entregado_por: creador,
  entregado_por_nombre: creador,
  creado_por: creador,
  creado_por_nombre: creador,
  fecha_creacion: ahora(),
  historial: [entrada(creador, { a: 'borrador', nota: 'Acta creada (borrador)' })],
  ...extra,
})

const actaFirmada = (creador: string) => actaValida(creador, {
  estado: 'firmada', firmado: true, firma_colaborador: FIRMA, firma_hash: HASH, fecha_firma: ahora(),
  historial: [
    entrada(creador, { a: 'borrador' }),
    entrada(creador, { de: 'borrador', a: 'firmada', nota: 'Firmada' }),
  ],
})

const catalogoValido = (uid: string, extra: Record<string, unknown> = {}) => ({
  nombre: 'Casco blanco dieléctrico', especificacion: 'Humanpack Acrux tipo II', unidad: '1',
  cantidad_default: 1, activo: true, creado_por: uid, fecha_creacion: ahora(),
  actualizado_por: uid, fecha_actualizacion: ahora(), ...extra,
})

const edicion = (uid: string, extra: Record<string, unknown> = {}) => ({
  items: [item({ cantidad: 2 })],
  fecha_actualizacion: ahora(),
  historial: arrayUnion(entrada(uid, { de: 'borrador', a: 'borrador', nota: 'Acta editada' })),
  ...extra,
})

const firmar = (uid: string, extra: Record<string, unknown> = {}) => ({
  estado: 'firmada', firmado: true, firma_colaborador: FIRMA, firma_hash: HASH,
  fecha_firma: ahora(), fecha_actualizacion: ahora(),
  historial: arrayUnion(entrada(uid, { de: 'borrador', a: 'firmada', nota: 'Firmada' })),
  ...extra,
})

const anulacion = (uid: string, de: string, extra: Record<string, unknown> = {}) => ({
  estado: 'anulada',
  anulacion: { fecha: ahora(), por: uid, por_nombre: uid, motivo: 'Entrega registrada por error.' },
  fecha_actualizacion: ahora(),
  historial: arrayUnion(entrada(uid, { de, a: 'anulada', nota: 'Anulada' })),
  ...extra,
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-neg',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../../../firestore.rules'), 'utf8'),
      host: '127.0.0.1', port: 8080,
    },
  })
}, 60_000)
afterAll(async () => { await env?.cleanup() })

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore()
    for (const [uid, rol] of Object.entries(ROLES)) {
      await setDoc(doc(d, 'users', uid), { nombre: uid, rol, estado: 'activo' })
    }
    await setDoc(doc(d, BOR), actaValida('ingrid'))
    await setDoc(doc(d, FIR), actaFirmada('ingrid'))
    await setDoc(doc(d, ANU), actaValida('ingrid', {
      estado: 'anulada',
      anulacion: { fecha: ahora(), por: 'ingrid', motivo: 'Por error' },
      historial: [entrada('ingrid', { a: 'borrador' }), entrada('ingrid', { de: 'borrador', a: 'anulada' })],
    }))
    await setDoc(doc(d, ITEM), catalogoValido('ingrid'))
  })
}, 60_000)

// ════════════════════════ (A) CONTROLES POSITIVOS ════════════════════════
describe('(A) controles positivos — gestion_integral y admin SÍ pueden', () => {
  for (const a of GESTORES) {
    it(`${a}: lee y lista las actas`, async () => {
      await assertSucceeds(getDoc(doc(db(a), BOR)))
      await assertSucceeds(getDocs(collection(db(a), ACTAS)))
    })
    it(`${a}: crea un borrador válido`, async () => {
      await assertSucceeds(setDoc(doc(db(a), ACTAS, `nueva_${a}`), actaValida(a)))
    })
    it(`${a}: edita el borrador`, async () => {
      await assertSucceeds(updateDoc(doc(db(a), BOR), edicion(a)))
    })
    it(`${a}: firma el borrador`, async () => {
      await assertSucceeds(updateDoc(doc(db(a), BOR), firmar(a)))
    })
    it(`${a}: anula un borrador con motivo`, async () => {
      await assertSucceeds(updateDoc(doc(db(a), BOR), anulacion(a, 'borrador')))
    })
    it(`${a}: anula una FIRMADA con motivo (el contenido queda)`, async () => {
      await assertSucceeds(updateDoc(doc(db(a), FIR), anulacion(a, 'firmada')))
    })
    it(`${a}: crea y edita un elemento del catálogo`, async () => {
      await assertSucceeds(setDoc(doc(db(a), CAT, `nuevo_${a}`), catalogoValido(a)))
      await assertSucceeds(updateDoc(doc(db(a), ITEM), {
        especificacion: 'Otra', actualizado_por: a, fecha_actualizacion: ahora(),
      }))
    })
  }
  it('una acta de contratista con contratista_nombre pasa', async () => {
    await assertSucceeds(setDoc(doc(db('ingrid'), ACTAS, 'contr'), actaValida('ingrid', {
      colaborador: colaborador({ fuente: 'contratista', ref_id: '1098765432', contratista_nombre: 'Servicios SAS' }),
    })))
  })
  it('un acta con 30 elementos (tope) pasa', async () => {
    await assertSucceeds(setDoc(doc(db('ingrid'), ACTAS, 'treinta'), actaValida('ingrid', {
      items: Array.from({ length: 30 }, (_, i) => item({ nombre: `EPP ${i}` })),
    })))
  })
})

// ════════════════════════ (B) ROLES SIN PERMISO ════════════════════════
describe('(B) roles sin permiso — cada uno es un rol real del panel, autenticado', () => {
  for (const a of NEGADOS) {
    it(`${a} (${ROLES[a]}): leer, listar, crear, editar, firmar y anular actas → 403`, async () => {
      await assertFails(getDoc(doc(db(a), BOR)))
      await assertFails(getDocs(collection(db(a), ACTAS)))
      await assertFails(setDoc(doc(db(a), ACTAS, `x_${a}`), actaValida(a)))
      await assertFails(updateDoc(doc(db(a), BOR), edicion(a)))
      await assertFails(updateDoc(doc(db(a), BOR), firmar(a)))
      await assertFails(updateDoc(doc(db(a), BOR), anulacion(a, 'borrador')))
    })
    it(`${a}: escribir el catálogo → 403`, async () => {
      await assertFails(setDoc(doc(db(a), CAT, `x_${a}`), catalogoValido(a)))
      await assertFails(updateDoc(doc(db(a), ITEM), { especificacion: 'x', actualizado_por: a, fecha_actualizacion: ahora() }))
    })
  }
  for (const a of PANEL_NO_GESTOR) {
    it(`${a}: SÍ lee el catálogo (personal del panel), aunque no lo edite`, async () => {
      await assertSucceeds(getDoc(doc(db(a), ITEM)))
    })
  }
  it('tomas (tecnico): no lee el catálogo — no es personal del panel', async () => {
    await assertFails(getDoc(doc(db('tomas'), ITEM)))
  })
  it('anónimo: nada, ni actas ni catálogo', async () => {
    await assertFails(getDoc(doc(dbAnon(), BOR)))
    await assertFails(getDoc(doc(dbAnon(), ITEM)))
    await assertFails(setDoc(doc(dbAnon(), ACTAS, 'a'), actaValida('ingrid')))
    await assertFails(updateDoc(doc(dbAnon(), BOR), firmar('ingrid')))
  })
})

// ════════════════════════ (C) CREATE ════════════════════════
describe('(C) create — nace borrador, del creador real, sin firma', () => {
  const crear = (extra: Record<string, unknown>) => setDoc(doc(db('ingrid'), ACTAS, 'c1'), actaValida('ingrid', extra))
  it('creado_por de otro 403', async () => { await assertFails(crear({ creado_por: 'root' })) })
  it('entregado_por de otro 403', async () => { await assertFails(crear({ entregado_por: 'root' })) })
  it('estado firmada 403', async () => { await assertFails(crear({ estado: 'firmada' })) })
  it('estado anulada 403', async () => { await assertFails(crear({ estado: 'anulada' })) })
  it('firmado true en un borrador 403', async () => { await assertFails(crear({ firmado: true })) })
  it('nace con firma + hash + fecha_firma (firmada de golpe) 403', async () => {
    await assertFails(crear({ estado: 'firmada', firmado: true, firma_colaborador: FIRMA, firma_hash: HASH, fecha_firma: ahora() }))
  })
  it('borrador con una firma suelta (sin firmado) 403', async () => { await assertFails(crear({ firma_colaborador: FIRMA })) })
  it('nace con anulación 403', async () => {
    await assertFails(crear({ anulacion: { fecha: ahora(), por: 'ingrid', motivo: 'x' } }))
  })
  it('sin elementos 403', async () => { await assertFails(crear({ items: [] })) })
  it('31 elementos 403', async () => {
    await assertFails(crear({ items: Array.from({ length: 31 }, (_, i) => item({ nombre: `EPP ${i}` })) }))
  })
  it('sin firmantes de la empresa 403', async () => { await assertFails(crear({ firmantes_empresa: [] })) })
  it('colaborador sin cédula 403', async () => { await assertFails(crear({ colaborador: colaborador({ cedula: '' }) })) })
  it('colaborador sin nombre (solo espacios) 403', async () => { await assertFails(crear({ colaborador: colaborador({ nombre: '   ' }) })) })
  it('colaborador con fuente inválida 403', async () => { await assertFails(crear({ colaborador: colaborador({ fuente: 'otro' }) })) })
  it('colaborador con una clave extra 403', async () => { await assertFails(crear({ colaborador: colaborador({ eps: 'x' }) })) })
  it('colaborador no es un mapa 403', async () => { await assertFails(crear({ colaborador: 'Juan' })) })
  it('campo nuevo de primer nivel 403', async () => { await assertFails(crear({ observaciones: 'x' })) })
  it('historial con 2 entradas 403', async () => {
    await assertFails(crear({ historial: [entrada('ingrid', { a: 'borrador' }), entrada('ingrid', { a: 'borrador' })] }))
  })
  it('historial con `de` en la 1.ª entrada 403', async () => {
    await assertFails(crear({ historial: [entrada('ingrid', { de: 'borrador', a: 'borrador' })] }))
  })
  it('historial firmado por otro 403', async () => {
    await assertFails(crear({ historial: [entrada('root', { a: 'borrador' })] }))
  })
  it('fecha_creacion retro-fechada 10 días 403', async () => { await assertFails(crear({ fecha_creacion: haceDias(10) })) })
  it('clausulas_version vacía 403', async () => { await assertFails(crear({ clausulas_version: '' })) })
})

// ════════════════════════ (D) EDICIÓN DEL BORRADOR ════════════════════════
describe('(D) edición — solo el borrador, solo el contenido descriptivo', () => {
  const upd = (extra: Record<string, unknown>) => updateDoc(doc(db('ingrid'), BOR), edicion('ingrid', extra))
  it('control: la edición válida pasa', async () => { await assertSucceeds(upd({})) })
  it('editar colaborador, fecha y firmantes pasa', async () => {
    await assertSucceeds(upd({ colaborador: colaborador({ cargo: 'Auxiliar' }), fecha: ahora(), firmantes_empresa: [{ nombre: 'Ingrid Laverde', cargo: 'Dir.' }] }))
  })
  it('vaciar los elementos 403', async () => { await assertFails(upd({ items: [] })) })
  it('tocar estado desde la edición 403', async () => { await assertFails(upd({ estado: 'firmada' })) })
  it('tocar creado_por 403', async () => { await assertFails(upd({ creado_por: 'root' })) })
  it('tocar entregado_por 403', async () => { await assertFails(upd({ entregado_por: 'root' })) })
  it('tocar fecha_creacion 403', async () => { await assertFails(upd({ fecha_creacion: ahora() })) })
  it('colar la firma en una edición 403', async () => { await assertFails(upd({ firma_colaborador: FIRMA })) })
  it('colar firmado:true 403', async () => { await assertFails(upd({ firmado: true })) })
  it('campo nuevo 403', async () => { await assertFails(upd({ observaciones: 'x' })) })
  it('editar sin tocar el historial 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), BOR), { items: [item({ cantidad: 3 })], fecha_actualizacion: ahora() }))
  })
  it('entrada de historial con `de` falso 403', async () => {
    await assertFails(upd({ historial: arrayUnion(entrada('ingrid', { de: 'firmada', a: 'borrador' })) }))
  })
  it('entrada firmada por otro 403', async () => {
    await assertFails(upd({ historial: arrayUnion(entrada('root', { de: 'borrador', a: 'borrador' })) }))
  })
})

// ════════════════════════ (E) FIRMAR ════════════════════════
describe('(E) firmar — borrador → firmada, una sola vez', () => {
  const frm = (extra: Record<string, unknown>) => updateDoc(doc(db('ingrid'), BOR), firmar('ingrid', extra))
  it('control: la firma válida pasa', async () => { await assertSucceeds(frm({})) })
  it('firma que no es PNG (jpeg) 403', async () => { await assertFails(frm({ firma_colaborador: 'data:image/jpeg;base64,iVBORw0KGgo' + 'A'.repeat(301) })) })
  it('firma sin prefijo data URL 403', async () => { await assertFails(frm({ firma_colaborador: 'iVBORw0KGgo' + 'A'.repeat(301) })) })
  it('firma con caracteres fuera de base64 403', async () => { await assertFails(frm({ firma_colaborador: 'data:image/png;base64,iVBORw0KGgo' + '<script>'.repeat(50) })) })
  it('firma por encima del tope (100 000 caracteres) 403', async () => {
    await assertFails(frm({ firma_colaborador: 'data:image/png;base64,iVBORw0KGgo' + 'A'.repeat(100_001) }))
  })
  it('firma en el borde del tope (≤ 100 000) pasa', async () => {
    await assertSucceeds(frm({ firma_colaborador: 'data:image/png;base64,iVBORw0KGgo' + 'A'.repeat(99_889) }))
  })
  it('firma de tamaño trivial (menos de 40 caracteres) 403', async () => { await assertFails(frm({ firma_colaborador: 'data:image/png;base64,AA' })) })
  it('firma que no es string 403', async () => { await assertFails(frm({ firma_colaborador: 12345 })) })
  it('hash en mayúsculas 403', async () => { await assertFails(frm({ firma_hash: 'A'.repeat(64) })) })
  it('hash de 63 caracteres 403', async () => { await assertFails(frm({ firma_hash: 'a'.repeat(63) })) })
  it('hash que no es hexadecimal 403', async () => { await assertFails(frm({ firma_hash: 'z'.repeat(64) })) })
  it('fecha_firma retro-fechada 10 días 403', async () => { await assertFails(frm({ fecha_firma: haceDias(10) })) })
  it('sin hash 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), BOR), {
      estado: 'firmada', firmado: true, firma_colaborador: FIRMA, fecha_firma: ahora(),
      fecha_actualizacion: ahora(), historial: arrayUnion(entrada('ingrid', { de: 'borrador', a: 'firmada' })),
    }))
  })
  it('estado firmada pero firmado:false 403', async () => { await assertFails(frm({ firmado: false })) })
  it('firmado:true pero el estado sigue borrador 403', async () => { await assertFails(frm({ estado: 'borrador' })) })
  it('firmar cambiando los elementos al vuelo 403 (el contenido que respalda la firma no se toca)', async () => {
    await assertFails(frm({ items: [item({ cantidad: 9 })] }))
  })
  it('firmar cambiando el colaborador al vuelo 403', async () => { await assertFails(frm({ colaborador: colaborador({ nombre: 'Otro' }) })) })
  it('firmar sin tocar el historial 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), BOR), {
      estado: 'firmada', firmado: true, firma_colaborador: FIRMA, firma_hash: HASH, fecha_firma: ahora(), fecha_actualizacion: ahora(),
    }))
  })
  it('entrada de historial con `de` falso 403', async () => {
    await assertFails(frm({ historial: arrayUnion(entrada('ingrid', { de: 'firmada', a: 'firmada' })) }))
  })
  it('entrada de historial SIN `de` 403', async () => {
    await assertFails(frm({ historial: arrayUnion(entrada('ingrid', { a: 'firmada' })) }))
  })
  it('entrada de historial con `a` distinto de firmada 403', async () => {
    await assertFails(frm({ historial: arrayUnion(entrada('ingrid', { de: 'borrador', a: 'borrador' })) }))
  })
  it('re-firmar una firmada con otra firma 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), FIR), firmar('ingrid', { firma_hash: 'b'.repeat(64) })))
  })
  it('firmar una anulada 403', async () => { await assertFails(updateDoc(doc(db('ingrid'), ANU), firmar('ingrid'))) })
})

// ════════════════════════ (F) ANULAR ════════════════════════
describe('(F) anular — borrador o firmada, SOLO marca + motivo', () => {
  it('anular con motivo vacío (espacios) 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), BOR), anulacion('ingrid', 'borrador', {
      anulacion: { fecha: ahora(), por: 'ingrid', motivo: '   ' },
    })))
  })
  it('anulación a nombre de otro (por != uid) 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), BOR), anulacion('ingrid', 'borrador', {
      anulacion: { fecha: ahora(), por: 'root', motivo: 'x' },
    })))
  })
  it('anulación retro-fechada 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), BOR), anulacion('ingrid', 'borrador', {
      anulacion: { fecha: haceDias(10), por: 'ingrid', motivo: 'x' },
    })))
  })
  it('anulación sin tocar el historial 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), FIR), {
      estado: 'anulada', anulacion: { fecha: ahora(), por: 'ingrid', motivo: 'x' }, fecha_actualizacion: ahora(),
    }))
  })
  it('anulación que declara `de` falso 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), FIR), anulacion('ingrid', 'borrador')))
  })
  it('anular una firmada cambiando además los elementos 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), FIR), anulacion('ingrid', 'firmada', { items: [item({ cantidad: 9 })] })))
  })
  it('anular una firmada reemplazando la firma 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), FIR), anulacion('ingrid', 'firmada', { firma_colaborador: FIRMA_B })))
  })
  it('anular una firmada BORRANDO la firma (deleteField) 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), FIR), anulacion('ingrid', 'firmada', { firma_colaborador: deleteField() })))
  })
  it('anular una firmada cambiando el hash 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), FIR), anulacion('ingrid', 'firmada', { firma_hash: 'c'.repeat(64) })))
  })
  it('anular poniendo firmado:false 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), FIR), anulacion('ingrid', 'firmada', { firmado: false })))
  })
  it('anular una anulada 403 (terminal)', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), ANU), anulacion('ingrid', 'anulada')))
  })
  it('anulación con una clave extra en el bloque 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), BOR), anulacion('ingrid', 'borrador', {
      anulacion: { fecha: ahora(), por: 'ingrid', motivo: 'x', extra: 1 },
    })))
  })
})

// ════════════════════════ (G) INMUTABILIDAD DE LA FIRMADA Y DE LA ANULADA ════════════════════════
describe('(G) la firmada y la anulada no tienen vía de edición', () => {
  const upd = (path: string, extra: Record<string, unknown>) => updateDoc(doc(db('ingrid'), path), {
    fecha_actualizacion: ahora(),
    historial: arrayUnion(entrada('ingrid', { de: 'firmada', a: 'firmada', nota: 'x' })),
    ...extra,
  })
  it('editar los elementos de la firmada 403', async () => { await assertFails(upd(FIR, { items: [item({ cantidad: 9 })] })) })
  it('editar el colaborador de la firmada 403', async () => { await assertFails(upd(FIR, { colaborador: colaborador({ cedula: '999' }) })) })
  it('editar la fecha de la firmada 403', async () => { await assertFails(upd(FIR, { fecha: ahora() })) })
  it('editar los firmantes de la empresa de la firmada 403', async () => { await assertFails(upd(FIR, { firmantes_empresa: [{ nombre: 'X', cargo: 'Y' }] })) })
  it('reemplazar la firma de la firmada 403', async () => { await assertFails(upd(FIR, { firma_colaborador: FIRMA_B })) })
  it('reemplazar el hash de la firmada 403', async () => { await assertFails(upd(FIR, { firma_hash: 'd'.repeat(64) })) })
  it('quitar firmado de la firmada (deleteField) 403', async () => { await assertFails(upd(FIR, { firmado: deleteField() })) })
  it('regresar la firmada a borrador 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), FIR), {
      estado: 'borrador', firmado: false, firma_colaborador: deleteField(), firma_hash: deleteField(), fecha_firma: deleteField(),
      fecha_actualizacion: ahora(), historial: arrayUnion(entrada('ingrid', { de: 'firmada', a: 'borrador' })),
    }))
  })
  it('tocar creado_por de la firmada 403', async () => { await assertFails(upd(FIR, { creado_por: 'root' })) })
  it('editar la anulada 403', async () => { await assertFails(upd(ANU, { items: [item({ cantidad: 9 })] })) })
  it('reabrir la anulada (estado borrador) 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), ANU), {
      estado: 'borrador', anulacion: deleteField(), fecha_actualizacion: ahora(),
      historial: arrayUnion(entrada('ingrid', { de: 'anulada', a: 'borrador' })),
    }))
  })
  it('las cuatro mutaciones por el admin tampoco pasan (no es cuestión de rol)', async () => {
    await assertFails(updateDoc(doc(db('root'), FIR), {
      items: [item({ cantidad: 9 })], fecha_actualizacion: ahora(),
      historial: arrayUnion(entrada('root', { de: 'firmada', a: 'firmada' })),
    }))
  })
})

// ════════════════════════ (H) DELETE ════════════════════════
describe('(H) sin delete para nadie', () => {
  for (const a of GESTORES) {
    it(`${a}: borrar un borrador, una firmada, una anulada o un elemento del catálogo → 403`, async () => {
      await assertFails(deleteDoc(doc(db(a), BOR)))
      await assertFails(deleteDoc(doc(db(a), FIR)))
      await assertFails(deleteDoc(doc(db(a), ANU)))
      await assertFails(deleteDoc(doc(db(a), ITEM)))
    })
  }
})

// ════════════════════════ (I) CATÁLOGO ════════════════════════
describe('(I) catálogo — forma y auditoría', () => {
  const crear = (extra: Record<string, unknown>) => setDoc(doc(db('ingrid'), CAT, 'n1'), catalogoValido('ingrid', extra))
  it('cantidad_default 0 403', async () => { await assertFails(crear({ cantidad_default: 0 })) })
  it('cantidad_default 100 403', async () => { await assertFails(crear({ cantidad_default: 100 })) })
  it('cantidad_default decimal 403', async () => { await assertFails(crear({ cantidad_default: 1.5 })) })
  it('cantidad_default como texto 403', async () => { await assertFails(crear({ cantidad_default: '1' })) })
  it('nombre vacío 403', async () => { await assertFails(crear({ nombre: '  ' })) })
  it('nombre de 121 caracteres 403', async () => { await assertFails(crear({ nombre: 'x'.repeat(121) })) })
  it('unidad vacía 403', async () => { await assertFails(crear({ unidad: '' })) })
  it('especificación de 501 caracteres 403', async () => { await assertFails(crear({ especificacion: 'x'.repeat(501) })) })
  it('campo extra 403', async () => { await assertFails(crear({ precio: 10 })) })
  it('creado_por de otro 403', async () => { await assertFails(crear({ creado_por: 'root' })) })
  it('activo no booleano 403', async () => { await assertFails(crear({ activo: 'si' })) })
  it('actualizar cambiando creado_por 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), ITEM), { creado_por: 'root', actualizado_por: 'ingrid', fecha_actualizacion: ahora() }))
  })
  it('actualizar sin firmarse como actualizado_por 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), ITEM), { especificacion: 'x', actualizado_por: 'root', fecha_actualizacion: ahora() }))
  })
  it('desactivar (baja soft) pasa', async () => {
    await assertSucceeds(updateDoc(doc(db('ingrid'), ITEM), { activo: false, actualizado_por: 'ingrid', fecha_actualizacion: ahora() }))
  })
})


// ════════ (J) CASOS ADVERSARIALES DE LA REVISIÓN INDEPENDIENTE (Opus) ════════
describe('(J) fecha de entrega acotada (no antedatar sin límite)', () => {
  const crear = (fecha: Timestamp) => setDoc(doc(db('ingrid'), ACTAS, 'f1'), actaValida('ingrid', { fecha }))
  const diasDesdeHoy = (n: number) => Timestamp.fromMillis(Date.now() + n * 86_400_000)
  it('hace 400 días 403', async () => { await assertFails(crear(diasDesdeHoy(-400))) })
  it('dentro de 30 días 403 (futura)', async () => { await assertFails(crear(diasDesdeHoy(30))) })
  it('hace 29 días pasa (registro de una entrega reciente)', async () => { await assertSucceeds(crear(diasDesdeHoy(-29))) })
  it('hace 40 días 403', async () => { await assertFails(crear(diasDesdeHoy(-40))) })
  it('editar el borrador moviendo la fecha a hace 400 días 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), BOR), edicion('ingrid', { fecha: diasDesdeHoy(-400) })))
  })
})

describe('(J) firma: PNG real', () => {
  const frm = (firma: unknown) => updateDoc(doc(db('ingrid'), BOR), firmar('ingrid', { firma_colaborador: firma }))
  it('base64 con longitud que no es múltiplo de 4 403', async () => { await assertFails(frm('data:image/png;base64,iVBORw0KGgo' + 'A'.repeat(302))) })
  it('sin la cabecera de archivo PNG (iVBORw0KGgo) 403', async () => { await assertFails(frm('data:image/png;base64,' + 'A'.repeat(312))) })
  it('tres signos = al final 403', async () => { await assertFails(frm('data:image/png;base64,iVBORw0KGgo' + 'A'.repeat(298) + '===')) })
  it('SVG disfrazado 403', async () => { await assertFails(frm('data:image/svg+xml;base64,iVBORw0KGgo' + 'A'.repeat(301))) })
  it('prefijo en mayúsculas 403', async () => { await assertFails(frm('DATA:IMAGE/PNG;BASE64,iVBORw0KGgo' + 'A'.repeat(301))) })
  it('salto de línea al final 403', async () => { await assertFails(frm(FIRMA + '\n')) })
  it('fecha_firma a +2 días 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), BOR), firmar('ingrid', { fecha_firma: Timestamp.fromMillis(Date.now() + 2 * 86_400_000) })))
  })
  it('fecha_firma como texto 403', async () => { await assertFails(updateDoc(doc(db('ingrid'), BOR), firmar('ingrid', { fecha_firma: 'hoy' }))) })
  it('firmar agregando una anulación 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), BOR), firmar('ingrid', { anulacion: { fecha: ahora(), por: 'ingrid', motivo: 'x' } })))
  })
})

describe('(J) multi-vía, setDoc completo y deleteField', () => {
  it('firmar y anular en un mismo write 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), BOR), {
      estado: 'anulada', firmado: true, firma_colaborador: FIRMA, firma_hash: HASH, fecha_firma: ahora(),
      anulacion: { fecha: ahora(), por: 'ingrid', motivo: 'x' }, fecha_actualizacion: ahora(),
      historial: arrayUnion(entrada('ingrid', { de: 'borrador', a: 'anulada' })),
    }))
  })
  it('un batch con firmar + editar los elementos del mismo borrador 403', async () => {
    const f = db('ingrid')
    const b = writeBatch(f)
    b.update(doc(f, BOR), firmar('ingrid'))
    b.update(doc(f, BOR), edicion('ingrid', { items: [item({ cantidad: 9 })] }))
    await assertFails(b.commit())
  })
  it('un batch con anular la firmada + cambiar el hash 403', async () => {
    const f = db('ingrid')
    const b = writeBatch(f)
    b.update(doc(f, FIR), anulacion('ingrid', 'firmada'))
    b.update(doc(f, FIR), { firma_hash: 'c'.repeat(64) })
    await assertFails(b.commit())
  })
  it('setDoc completo sobre la firmada con el mismo contenido + anulación válida pasa (control positivo)', async () => {
    const snap = await getDoc(doc(db('ingrid'), FIR))
    await assertSucceeds(setDoc(doc(db('ingrid'), FIR), {
      ...snap.data(),
      estado: 'anulada',
      anulacion: { fecha: ahora(), por: 'ingrid', motivo: 'Por error' },
      fecha_actualizacion: ahora(),
      historial: [...(snap.data()!.historial as unknown[]), entrada('ingrid', { de: 'firmada', a: 'anulada' })],
    }))
  })
  it('setDoc completo sobre la firmada OMITIENDO firma_hash 403', async () => {
    const snap = await getDoc(doc(db('ingrid'), FIR))
    const data = { ...snap.data() } as Record<string, unknown>
    delete data.firma_hash
    await assertFails(setDoc(doc(db('ingrid'), FIR), {
      ...data, estado: 'anulada', anulacion: { fecha: ahora(), por: 'ingrid', motivo: 'x' }, fecha_actualizacion: ahora(),
      historial: [...(snap.data()!.historial as unknown[]), entrada('ingrid', { de: 'firmada', a: 'anulada' })],
    }))
  })
  it('setDoc sobre la anulada reemplazándola por un acta nueva 403', async () => {
    await assertFails(setDoc(doc(db('ingrid'), ANU), actaValida('ingrid')))
  })
  it('setDoc con merge sobre el borrador agregando la firma suelta 403', async () => {
    await assertFails(setDoc(doc(db('ingrid'), BOR), { firma_colaborador: FIRMA }, { merge: true }))
  })
  it('borrar entregado_por_nombre desde la edición 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), BOR), edicion('ingrid', { entregado_por_nombre: deleteField() })))
  })
  it('borrar el historial 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), BOR), { historial: deleteField(), fecha_actualizacion: ahora() }))
  })
  it('borrar la anulación al anular 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), BOR), anulacion('ingrid', 'borrador', { anulacion: deleteField() })))
  })
  it('borrar firmado al firmar 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), BOR), firmar('ingrid', { firmado: deleteField() })))
  })
})

describe('(J) null vs ausente y estados imposibles', () => {
  const crear = (extra: Record<string, unknown>) => setDoc(doc(db('ingrid'), ACTAS, 'z1'), actaValida('ingrid', extra))
  it('create con firma_colaborador:null 403', async () => { await assertFails(crear({ firma_colaborador: null })) })
  it('create con anulacion:null 403', async () => { await assertFails(crear({ anulacion: null })) })
  it('create con fecha_actualizacion:null 403', async () => { await assertFails(crear({ fecha_actualizacion: null })) })
  it('create con estado desconocido 403', async () => { await assertFails(crear({ estado: 'cerrada' })) })
  it('create de borrador con fecha_firma suelta 403', async () => { await assertFails(crear({ fecha_firma: ahora() })) })
  it('create firmada pero firmado:false 403', async () => { await assertFails(crear({ estado: 'firmada' })) })
  it('anular el borrador poniendo firmado:true 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), BOR), anulacion('ingrid', 'borrador', { firmado: true })))
  })
  it('anular con fecha_actualizacion como texto 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), FIR), anulacion('ingrid', 'firmada', { fecha_actualizacion: 'x'.repeat(5000) })))
  })
  it('anular con fecha_actualizacion null 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), FIR), anulacion('ingrid', 'firmada', { fecha_actualizacion: null })))
  })
  it('anular con una entrada de historial SIN `de` 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), FIR), anulacion('ingrid', 'firmada', {
      historial: arrayUnion(entrada('ingrid', { a: 'anulada' })),
    })))
  })
})

describe('(J) historial', () => {
  it('entrada con una clave extra 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), BOR), edicion('ingrid', {
      historial: arrayUnion(entrada('ingrid', { de: 'borrador', a: 'borrador', ip: '1.2.3.4' })),
    })))
  })
  it('reescribir la nota de la 1.ª entrada y agregar una 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), BOR), edicion('ingrid', {
      historial: [
        entrada('ingrid', { a: 'borrador', nota: 'Reescrita' }),
        entrada('ingrid', { de: 'borrador', a: 'borrador', nota: 'Acta editada' }),
      ],
    })))
  })
  it('entrada fechada a +2 días 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), BOR), edicion('ingrid', {
      historial: arrayUnion({ fecha: Timestamp.fromMillis(Date.now() + 2 * 86_400_000), por: 'ingrid', de: 'borrador', a: 'borrador' }),
    })))
  })
  it('la edición no puede llevar el historial a más de 290 entradas (deja margen para firmar y anular)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const d = ctx.firestore()
      await setDoc(doc(d, `${ACTAS}/largo`), actaValida('ingrid', {
        historial: Array.from({ length: 290 }, (_, i) => entrada('ingrid', { a: 'borrador', nota: `n${i}` })),
      }))
      await setDoc(doc(d, `${ACTAS}/casi`), actaValida('ingrid', {
        historial: Array.from({ length: 289 }, (_, i) => entrada('ingrid', { a: 'borrador', nota: `n${i}` })),
      }))
    })
    await assertFails(updateDoc(doc(db('ingrid'), `${ACTAS}/largo`), edicion('ingrid')))
    await assertSucceeds(updateDoc(doc(db('ingrid'), `${ACTAS}/casi`), edicion('ingrid')))
    // …y aun así se puede FIRMAR y ANULAR un borrador con 290 entradas.
    await assertSucceeds(updateDoc(doc(db('ingrid'), `${ACTAS}/largo`), firmar('ingrid')))
  })
})

describe('(J) catálogo y lectura', () => {
  it('cesar (residente_obra) no lee el catálogo 403', async () => { await assertFails(getDoc(doc(db('cesar'), ITEM))) })
  it('actualizar cambiando fecha_creacion 403', async () => {
    await assertFails(updateDoc(doc(db('ingrid'), ITEM), { fecha_creacion: ahora(), actualizado_por: 'ingrid', fecha_actualizacion: ahora() }))
  })
  it('cantidad_default como 1.0 desde JS se guarda entero y pasa', async () => {
    await assertSucceeds(setDoc(doc(db('ingrid'), CAT, 'uno'), catalogoValido('ingrid', { cantidad_default: 1.0 })))
  })
})
