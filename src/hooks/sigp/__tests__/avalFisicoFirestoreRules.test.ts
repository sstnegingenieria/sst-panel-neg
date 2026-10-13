// @vitest-environment node
//
// Batería de las reglas de Firestore del AVAL SST POR FORMATOS FÍSICOS:
//   match /verificaciones_sst/{proyectoId} — contenido de `sst_gate`
//   (rama app / rama físico) + copia obligatoria en `historial`.
//
// PRINCIPIO DE LA BATERÍA (lección del SB2.2): cada denegación se prueba con
// el actor de MÍNIMO PRIVILEGIO que casi puede. Aquí:
//  · el actor de la vía física es ingrid (gestion_integral) — y cada rechazo de
//    CONTENIDO se prueba con ella, quitando/rompiendo UN solo elemento de una
//    entrada que en el control positivo (caso 1) sí pasa. Así el 403 prueba ese
//    elemento y no que "el actor no podía".
//  · la denegación de ROL de la vía física se prueba con sst y residente_sst,
//    que SÍ tienen acceso al doc y a la rama app (casi pueden), no con un
//    anónimo (que solo prueba el catch-all).
//
// NO forma parte del `npm test` por defecto. Se corre con:
//   npx firebase emulators:exec --project demo-neg --only firestore \
//     "npx vitest run --config vitest.emulator.config.ts src/hooks/sigp/__tests__/avalFisicoFirestoreRules.test.ts"

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
  doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, arrayUnion, serverTimestamp, Timestamp,
  collection, getDocs,
} from 'firebase/firestore'

const TIMEOUT = 30_000

const ROLES = {
  ingrid: 'gestion_integral',        // ÚNICA con la vía física
  sofia: 'sst',                      // casi puede: tiene la rama app, no la física
  ramiro: 'residente_sst',           // idem
  root: 'admin',                     // solo lectura
  marcela: 'gerencia_administrativa',
  giovanny: 'gerencia_general',
  diego: 'director_proyectos',       // ni siquiera lee la proyección
  karen: 'operacion_comercial',
  cesar: 'residente_obra',
} as const
type Actor = keyof typeof ROLES

const ID = 'pry_001'
const OTRO_ID = 'pry_999'
const REF = `verificaciones_sst/${ID}`

let env: RulesTestEnvironment
const db = (a: Actor) => env.authenticatedContext(a).firestore()
const dbAnon = () => env.unauthenticatedContext().firestore()

/** Proyección de un proyecto en la cola, SIN historial (el caso del primer
 *  aval: la CF no escribe historial). */
const proyeccion = (extra: Record<string, unknown> = {}) => ({
  proyecto_id: ID, consecutivo: 'PRY-2026-040', nombre_sitio: 'Sitio', codigo_sitio_cliente: 'X1',
  cliente_nombre: 'Cliente', contratista_id: 'c1', contratista_nombre: 'Contratista',
  estado: 'facturado', obra_id: `pry_${ID}`,
  ...extra,
})

const UUID_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const UUID_B = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
/** URL de descarga con la forma EXACTA que produce getDownloadURL (emulador). */
const urlEscaneo = (id = ID, ext = 'pdf') =>
  `http://127.0.0.1:9199/v0/b/neg-sst-app.firebasestorage.app/o/verificacion_sst%2F${id}%2Ffisico%2F${UUID_A}.${ext}?alt=media&token=${UUID_B}`
/** Misma forma, pero la que emite producción (https + googleapis). */
const urlEscaneoProd = (id = ID) =>
  `https://firebasestorage.googleapis.com/v0/b/neg-sst-app.firebasestorage.app/o/verificacion_sst%2F${id}%2Ffisico%2F${UUID_A}.pdf?alt=media&token=${UUID_B}`

type Mut = (o: Record<string, any>) => void

/**
 * Update de aval FÍSICO completo y válido (control positivo). Cada test pasa
 * mutadores que rompen UN elemento: `fis` sobre sst_gate.fisico, `gate` sobre
 * sst_gate, `ent` sobre la entrada del historial. `historial` reemplaza la
 * operación entera (para los casos de tampering del array).
 */
function avalFisico(uid: string, m: { fis?: Mut; gate?: Mut; ent?: Mut; historial?: unknown; sinHistorial?: boolean } = {}) {
  const fisico: Record<string, any> = {
    soporte_url: urlEscaneo(),
    quien_tiene_original: 'Ing. Pérez',
    cargo: 'Supervisor del cliente',
    fecha_formatos: Timestamp.fromMillis(Date.now() - 86_400_000),
    tipos_formato: ['ats', 'permiso_alturas'],
    motivo: 'El cliente exige los formatos SST impresos y firmados',
    registrado_por: uid,
    fecha_registro: serverTimestamp(),
  }
  m.fis?.(fisico)
  const gate: Record<string, any> = {
    estado: 'al_dia', verificado_por: uid, fecha: serverTimestamp(), origen: 'fisico', fisico,
  }
  m.gate?.(gate)
  const entrada: Record<string, any> = {
    de: 'pendiente', a: 'al_dia', por: uid, fecha: Timestamp.now(),
    motivo: 'Gate SST: AL DÍA por FORMATOS FÍSICOS',
    // copia COMPLETA de la evidencia del gate (un serverTimestamp no puede ir
    // en un array: la fecha del registro lleva un Timestamp real)
    fisico: { ...fisico, fecha_registro: Timestamp.now() },
  }
  m.ent?.(entrada)
  const payload: Record<string, any> = { sst_gate: gate, fecha_actualizacion: serverTimestamp() }
  if (!m.sinHistorial) payload.historial = m.historial !== undefined ? m.historial : arrayUnion(entrada)
  return payload
}

/** Update de aval por APP (flujo de siempre: sin origen, sin fisico). */
const avalApp = (uid: string, estado = 'al_dia', extra: Record<string, any> = {}) => ({
  sst_gate: { estado, verificado_por: uid, fecha: Timestamp.now(), ...extra },
  fecha_actualizacion: Timestamp.now(),
  historial: arrayUnion({ de: 'pendiente', a: estado, por: uid, fecha: Timestamp.now(), motivo: 'app' }),
})

const upd = (a: Actor, payload: Record<string, any>, id = ID) =>
  updateDoc(doc(db(a), `verificaciones_sst/${id}`), payload)

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-neg',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
}, TIMEOUT)

afterAll(async () => { await env.cleanup() })

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore()
    for (const [uid, rol] of Object.entries(ROLES)) {
      await setDoc(doc(d, 'users', uid), { nombre: uid, rol, estado: 'activo' })
    }
    await setDoc(doc(d, REF), proyeccion())
    await setDoc(doc(d, `verificaciones_sst/${OTRO_ID}`), proyeccion({ proyecto_id: OTRO_ID, consecutivo: 'PRY-2026-041' }))
  })
}, TIMEOUT)

// ───────────────────────── vía FÍSICA — control positivo ─────────────────────────

describe('aval físico — quien SÍ puede (gestion_integral con evidencia completa)', () => {
  it('1. CONTROL POSITIVO: ingrid, evidencia completa, doc sin historial → permitido', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
  }, TIMEOUT)

  it('2. ingrid con historial previo (traza de un ciclo anterior) → permitido, lo previo intacto', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), REF), {
        historial: [
          { de: 'pendiente', a: 'con_novedad', por: 'sofia', fecha: Timestamp.now(), motivo: 'faltan permisos' },
        ],
      })
    })
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
  }, TIMEOUT)

  it("3. 'otro' CON el nombre del formato del cliente → permitido", async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid', {
      fis: f => { f.tipos_formato = ['ats', 'otro']; f.formato_otro = 'Permiso de trabajo Claro' },
    })))
  }, TIMEOUT)

  it('4. cargo opcional: sin cargo → permitido', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid', { fis: f => { delete f.cargo } })))
  }, TIMEOUT)
})

// ───────────────────────── vía FÍSICA — rechazos de CONTENIDO (actor: ingrid) ─────────────────────────

describe('aval físico — la evidencia es obligatoria EN LA REGLA (actor ingrid, un elemento roto a la vez)', () => {
  const caso = (n: number, titulo: string, m: Parameters<typeof avalFisico>[1]) =>
    it(`${n}. RECHAZO: ${titulo}`, async () => {
      await assertFails(upd('ingrid', avalFisico('ingrid', m)))
    }, TIMEOUT)

  // escaneo
  caso(5, 'sin soporte_url', { fis: f => { delete f.soporte_url } })
  caso(6, "soporte_url vacío ''", { fis: f => { f.soporte_url = '' } })
  caso(7, 'soporte_url de texto basura (no apunta a la ruta de escaneos)', { fis: f => { f.soporte_url = 'x' } })
  caso(8, 'soporte_url apunta al escaneo de OTRO proyecto', { fis: f => { f.soporte_url = urlEscaneo(OTRO_ID) } })
  caso(9, 'soporte_url apunta a otra ruta de Storage (cotizaciones)', {
    fis: f => { f.soporte_url = 'http://127.0.0.1:9199/v0/b/b/o/cotizaciones%2Fc1%2Fx.pdf?alt=media' },
  })
  caso(10, 'soporte_url no es string', { fis: f => { f.soporte_url = 123 } })
  // quién tiene el original
  caso(11, 'sin quien_tiene_original', { fis: f => { delete f.quien_tiene_original } })
  caso(12, 'quien_tiene_original demasiado corto', { fis: f => { f.quien_tiene_original = 'ab' } })
  // fecha de los formatos
  caso(13, 'sin fecha_formatos', { fis: f => { delete f.fecha_formatos } })
  caso(14, 'fecha_formatos en el FUTURO', { fis: f => { f.fecha_formatos = Timestamp.fromMillis(Date.now() + 5 * 86_400_000) } })
  caso(15, 'fecha_formatos no es timestamp', { fis: f => { f.fecha_formatos = '2026-10-10' } })
  // formatos que cubre
  caso(16, 'sin tipos_formato', { fis: f => { delete f.tipos_formato } })
  caso(17, 'tipos_formato lista VACÍA', { fis: f => { f.tipos_formato = [] } })
  caso(18, 'tipos_formato no es lista', { fis: f => { f.tipos_formato = 'ats' } })
  caso(19, "'otro' SIN formato_otro", { fis: f => { f.tipos_formato = ['otro'] } })
  caso(20, "'otro' con formato_otro vacío", { fis: f => { f.tipos_formato = ['otro']; f.formato_otro = '' } })
  // motivo
  caso(21, 'sin motivo', { fis: f => { delete f.motivo } })
  caso(22, 'motivo de 1 carácter (un "x" no es evidencia)', { fis: f => { f.motivo = 'x' } })
  caso(23, 'motivo bajo el mínimo (9 caracteres)', { fis: f => { f.motivo = '123456789' } })
  // registro no falsificable
  caso(24, 'registrado_por de OTRA persona (suplantación)', { fis: f => { f.registrado_por = 'sofia' } })
  caso(25, 'sin registrado_por', { fis: f => { delete f.registrado_por } })
  caso(26, 'fecha_registro del CLIENTE (no del servidor)', { fis: f => { f.fecha_registro = Timestamp.now() } })
  caso(27, 'sin fecha_registro', { fis: f => { delete f.fecha_registro } })
  caso(28, 'sst_gate.fecha del CLIENTE (no del servidor)', { gate: g => { g.fecha = Timestamp.now() } })
  caso(29, 'verificado_por de OTRA persona', { gate: g => { g.verificado_por = 'sofia' } })
  // forma del gate
  caso(30, "estado 'con_novedad' con origen físico (el físico SOLO avala)", { gate: g => { g.estado = 'con_novedad' } })
  caso(31, "estado 'pendiente' con origen físico", { gate: g => { g.estado = 'pendiente' } })
  caso(32, 'clave extra en sst_gate (observacion)', { gate: g => { g.observacion = 'colado' } })
  caso(33, 'clave extra en fisico', { fis: f => { f.colado = true } })
  caso(34, 'origen físico SIN bloque fisico', { gate: g => { delete g.fisico } })
  caso(35, 'fisico no es un mapa', { gate: g => { g.fisico = 'x' } })
})

// ───────────────────────── la copia en el historial ─────────────────────────

describe('aval físico — la copia de la evidencia en `historial` también va en la regla', () => {
  it('36. RECHAZO: aval SIN tocar el historial (no hay copia)', async () => {
    await assertFails(upd('ingrid', avalFisico('ingrid', { sinHistorial: true })))
  }, TIMEOUT)

  it('37. RECHAZO: la entrada del historial apunta a OTRO escaneo', async () => {
    await assertFails(upd('ingrid', avalFisico('ingrid', {
      ent: e => { e.fisico = { ...e.fisico, soporte_url: urlEscaneo(OTRO_ID) } },
    })))
  }, TIMEOUT)

  it('38. RECHAZO: la entrada del historial sin la evidencia', async () => {
    await assertFails(upd('ingrid', avalFisico('ingrid', { ent: e => { delete e.fisico } })))
  }, TIMEOUT)

  it("39. RECHAZO: la entrada del historial atribuida a OTRA persona ('por')", async () => {
    await assertFails(upd('ingrid', avalFisico('ingrid', { ent: e => { e.por = 'sofia' } })))
  }, TIMEOUT)

  it("40. RECHAZO: la entrada del historial no es 'al_dia'", async () => {
    await assertFails(upd('ingrid', avalFisico('ingrid', { ent: e => { e.a = 'con_novedad' } })))
  }, TIMEOUT)

  it('41. RECHAZO: reemplazar el historial entero (borra la traza previa)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), REF), {
        historial: [{ de: 'pendiente', a: 'con_novedad', por: 'sofia', fecha: Timestamp.now(), motivo: 'faltan permisos' }],
      })
    })
    await assertFails(upd('ingrid', avalFisico('ingrid', {
      historial: [{ de: 'pendiente', a: 'al_dia', por: 'ingrid', fecha: Timestamp.now(), motivo: 'm' }],
    })))
  }, TIMEOUT)

  it('42. RECHAZO: dos entradas nuevas de una vez (solo se agrega UNA)', async () => {
    const e = { de: 'pendiente', a: 'al_dia', por: 'ingrid', fecha: Timestamp.now(), motivo: 'm' }
    await assertFails(upd('ingrid', avalFisico('ingrid', {
      historial: arrayUnion(e, { ...e, motivo: 'segunda' }),
    })))
  }, TIMEOUT)
})

describe('aval físico — la URL del escaneo está ANCLADA (host, bucket, ruta, UUID)', () => {
  it('N1. CONTROL: la URL de PRODUCCIÓN (https + googleapis + bucket real) → permitido', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid', {
      fis: f => { f.soporte_url = urlEscaneoProd() },
    })))
  }, TIMEOUT)

  const url = (n: number, titulo: string, valor: string) =>
    it(`${n}. RECHAZO: ${titulo}`, async () => {
      await assertFails(upd('ingrid', avalFisico('ingrid', { fis: f => { f.soporte_url = valor } })))
    }, TIMEOUT)

  url(65, 'la subcadena suelta, sin host', `verificacion_sst%2F${ID}%2Ffisico%2F${UUID_A}.pdf?alt=media&token=${UUID_B}`)
  url(66, 'host AJENO con la ruta metida en el query string', `https://evil.example/?r=verificacion_sst%2F${ID}%2Ffisico%2F${UUID_A}.pdf?alt=media&token=${UUID_B}`)
  url(67, 'esquema javascript: con la ruta embebida (XSS en el href)', `javascript:alert(1)//verificacion_sst%2F${ID}%2Ffisico%2F${UUID_A}.pdf?alt=media&token=${UUID_B}`)
  url(68, 'bucket de OTRO proyecto Firebase', `https://firebasestorage.googleapis.com/v0/b/otro-proyecto.appspot.com/o/verificacion_sst%2F${ID}%2Ffisico%2F${UUID_A}.pdf?alt=media&token=${UUID_B}`)
  url(69, 'nombre de archivo que no es un UUID', `https://firebasestorage.googleapis.com/v0/b/neg-sst-app.firebasestorage.app/o/verificacion_sst%2F${ID}%2Ffisico%2Fabc.pdf?alt=media&token=${UUID_B}`)
  url(70, 'sin alt=media/token (no es una URL de descarga)', `https://firebasestorage.googleapis.com/v0/b/neg-sst-app.firebasestorage.app/o/verificacion_sst%2F${ID}%2Ffisico%2F${UUID_A}.pdf`)
  url(71, 'basura detrás de la URL válida (sufijo)', urlEscaneoProd() + '&x=1')
  url(72, 'extensión no alfanumérica', `https://firebasestorage.googleapis.com/v0/b/neg-sst-app.firebasestorage.app/o/verificacion_sst%2F${ID}%2Ffisico%2F${UUID_A}.p-f?alt=media&token=${UUID_B}`)
})

describe('aval físico — contenido: textos, listas y fechas', () => {
  const caso = (n: number, titulo: string, m: Parameters<typeof avalFisico>[1]) =>
    it(`${n}. RECHAZO: ${titulo}`, async () => {
      await assertFails(upd('ingrid', avalFisico('ingrid', m)))
    }, TIMEOUT)

  caso(73, 'motivo hecho de espacios (10 espacios no son evidencia)', { fis: f => { f.motivo = '          ' } })
  caso(74, 'quien_tiene_original hecho de espacios', { fis: f => { f.quien_tiene_original = '    ' } })
  caso(75, 'motivo de 5.000 caracteres (bloquearía el doc, duplicado en la copia)', { fis: f => { f.motivo = 'x'.repeat(5000) } })
  caso(76, "tipos_formato con un elemento vacío ['']", { fis: f => { f.tipos_formato = [''] } })
  caso(77, 'tipos_formato con más de 20 elementos', { fis: f => { f.tipos_formato = Array.from({ length: 21 }, (_, i) => `t${i}`) } })
  caso(78, 'fecha_formatos de hace 5 años (>2 años)', { fis: f => { f.fecha_formatos = Timestamp.fromMillis(Date.now() - 5 * 365 * 86_400_000) } })
  caso(79, 'cargo presente pero vacío', { fis: f => { f.cargo = '' } })

  it('80. CONTROL: motivo de exactamente 10 caracteres y fecha de hace 1 año → permitido', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid', {
      fis: f => { f.motivo = '1234567890'; f.fecha_formatos = Timestamp.fromMillis(Date.now() - 365 * 86_400_000) },
    })))
  }, TIMEOUT)
})

describe('aval físico — la copia en el historial debe ser COMPLETA e idéntica al gate', () => {
  const caso = (n: number, titulo: string, m: Parameters<typeof avalFisico>[1]) =>
    it(`${n}. RECHAZO: ${titulo}`, async () => {
      await assertFails(upd('ingrid', avalFisico('ingrid', m)))
    }, TIMEOUT)

  caso(81, 'la copia trae SOLO la URL (el resto de la evidencia no queda en la traza)', { ent: e => { e.fisico = { soporte_url: e.fisico.soporte_url } } })
  caso(82, 'la copia dice otro motivo que el gate', { ent: e => { e.fisico = { ...e.fisico, motivo: 'Otro motivo distinto del real' } } })
  caso(83, 'la copia dice otra persona con el original', { ent: e => { e.fisico = { ...e.fisico, quien_tiene_original: 'Alguien Más' } } })
  caso(84, 'la copia dice otros formatos', { ent: e => { e.fisico = { ...e.fisico, tipos_formato: ['emergencia'] } } })
  caso(85, "la copia dice venir de un estado distinto del real del gate ('de')", { ent: e => { e.de = 'con_novedad' } })
  caso(86, 'la copia trae una clave extra', { ent: e => { e.fisico = { ...e.fisico, colado: 1 } } })

  it("87. CONTROL: 'de' coincide con el estado real del gate (con_novedad previo) → permitido", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), REF), {
        sst_gate: { estado: 'con_novedad', verificado_por: 'sofia', fecha: Timestamp.now(), observacion: 'incompleto' },
      })
    })
    await assertSucceeds(upd('ingrid', avalFisico('ingrid', { ent: e => { e.de = 'con_novedad' } })))
  }, TIMEOUT)
})

describe('`historial` es append-only para los 3 roles — también en writes que NO tocan sst_gate', () => {
  const previo = [{ de: 'pendiente', a: 'con_novedad', por: 'sofia', fecha: Timestamp.now(), motivo: 'faltan permisos' }]
  const conPrevio = async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await updateDoc(doc(ctx.firestore(), REF), { historial: previo }) })
  }

  for (const [a, rol] of [['sofia', 'sst'], ['ramiro', 'residente_sst'], ['ingrid', 'gestion_integral']] as const) {
    it(`88. RECHAZO: ${rol} VACÍA el historial (updateDoc historial: [])`, async () => {
      await conPrevio()
      await assertFails(upd(a, { fecha_actualizacion: Timestamp.now(), historial: [] }))
    }, TIMEOUT)

    it(`89. RECHAZO: ${rol} REEMPLAZA el historial por uno inventado`, async () => {
      await conPrevio()
      await assertFails(upd(a, {
        historial: [{ de: 'pendiente', a: 'al_dia', por: a, fecha: Timestamp.now(), motivo: 'reescrito' }],
      }))
    }, TIMEOUT)
  }

  it('90. RECHAZO: recortar el historial (borrar la entrada vieja y dejar una nueva)', async () => {
    await conPrevio()
    await assertFails(upd('sofia', {
      historial: [{ de: 'pendiente', a: 'pendiente', por: 'sofia', fecha: Timestamp.now(), motivo: 'x' }],
    }))
  }, TIMEOUT)

  it("91. RECHAZO: agregar una entrada atribuida a OTRA persona ('por')", async () => {
    await conPrevio()
    await assertFails(upd('sofia', {
      historial: arrayUnion({ de: 'pendiente', a: 'pendiente', por: 'ingrid', fecha: Timestamp.now(), motivo: 'x' }),
    }))
  }, TIMEOUT)

  it('92. RECHAZO: agregar DOS entradas de una vez', async () => {
    await conPrevio()
    const e = (m: string) => ({ de: 'pendiente', a: 'pendiente', por: 'sofia', fecha: Timestamp.now(), motivo: m })
    await assertFails(upd('sofia', { historial: arrayUnion(e('a'), e('b')) }))
  }, TIMEOUT)

  it('93. CONTROL: agregar UNA entrada propia a un historial existente → permitido, lo previo intacto', async () => {
    await conPrevio()
    await assertSucceeds(upd('sofia', {
      historial: arrayUnion({ de: 'con_novedad', a: 'con_novedad', por: 'sofia', fecha: Timestamp.now(), motivo: 'nota' }),
    }))
  }, TIMEOUT)

  it('94. CONTROL: un write que no toca historial ni gate (solo fecha_actualizacion) → permitido', async () => {
    await conPrevio()
    await assertSucceeds(upd('sofia', { fecha_actualizacion: Timestamp.now() }))
  }, TIMEOUT)

  it('95. RECHAZO: historial que no es una lista', async () => {
    await assertFails(upd('sofia', { historial: 'x' }))
  }, TIMEOUT)
})

describe('rama APP — la atribución y la forma del gate no se falsifican', () => {
  it("96. RECHAZO: sst escribe verificado_por de OTRA persona (atribuir a Gestión Integral)", async () => {
    await assertFails(upd('sofia', avalApp('sofia', 'al_dia', { verificado_por: 'ingrid' })))
  }, TIMEOUT)

  it('97. RECHAZO: clave extra en sst_gate por la rama app', async () => {
    await assertFails(upd('sofia', avalApp('sofia', 'al_dia', { colado: true })))
  }, TIMEOUT)

  it("98. RECHAZO: estado inválido ('aprobado_por_telefono')", async () => {
    await assertFails(upd('sofia', avalApp('sofia', 'aprobado_por_telefono')))
  }, TIMEOUT)

  it('99. RECHAZO: con_novedad SIN observación', async () => {
    await assertFails(upd('sofia', avalApp('sofia', 'con_novedad')))
  }, TIMEOUT)

  it('100. RECHAZO: con_novedad con observación de solo espacios', async () => {
    await assertFails(upd('sofia', avalApp('sofia', 'con_novedad', { observacion: '    ' })))
  }, TIMEOUT)

  it('101. RECHAZO: observación de 5.000 caracteres', async () => {
    await assertFails(upd('sofia', avalApp('sofia', 'con_novedad', { observacion: 'x'.repeat(5000) })))
  }, TIMEOUT)

  it('102. RECHAZO: sst_gate que no es un mapa (string / null)', async () => {
    await assertFails(upd('sofia', { sst_gate: 'al_dia' }))
    await assertFails(upd('sofia', { sst_gate: null }))
  }, TIMEOUT)

  it('103. RECHAZO: dot-path sobre un gate FÍSICO por la rama app (no se puede retocar parcialmente)', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    await assertFails(upd('sofia', { 'sst_gate.estado': 'con_novedad' }))
    await assertFails(upd('sofia', { 'sst_gate.fisico.motivo': 'reescrito por otra persona' }))
  }, TIMEOUT)

  it('104. RECHAZO: ingrid edita sst_gate.fisico DESPUÉS del aval sin re-presentar evidencia completa', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    await assertFails(upd('ingrid', { 'sst_gate.fisico.motivo': 'cambiado después, sin traza en el historial' }))
  }, TIMEOUT)

  it('105. BORRAR sst_gate (deleteField) sigue permitido como siempre — y deja el gate en pendiente (cierra el pago)', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    await assertSucceeds(upd('sofia', { sst_gate: deleteField(), fecha_actualizacion: Timestamp.now() }))
  }, TIMEOUT)
})

describe('integración — el aval físico libera la liquidación (y sin aval no)', () => {
  const PROY = 'pry_001'
  const sembrarProyecto = async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `proyectos/${PROY}`), {
        consecutivo: 'PRY-2026-040', estado: 'pagado_cliente', historial: [],
        pago_cliente: { valor: 1000 },
      })
    })
  }
  const liquidar = () => updateDoc(doc(db('diego'), `proyectos/${PROY}`), { estado: 'liquidado_contratista' })

  it('106. RECHAZO: sin aval del gate no se liquida (actor: director_proyectos, que SÍ gestiona proyectos)', async () => {
    await sembrarProyecto()
    await assertFails(liquidar())
  }, TIMEOUT)

  it('107. con el aval FÍSICO de gestion_integral → se liquida', async () => {
    await sembrarProyecto()
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    await assertSucceeds(liquidar())
  }, TIMEOUT)

  it('108. con una NOVEDAD vigente no se liquida', async () => {
    await sembrarProyecto()
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    await assertSucceeds(upd('sofia', avalApp('sofia', 'con_novedad', { observacion: 'el escaneo está incompleto' })))
    await assertFails(liquidar())
  }, TIMEOUT)
})

// ───────────────────────── la vía física es SOLO de gestion_integral ─────────────────────────

describe('aval físico — solo gestion_integral (actores que casi pueden)', () => {
  it('43. sst NO avala físico (tiene la rama app, no esta) → denegado', async () => {
    await assertFails(upd('sofia', avalFisico('sofia')))
  }, TIMEOUT)

  it('44. residente_sst NO avala físico → denegado', async () => {
    await assertFails(upd('ramiro', avalFisico('ramiro')))
  }, TIMEOUT)

  it('45. admin NO avala físico (solo lectura en el módulo) → denegado', async () => {
    await assertFails(upd('root', avalFisico('root')))
  }, TIMEOUT)

  it('46. gerencia_administrativa y gerencia_general NO escriben el gate → denegado', async () => {
    await assertFails(upd('marcela', avalFisico('marcela')))
    await assertFails(upd('giovanny', avalFisico('giovanny')))
  }, TIMEOUT)

  it('47. director_proyectos / comercial / residente_obra → denegado', async () => {
    await assertFails(upd('diego', avalFisico('diego')))
    await assertFails(upd('karen', avalFisico('karen')))
    await assertFails(upd('cesar', avalFisico('cesar')))
  }, TIMEOUT)

  it('48. anónimo → denegado (control del catch-all, no de la regla por rol)', async () => {
    await assertFails(updateDoc(doc(dbAnon(), REF), avalFisico('ingrid')))
  }, TIMEOUT)
})

// ───────────────────────── el colado de un "físico" por la rama app ─────────────────────────

describe('rama APP — no puede colar un aval físico sin evidencia', () => {
  it("49. sst escribe origen:'fisico' SIN evidencia → denegado", async () => {
    await assertFails(upd('sofia', avalApp('sofia', 'al_dia', { origen: 'fisico' })))
  }, TIMEOUT)

  it('50. sst escribe un bloque fisico por la rama app → denegado', async () => {
    await assertFails(upd('sofia', avalApp('sofia', 'al_dia', { fisico: { soporte_url: 'x' } })))
  }, TIMEOUT)

  it("51. residente_sst escribe origen:'fisico' sin evidencia → denegado", async () => {
    await assertFails(upd('ramiro', avalApp('ramiro', 'al_dia', { origen: 'fisico' })))
  }, TIMEOUT)

  it('52. gestion_integral por la rama app con bloque fisico incompleto → denegado', async () => {
    await assertFails(upd('ingrid', avalApp('ingrid', 'al_dia', { fisico: { soporte_url: '' } })))
  }, TIMEOUT)

  it("53. origen desconocido ('otro') → denegado", async () => {
    await assertFails(upd('sofia', avalApp('sofia', 'al_dia', { origen: 'otro' })))
  }, TIMEOUT)
})

// ───────────────────────── el aval por APP sigue igual (regresión) ─────────────────────────

describe('rama APP — sin cambio para quien ya operaba', () => {
  it('54. sst avala al_dia (sin origen) → permitido', async () => {
    await assertSucceeds(upd('sofia', avalApp('sofia')))
  }, TIMEOUT)

  it("55. residente_sst avala al_dia con origen:'app' explícito → permitido", async () => {
    await assertSucceeds(upd('ramiro', avalApp('ramiro', 'al_dia', { origen: 'app' })))
  }, TIMEOUT)

  it('56. gestion_integral avala por app (ya lo hacía desde el 07-sep) → permitido', async () => {
    await assertSucceeds(upd('ingrid', avalApp('ingrid')))
  }, TIMEOUT)

  it('57. sst registra una NOVEDAD con observación → permitido', async () => {
    await assertSucceeds(upd('sofia', avalApp('sofia', 'con_novedad', { observacion: 'faltan permisos de alturas' })))
  }, TIMEOUT)

  it('58. un write que toca SOLO historial (no sst_gate) no re-evalúa el gate → permitido', async () => {
    await assertSucceeds(upd('sofia', {
      fecha_actualizacion: Timestamp.now(),
      historial: arrayUnion({ de: 'pendiente', a: 'pendiente', por: 'sofia', fecha: Timestamp.now(), motivo: 'nota' }),
    }))
  }, TIMEOUT)

  it('59. tras un aval físico, SST puede registrar una novedad que lo sobrescribe (la traza queda en historial) → permitido', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    await assertSucceeds(upd('sofia', avalApp('sofia', 'con_novedad', { observacion: 'el escaneo está incompleto' })))
  }, TIMEOUT)

  it('60. y tras esa novedad, ingrid puede avalar físico de nuevo (con historial acumulado) → permitido', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    await assertSucceeds(upd('sofia', avalApp('sofia', 'con_novedad', { observacion: 'incompleto' })))
    await assertSucceeds(upd('ingrid', avalFisico('ingrid', { ent: e => { e.de = 'con_novedad' } })))
  }, TIMEOUT)
})

// ───────────────────────── lo que NO cambia: hasOnly, lectura, create/delete ─────────────────────────

describe('lo que no cambia', () => {
  it('61. ingrid no puede tocar otros campos del doc (hasOnly intacto)', async () => {
    await assertFails(upd('ingrid', { ...avalFisico('ingrid'), estado: 'liquidado_contratista' }))
    await assertFails(upd('ingrid', { contratista_nombre: 'otro' }))
  }, TIMEOUT)

  it('62. LECTURA: sst, residente_sst, gestion_integral, admin y las dos gerencias leen', async () => {
    for (const a of ['sofia', 'ramiro', 'ingrid', 'root', 'marcela', 'giovanny'] as Actor[]) {
      await assertSucceeds(getDoc(doc(db(a), REF)))
    }
  }, TIMEOUT)

  it('63. LECTURA: director_proyectos, comercial y residente_obra NO leen la proyección', async () => {
    for (const a of ['diego', 'karen', 'cesar'] as Actor[]) {
      await assertFails(getDoc(doc(db(a), REF)))
    }
    await assertFails(getDocs(collection(db('diego'), 'verificaciones_sst')))
  }, TIMEOUT)

  it('64. nadie crea ni borra la proyección (solo la CF, Admin SDK) — ni ingrid', async () => {
    await assertFails(setDoc(doc(db('ingrid'), 'verificaciones_sst/pry_nuevo'), proyeccion({ proyecto_id: 'pry_nuevo' })))
    await assertFails(deleteDoc(doc(db('ingrid'), REF)))
    await assertFails(deleteDoc(doc(db('root'), REF)))
  }, TIMEOUT)
})


// ═════════════ SEGUNDA PASADA (Opus): casos que faltaban ═════════════

describe('URL — variantes de forma (control positivo + bypasses)', () => {
  const ok = (n: number, titulo: string, valor: string) =>
    it(`${n}. CONTROL: ${titulo} → permitido`, async () => {
      await assertSucceeds(upd('ingrid', avalFisico('ingrid', { fis: f => { f.soporte_url = valor } })))
    }, TIMEOUT)
  const no = (n: number, titulo: string, valor: string) =>
    it(`${n}. RECHAZO: ${titulo}`, async () => {
      await assertFails(upd('ingrid', avalFisico('ingrid', { fis: f => { f.soporte_url = valor } })))
    }, TIMEOUT)

  ok(109, 'bucket legado appspot.com en googleapis', urlEscaneoProd().replace('neg-sst-app.firebasestorage.app', 'neg-sst-app.appspot.com'))
  no(110, 'UUID del archivo en MAYÚSCULAS', urlEscaneoProd().replace(UUID_A, UUID_A.toUpperCase()))
  no(111, 'token en MAYÚSCULAS', urlEscaneoProd().replace(UUID_B, UUID_B.toUpperCase()))
  no(112, 'salto de línea al final de una URL válida', urlEscaneoProd() + '\n')
  no(113, '%2f en minúscula (no es lo que emite el SDK)', urlEscaneoProd().replace(/%2F/g, '%2f'))
  no(114, 'host del EMULADOR con OTRO bucket (la rama del emulador está acotada al bucket del proyecto)',
    urlEscaneo().replace('neg-sst-app.firebasestorage.app', 'otro-proyecto.appspot.com'))
  no(115, 'http (no https) contra googleapis', urlEscaneoProd().replace('https://', 'http://'))

  it("116. RECHAZO: proyectoId con metacaracteres de regex ('x|.*') no abre el host (id sembrado a propósito)", async () => {
    const raro = 'x|.*'
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `verificaciones_sst/${raro}`), proyeccion({ proyecto_id: raro }))
    })
    const evil = `https://evil.example/o/zz%2Ffisico%2F${UUID_A}.pdf?alt=media&token=${UUID_B}`
    await assertFails(upd('ingrid', avalFisico('ingrid', { fis: f => { f.soporte_url = evil } }), raro))
  }, TIMEOUT)
})

describe('contenido — bordes que faltaban', () => {
  const no = (n: number, titulo: string, m: Parameters<typeof avalFisico>[1]) =>
    it(`${n}. RECHAZO: ${titulo}`, async () => {
      await assertFails(upd('ingrid', avalFisico('ingrid', m)))
    }, TIMEOUT)

  no(117, "formato_otro hecho de espacios (con 'otro' elegido)", { fis: f => { f.tipos_formato = ['otro']; f.formato_otro = '     ' } })
  no(118, "formato_otro presente SIN 'otro' en la lista", { fis: f => { f.formato_otro = 'colado sin otro' } })
  no(119, 'fecha_formatos de hace 731 días', { fis: f => { f.fecha_formatos = Timestamp.fromMillis(Date.now() - 731 * 86_400_000) } })

  it('120. CONTROL: fecha_formatos de hace 729 días → permitido', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid', {
      fis: f => { f.fecha_formatos = Timestamp.fromMillis(Date.now() - 729 * 86_400_000) },
    })))
  }, TIMEOUT)
})

describe('copia del historial — residuales DOCUMENTADOS (hoy pasan; fijados para que un cambio sea consciente)', () => {
  it('121. la copia SIN fecha_registro pasa (ese valor queda sin validar en la traza)', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid', { ent: e => { delete e.fisico.fecha_registro } })))
  }, TIMEOUT)

  it('122. la copia con fecha_registro de otro tipo pasa (idem)', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid', { ent: e => { e.fisico.fecha_registro = 'ayer' } })))
  }, TIMEOUT)
})

describe('historial — forma de la entrada nueva', () => {
  const previo = [{ de: 'pendiente', a: 'con_novedad', por: 'sofia', fecha: Timestamp.now(), motivo: 'faltan permisos' }]
  const conPrevio = async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await updateDoc(doc(ctx.firestore(), REF), { historial: previo }) })
  }
  const entrada = (extra: Record<string, any> = {}) =>
    ({ de: 'con_novedad', a: 'con_novedad', por: 'sofia', fecha: Timestamp.now(), motivo: 'nota', ...extra })

  it('123. RECHAZO: borrar el historial entero (deleteField) con traza previa', async () => {
    await conPrevio()
    await assertFails(upd('sofia', { historial: deleteField() }))
  }, TIMEOUT)

  it('124. RECHAZO: la entrada nueva no es un mapa', async () => {
    await conPrevio()
    await assertFails(upd('sofia', { historial: arrayUnion('texto suelto') }))
  }, TIMEOUT)

  it('125. RECHAZO: la entrada nueva trae claves extra', async () => {
    await conPrevio()
    await assertFails(upd('sofia', { historial: arrayUnion(entrada({ colado: true })) }))
  }, TIMEOUT)

  it('126. RECHAZO: la entrada nueva con motivo de 5.001 caracteres (inflaría el doc)', async () => {
    await conPrevio()
    await assertFails(upd('sofia', { historial: arrayUnion(entrada({ motivo: 'x'.repeat(5001) })) }))
  }, TIMEOUT)

  it("127. RECHAZO: la entrada nueva sin fecha / con 'a' inválido", async () => {
    await conPrevio()
    await assertFails(upd('sofia', { historial: arrayUnion(entrada({ fecha: 'hoy' })) }))
    await assertFails(upd('sofia', { historial: arrayUnion(entrada({ a: 'aprobado_por_telefono' })) }))
  }, TIMEOUT)

  it('128. RECHAZO: sst inventa una COPIA de evidencia física en la traza (sin gate físico)', async () => {
    await conPrevio()
    await assertFails(upd('sofia', {
      historial: arrayUnion(entrada({ fisico: { soporte_url: urlEscaneoProd(), motivo: 'evidencia inventada' } })),
    }))
  }, TIMEOUT)
})

describe('rama APP — la traza y los bordes que faltaban', () => {
  it('129. RECHAZO: cambiar el gate SIN dejar entrada en el historial (rama app, cliente no-UI)', async () => {
    await assertFails(upd('sofia', {
      sst_gate: { estado: 'al_dia', verificado_por: 'sofia', fecha: Timestamp.now() },
      fecha_actualizacion: Timestamp.now(),
    }))
  }, TIMEOUT)

  it("130. RECHAZO: la entrada del historial no coincide con el estado que quedó ('a' ≠ estado)", async () => {
    await assertFails(upd('sofia', {
      sst_gate: { estado: 'al_dia', verificado_por: 'sofia', fecha: Timestamp.now() },
      historial: arrayUnion({ de: 'pendiente', a: 'con_novedad', por: 'sofia', fecha: Timestamp.now(), motivo: 'x' }),
    }))
  }, TIMEOUT)

  it('131. RECHAZO: sst_gate sin fecha / con fecha de otro tipo', async () => {
    await assertFails(upd('sofia', { sst_gate: { estado: 'al_dia', verificado_por: 'sofia' }, historial: arrayUnion({ de: 'pendiente', a: 'al_dia', por: 'sofia', fecha: Timestamp.now(), motivo: 'x' }) }))
    await assertFails(upd('sofia', avalApp('sofia', 'al_dia', { fecha: 'hoy' })))
  }, TIMEOUT)

  it('132. RECHAZO: sst_gate sin verificado_por / con origen null', async () => {
    await assertFails(upd('sofia', { sst_gate: { estado: 'al_dia', fecha: Timestamp.now() }, historial: arrayUnion({ de: 'pendiente', a: 'al_dia', por: 'sofia', fecha: Timestamp.now(), motivo: 'x' }) }))
    await assertFails(upd('sofia', avalApp('sofia', 'al_dia', { origen: null })))
  }, TIMEOUT)

  it('133. observación de exactamente 2000 caracteres → permitido; de 2001 → rechazo', async () => {
    await assertSucceeds(upd('sofia', avalApp('sofia', 'con_novedad', { observacion: 'x'.repeat(2000) })))
    await assertFails(upd('ramiro', avalApp('ramiro', 'con_novedad', { observacion: 'x'.repeat(2001) })))
  }, TIMEOUT)

  for (const [a, rol] of [['sofia', 'sst'], ['ramiro', 'residente_sst'], ['ingrid', 'gestion_integral']] as const) {
    it(`134. COMPATIBILIDAD con la UI de producción: el payload EXACTO de marcar() (${rol}, al_dia y con_novedad) → permitido`, async () => {
      // idéntico a VerificacionContratistas.marcar: sst_gate sin origen + fecha_actualizacion + 1 entrada
      const ahora = Timestamp.now()
      await assertSucceeds(updateDoc(doc(db(a), REF), {
        sst_gate: { estado: 'al_dia', verificado_por: a, fecha: ahora },
        fecha_actualizacion: ahora,
        historial: arrayUnion({ de: 'pendiente', a: 'al_dia', por: a, fecha: ahora, motivo: 'Gate SST: contratista AL DÍA en formatos — habilita la liquidación (verificado por SST)' }),
      }))
      await assertSucceeds(updateDoc(doc(db(a), REF), {
        sst_gate: { estado: 'con_novedad', verificado_por: a, fecha: ahora, observacion: 'faltan permisos' },
        fecha_actualizacion: ahora,
        historial: arrayUnion({ de: 'al_dia', a: 'con_novedad', por: a, fecha: ahora, motivo: 'Gate SST: CON NOVEDAD — faltan permisos (la liquidación queda bloqueada)' }),
      }))
    }, TIMEOUT)
  }
})

describe('integración — borrar el gate cierra el pago', () => {
  it('135. tras un aval físico, borrar sst_gate y luego intentar liquidar → denegado', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'proyectos/pry_001'), {
        consecutivo: 'PRY-2026-040', estado: 'pagado_cliente', historial: [], pago_cliente: { valor: 1000 },
      })
    })
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    await assertSucceeds(upd('sofia', { sst_gate: deleteField(), fecha_actualizacion: Timestamp.now() }))
    await assertFails(updateDoc(doc(db('diego'), 'proyectos/pry_001'), { estado: 'liquidado_contratista' }))
  }, TIMEOUT)
})
