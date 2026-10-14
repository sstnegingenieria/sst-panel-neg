// @vitest-environment node
//
// Batería de las reglas de Firestore del AVAL SST POR FORMATOS FÍSICOS:
//   match /verificaciones_sst/{proyectoId} — contenido de `sst_gate`
//   (rama app / rama físico con REGISTRO DE CUSTODIA + declaración) + copia
//   obligatoria en `historial` + historial append-only.
//
// Los formatos NO se escanean (Ingrid, GI: pueden ser 100+ hojas): la evidencia
// es el registro de custodia (responsable del archivo, ubicación, formatos,
// fecha, motivo) + la declaración == true. No hay Storage en este bloque.
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
import { patchAvalFisico, fechaFormatosATimestampMs } from '../../../types/sigp/avalFisico'
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
const REF = `verificaciones_sst/${ID}`

let env: RulesTestEnvironment
/** Correo del token de cada actor (lo que la regla compara con declaracion_email). */
const emailDe = (a: string) => `${a}@test.dev`
const db = (a: Actor) => env.authenticatedContext(a, { email: emailDe(a) }).firestore()
const dbAnon = () => env.unauthenticatedContext().firestore()

/** Proyección de un proyecto en la cola, SIN historial (el caso del primer
 *  aval: la CF no escribe historial). */
const proyeccion = (extra: Record<string, unknown> = {}) => ({
  proyecto_id: ID, consecutivo: 'PRY-2026-040', nombre_sitio: 'Sitio', codigo_sitio_cliente: 'X1',
  cliente_nombre: 'Cliente', contratista_id: 'c1', contratista_nombre: 'Contratista',
  estado: 'facturado', obra_id: `pry_${ID}`,
  ...extra,
})

type Mut = (o: Record<string, any>) => void
type Mutadores = { fis?: Mut; gate?: Mut; ent?: Mut; historial?: unknown; sinHistorial?: boolean }

/**
 * Update de aval FÍSICO completo y válido (control positivo). Cada test pasa
 * mutadores que rompen UN elemento: `fis` sobre sst_gate.fisico, `gate` sobre
 * sst_gate, `ent` sobre la entrada del historial. `historial` reemplaza la
 * operación entera (para los casos de tampering del array).
 */
function avalFisico(uid: string, m: Mutadores = {}) {
  const fisico: Record<string, any> = {
    responsable_archivo: 'Marcela Torres',
    ubicacion: 'Archivador 3, carpeta Claro 2026',
    fecha_formatos: Timestamp.fromMillis(Date.now() - 86_400_000),
    tipos_formato: ['ats', 'permiso_alturas'],
    motivo: 'El cliente exige los formatos SST impresos y firmados',
    declaracion: true,
    declaracion_version: 'SST-FIS-v1',
    declaracion_email: emailDe(uid),
    registrado_por: uid,
    fecha_registro: serverTimestamp(),
  }
  m.fis?.(fisico)
  const gate: Record<string, any> = {
    estado: 'al_dia', verificado_por: uid, fecha: serverTimestamp(), origen: 'fisico', fisico,
  }
  m.gate?.(gate)
  const tsEntrada = Timestamp.now()
  const entrada: Record<string, any> = {
    de: 'pendiente', a: 'al_dia', por: uid, fecha: tsEntrada,
    motivo: 'Gate SST: AL DÍA por FORMATOS FÍSICOS',
    // copia COMPLETA del registro del gate (un serverTimestamp no puede ir en
    // un array: la fecha del registro lleva un Timestamp real — el MISMO de la
    // entrada, como hace el builder real)
    fisico: { ...fisico, fecha_registro: tsEntrada },
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

const dias = (n: number) => Timestamp.fromMillis(Date.now() - n * 86_400_000)

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
    await setDoc(doc(d, 'verificaciones_sst/pry_999'), proyeccion({ proyecto_id: 'pry_999', consecutivo: 'PRY-2026-041' }))
  })
}, TIMEOUT)

// ───────────────────────── vía FÍSICA — control positivo ─────────────────────────

describe('aval físico — quien SÍ puede (gestion_integral con registro de custodia completo)', () => {
  it('1. CONTROL POSITIVO: ingrid, custodia + declaración, doc sin historial → permitido', async () => {
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

  it('4. BORDE: exactamente 20 formatos → permitido', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid', {
      fis: f => { f.tipos_formato = Array.from({ length: 20 }, (_, i) => `t${i}`) },
    })))
  }, TIMEOUT)

  it('4b. BORDE: textos en el mínimo (3, 10, 10) y fecha de hace 729 días → permitido', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid', {
      fis: f => { f.responsable_archivo = 'Ana'; f.ubicacion = '1234567890'; f.motivo = '1234567890'; f.fecha_formatos = dias(729) },
    })))
  }, TIMEOUT)

  it('4c. BORDE: textos de exactamente 2000 caracteres → permitido', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid', { fis: f => { f.motivo = 'm'.repeat(2000) } })))
  }, TIMEOUT)
})

// ───────────────────────── vía FÍSICA — rechazos de CONTENIDO (actor: ingrid) ─────────────────────────

describe('aval físico — la custodia y la declaración son obligatorias EN LA REGLA (actor ingrid, un elemento roto a la vez)', () => {
  const caso = (n: number, titulo: string, m: Mutadores) =>
    it(`${n}. RECHAZO: ${titulo}`, async () => {
      await assertFails(upd('ingrid', avalFisico('ingrid', m)))
    }, TIMEOUT)

  // responsable del archivo
  caso(5, 'sin responsable_archivo', { fis: f => { delete f.responsable_archivo } })
  caso(6, 'responsable_archivo vacío', { fis: f => { f.responsable_archivo = '' } })
  caso(7, 'responsable_archivo demasiado corto', { fis: f => { f.responsable_archivo = 'ab' } })
  caso(8, 'responsable_archivo hecho de espacios', { fis: f => { f.responsable_archivo = '     ' } })
  caso(9, 'responsable_archivo no es string', { fis: f => { f.responsable_archivo = 123 } })
  // ubicación
  caso(10, 'sin ubicacion', { fis: f => { delete f.ubicacion } })
  caso(11, 'ubicacion vacía', { fis: f => { f.ubicacion = '' } })
  caso(12, 'ubicacion demasiado corta', { fis: f => { f.ubicacion = 'ab' } })
  caso(12.1, 'ubicacion de 9 caracteres (el mínimo es 10: lo genérico no localiza)', { fis: f => { f.ubicacion = '123456789' } })
  caso(12.2, "ubicacion genérica 'oficina' (7)", { fis: f => { f.ubicacion = 'oficina' } })
  caso(13, 'ubicacion hecha de espacios', { fis: f => { f.ubicacion = '     ' } })
  // fecha de los formatos
  caso(14, 'sin fecha_formatos', { fis: f => { delete f.fecha_formatos } })
  caso(15, 'fecha_formatos en el FUTURO', { fis: f => { f.fecha_formatos = Timestamp.fromMillis(Date.now() + 5 * 86_400_000) } })
  caso(16, 'fecha_formatos no es timestamp', { fis: f => { f.fecha_formatos = '2026-10-10' } })
  caso(17, 'fecha_formatos de hace 731 días (>2 años)', { fis: f => { f.fecha_formatos = dias(731) } })
  caso(18, 'fecha_formatos de hace 5 años', { fis: f => { f.fecha_formatos = dias(5 * 365) } })
  // formatos que cubre
  caso(19, 'sin tipos_formato', { fis: f => { delete f.tipos_formato } })
  caso(20, 'tipos_formato lista VACÍA', { fis: f => { f.tipos_formato = [] } })
  caso(21, 'tipos_formato no es lista', { fis: f => { f.tipos_formato = 'ats' } })
  caso(22, "tipos_formato con un elemento vacío ['']", { fis: f => { f.tipos_formato = [''] } })
  caso(23, 'tipos_formato con más de 20 elementos', { fis: f => { f.tipos_formato = Array.from({ length: 21 }, (_, i) => `t${i}`) } })
  caso(24, "'otro' SIN formato_otro", { fis: f => { f.tipos_formato = ['otro'] } })
  caso(25, "'otro' con formato_otro vacío", { fis: f => { f.tipos_formato = ['otro']; f.formato_otro = '' } })
  caso(26, "'otro' con formato_otro de solo espacios", { fis: f => { f.tipos_formato = ['otro']; f.formato_otro = '     ' } })
  caso(27, "formato_otro presente SIN 'otro' en la lista", { fis: f => { f.formato_otro = 'colado sin otro' } })
  // motivo
  caso(28, 'sin motivo', { fis: f => { delete f.motivo } })
  caso(29, 'motivo de 1 carácter (un "x" no es evidencia)', { fis: f => { f.motivo = 'x' } })
  caso(30, 'motivo bajo el mínimo (9 caracteres)', { fis: f => { f.motivo = '123456789' } })
  caso(31, 'motivo hecho de espacios (10 espacios no son evidencia)', { fis: f => { f.motivo = '          ' } })
  caso(32, 'motivo de 2.001 caracteres (inflaría el doc, duplicado en la copia)', { fis: f => { f.motivo = 'x'.repeat(2001) } })
  // declaración
  caso(33, 'sin declaracion', { fis: f => { delete f.declaracion } })
  caso(34, 'declaracion == false', { fis: f => { f.declaracion = false } })
  caso(35, "declaracion como string 'true'", { fis: f => { f.declaracion = 'true' } })
  caso(36, 'declaracion como número 1', { fis: f => { f.declaracion = 1 } })
  caso(37, 'declaracion null', { fis: f => { f.declaracion = null } })
  // registro no falsificable
  caso(38, 'registrado_por de OTRA persona (suplantación)', { fis: f => { f.registrado_por = 'sofia' } })
  caso(39, 'sin registrado_por', { fis: f => { delete f.registrado_por } })
  caso(40, 'fecha_registro del CLIENTE (no del servidor)', { fis: f => { f.fecha_registro = Timestamp.now() } })
  caso(41, 'sin fecha_registro', { fis: f => { delete f.fecha_registro } })
  caso(42, 'sst_gate.fecha del CLIENTE (no del servidor)', { gate: g => { g.fecha = Timestamp.now() } })
  caso(43, 'verificado_por de OTRA persona', { gate: g => { g.verificado_por = 'sofia' } })
  // forma del gate
  caso(44, "estado 'con_novedad' con origen físico (el físico SOLO avala)", { gate: g => { g.estado = 'con_novedad' } })
  caso(45, "estado 'pendiente' con origen físico", { gate: g => { g.estado = 'pendiente' } })
  caso(46, 'clave extra en sst_gate (observacion)', { gate: g => { g.observacion = 'colado' } })
  caso(47, 'clave extra en fisico', { fis: f => { f.colado = true } })
  caso(48, 'campo LEGADO soporte_url en fisico (ya no existe el escaneo)', { fis: f => { f.soporte_url = 'https://x/y' } })
  caso(49, 'campo LEGADO quien_tiene_original en fisico (ahora es responsable_archivo)', { fis: f => { f.quien_tiene_original = 'Ana' } })
  caso(50, 'origen físico SIN bloque fisico', { gate: g => { delete g.fisico } })
  caso(51, 'fisico no es un mapa', { gate: g => { g.fisico = 'x' } })
  caso(52, "origen 'fisico' con fisico vacío {}", { gate: g => { g.fisico = {} } })
})

// ───────────────────────── la copia en el historial ─────────────────────────

describe('aval físico — la copia del registro en `historial` también va en la regla', () => {
  const caso = (n: number, titulo: string, m: Mutadores) =>
    it(`${n}. RECHAZO: ${titulo}`, async () => {
      await assertFails(upd('ingrid', avalFisico('ingrid', m)))
    }, TIMEOUT)

  caso(53, 'aval SIN tocar el historial (no hay copia)', { sinHistorial: true })
  caso(54, 'la copia dice otro responsable_archivo que el gate', { ent: e => { e.fisico = { ...e.fisico, responsable_archivo: 'Alguien Más' } } })
  caso(55, 'la copia dice otra ubicación', { ent: e => { e.fisico = { ...e.fisico, ubicacion: 'Otro lugar distinto' } } })
  caso(56, 'la copia dice otros formatos', { ent: e => { e.fisico = { ...e.fisico, tipos_formato: ['emergencia'] } } })
  caso(57, 'la copia dice otro motivo', { ent: e => { e.fisico = { ...e.fisico, motivo: 'Otro motivo distinto del real' } } })
  caso(58, 'la copia con declaracion distinta (false)', { ent: e => { e.fisico = { ...e.fisico, declaracion: false } } })
  caso(59, 'la copia sin el bloque fisico', { ent: e => { delete e.fisico } })
  caso(60, 'la copia con un bloque fisico vacío', { ent: e => { e.fisico = {} } })
  caso(61, 'la copia trae una clave extra', { ent: e => { e.fisico = { ...e.fisico, colado: 1 } } })
  caso(62, "la entrada atribuida a OTRA persona ('por')", { ent: e => { e.por = 'sofia' } })
  caso(63, "la entrada no es 'al_dia'", { ent: e => { e.a = 'con_novedad' } })
  caso(64, "la entrada dice venir de un estado distinto del real del gate ('de')", { ent: e => { e.de = 'con_novedad' } })

  it('65. RECHAZO: reemplazar el historial entero (borra la traza previa)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), REF), {
        historial: [{ de: 'pendiente', a: 'con_novedad', por: 'sofia', fecha: Timestamp.now(), motivo: 'faltan permisos' }],
      })
    })
    await assertFails(upd('ingrid', avalFisico('ingrid', {
      historial: [{ de: 'pendiente', a: 'al_dia', por: 'ingrid', fecha: Timestamp.now(), motivo: 'm' }],
    })))
  }, TIMEOUT)

  it('66. RECHAZO: dos entradas nuevas de una vez (solo se agrega UNA)', async () => {
    const e = { de: 'pendiente', a: 'al_dia', por: 'ingrid', fecha: Timestamp.now(), motivo: 'm' }
    await assertFails(upd('ingrid', avalFisico('ingrid', { historial: arrayUnion(e, { ...e, motivo: 'segunda' }) })))
  }, TIMEOUT)

  it("67. CONTROL: 'de' coincide con el estado real del gate (con_novedad previo) → permitido", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), REF), {
        sst_gate: { estado: 'con_novedad', verificado_por: 'sofia', fecha: Timestamp.now(), observacion: 'incompleto' },
      })
    })
    await assertSucceeds(upd('ingrid', avalFisico('ingrid', { ent: e => { e.de = 'con_novedad' } })))
  }, TIMEOUT)

  it('68. RECHAZO: la copia SIN fecha_registro (la traza debe llevar la fecha del registro)', async () => {
    await assertFails(upd('ingrid', avalFisico('ingrid', { ent: e => { delete e.fisico.fecha_registro } })))
  }, TIMEOUT)

  it('69. RECHAZO: la copia con fecha_registro que no es timestamp', async () => {
    await assertFails(upd('ingrid', avalFisico('ingrid', { ent: e => { e.fisico.fecha_registro = 'ayer' } })))
  }, TIMEOUT)
})

// ───────────────────────── la vía física es SOLO de gestion_integral ─────────────────────────

describe('aval físico — solo gestion_integral (actores que casi pueden)', () => {
  it('70. sst NO avala físico (tiene la rama app, no esta) → denegado', async () => {
    await assertFails(upd('sofia', avalFisico('sofia')))
  }, TIMEOUT)

  it('71. residente_sst NO avala físico → denegado', async () => {
    await assertFails(upd('ramiro', avalFisico('ramiro')))
  }, TIMEOUT)

  it('72. admin NO avala físico (solo lectura en el módulo) → denegado', async () => {
    await assertFails(upd('root', avalFisico('root')))
  }, TIMEOUT)

  it('73. gerencia_administrativa y gerencia_general NO escriben el gate → denegado', async () => {
    await assertFails(upd('marcela', avalFisico('marcela')))
    await assertFails(upd('giovanny', avalFisico('giovanny')))
  }, TIMEOUT)

  it('74. director_proyectos / comercial / residente_obra → denegado', async () => {
    await assertFails(upd('diego', avalFisico('diego')))
    await assertFails(upd('karen', avalFisico('karen')))
    await assertFails(upd('cesar', avalFisico('cesar')))
  }, TIMEOUT)

  it('75. anónimo → denegado (control del catch-all, no de la regla por rol)', async () => {
    await assertFails(updateDoc(doc(dbAnon(), REF), avalFisico('ingrid')))
  }, TIMEOUT)
})

// ───────────────────────── el colado de un "físico" por la rama app ─────────────────────────

describe('rama APP — no puede colar un aval físico sin custodia ni declaración', () => {
  it("76. sst escribe origen:'fisico' SIN registro → denegado", async () => {
    await assertFails(upd('sofia', avalApp('sofia', 'al_dia', { origen: 'fisico' })))
  }, TIMEOUT)

  it('77. sst escribe un bloque fisico por la rama app → denegado', async () => {
    await assertFails(upd('sofia', avalApp('sofia', 'al_dia', { fisico: { responsable_archivo: 'x', declaracion: true } })))
  }, TIMEOUT)

  it("78. residente_sst escribe origen:'fisico' sin registro → denegado", async () => {
    await assertFails(upd('ramiro', avalApp('ramiro', 'al_dia', { origen: 'fisico' })))
  }, TIMEOUT)

  it('79. gestion_integral por la rama app con bloque fisico incompleto → denegado', async () => {
    await assertFails(upd('ingrid', avalApp('ingrid', 'al_dia', { fisico: { responsable_archivo: '' } })))
  }, TIMEOUT)

  it("80. origen desconocido ('otro') → denegado", async () => {
    await assertFails(upd('sofia', avalApp('sofia', 'al_dia', { origen: 'otro' })))
  }, TIMEOUT)
})

// ───────────────────────── el aval por APP sigue igual (regresión) ─────────────────────────

describe('rama APP — sin cambio para quien ya operaba', () => {
  it('81. sst avala al_dia (sin origen) → permitido', async () => {
    await assertSucceeds(upd('sofia', avalApp('sofia')))
  }, TIMEOUT)

  it("82. residente_sst avala al_dia con origen:'app' explícito → permitido", async () => {
    await assertSucceeds(upd('ramiro', avalApp('ramiro', 'al_dia', { origen: 'app' })))
  }, TIMEOUT)

  it('83. gestion_integral avala por app (ya lo hacía desde el 07-sep) → permitido', async () => {
    await assertSucceeds(upd('ingrid', avalApp('ingrid')))
  }, TIMEOUT)

  it('84. sst registra una NOVEDAD con observación → permitido', async () => {
    await assertSucceeds(upd('sofia', avalApp('sofia', 'con_novedad', { observacion: 'faltan permisos de alturas' })))
  }, TIMEOUT)

  it('85. RECHAZO: una entrada de historial SUELTA (sin cambio del gate) — la traza va atada al gate', async () => {
    await assertFails(upd('sofia', {
      fecha_actualizacion: Timestamp.now(),
      historial: arrayUnion({ de: 'pendiente', a: 'pendiente', por: 'sofia', fecha: Timestamp.now(), motivo: 'nota' }),
    }))
  }, TIMEOUT)

  it('86. tras un aval físico, SST puede registrar una novedad que lo sobrescribe (la traza queda en historial) → permitido', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    await assertSucceeds(upd('sofia', avalApp('sofia', 'con_novedad', { observacion: 'el registro de custodia está incompleto' })))
  }, TIMEOUT)

  it('87. y tras esa novedad, ingrid puede avalar físico de nuevo (con historial acumulado) → permitido', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    await assertSucceeds(upd('sofia', avalApp('sofia', 'con_novedad', { observacion: 'incompleto' })))
    await assertSucceeds(upd('ingrid', avalFisico('ingrid', { ent: e => { e.de = 'con_novedad' } })))
  }, TIMEOUT)

  for (const [a, rol] of [['sofia', 'sst'], ['ramiro', 'residente_sst'], ['ingrid', 'gestion_integral']] as const) {
    it(`88. COMPATIBILIDAD con la UI de producción: el payload EXACTO de marcar() (${rol}, al_dia y con_novedad) → permitido`, async () => {
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

describe('rama APP — la atribución y la forma del gate no se falsifican', () => {
  it('89. RECHAZO: sst escribe verificado_por de OTRA persona (atribuir a Gestión Integral)', async () => {
    await assertFails(upd('sofia', avalApp('sofia', 'al_dia', { verificado_por: 'ingrid' })))
  }, TIMEOUT)

  it('90. RECHAZO: clave extra en sst_gate por la rama app', async () => {
    await assertFails(upd('sofia', avalApp('sofia', 'al_dia', { colado: true })))
  }, TIMEOUT)

  it("91. RECHAZO: estado inválido ('aprobado_por_telefono')", async () => {
    await assertFails(upd('sofia', avalApp('sofia', 'aprobado_por_telefono')))
  }, TIMEOUT)

  it('92. RECHAZO: con_novedad SIN observación / de solo espacios / de 5.000 caracteres', async () => {
    await assertFails(upd('sofia', avalApp('sofia', 'con_novedad')))
    await assertFails(upd('sofia', avalApp('sofia', 'con_novedad', { observacion: '    ' })))
    await assertFails(upd('sofia', avalApp('sofia', 'con_novedad', { observacion: 'x'.repeat(5000) })))
  }, TIMEOUT)

  it('93. observación de exactamente 2000 caracteres → permitido; de 2001 → rechazo', async () => {
    await assertSucceeds(upd('sofia', avalApp('sofia', 'con_novedad', { observacion: 'x'.repeat(2000) })))
    await assertFails(upd('ramiro', avalApp('ramiro', 'con_novedad', { observacion: 'x'.repeat(2001) })))
  }, TIMEOUT)

  it('94. RECHAZO: sst_gate que no es un mapa (string / null)', async () => {
    await assertFails(upd('sofia', { sst_gate: 'al_dia' }))
    await assertFails(upd('sofia', { sst_gate: null }))
  }, TIMEOUT)

  it('95. RECHAZO: sst_gate sin fecha / con fecha de otro tipo / sin verificado_por / origen null', async () => {
    const h = arrayUnion({ de: 'pendiente', a: 'al_dia', por: 'sofia', fecha: Timestamp.now(), motivo: 'x' })
    await assertFails(upd('sofia', { sst_gate: { estado: 'al_dia', verificado_por: 'sofia' }, historial: h }))
    await assertFails(upd('sofia', avalApp('sofia', 'al_dia', { fecha: 'hoy' })))
    await assertFails(upd('sofia', { sst_gate: { estado: 'al_dia', fecha: Timestamp.now() }, historial: h }))
    await assertFails(upd('sofia', avalApp('sofia', 'al_dia', { origen: null })))
  }, TIMEOUT)

  it('96. RECHAZO: cambiar el gate SIN dejar entrada en el historial (rama app, cliente no-UI)', async () => {
    await assertFails(upd('sofia', {
      sst_gate: { estado: 'al_dia', verificado_por: 'sofia', fecha: Timestamp.now() },
      fecha_actualizacion: Timestamp.now(),
    }))
  }, TIMEOUT)

  it("97. RECHAZO: la entrada del historial no coincide con el estado que quedó ('a' ≠ estado)", async () => {
    await assertFails(upd('sofia', {
      sst_gate: { estado: 'al_dia', verificado_por: 'sofia', fecha: Timestamp.now() },
      historial: arrayUnion({ de: 'pendiente', a: 'con_novedad', por: 'sofia', fecha: Timestamp.now(), motivo: 'x' }),
    }))
  }, TIMEOUT)

  it('98. RECHAZO: dot-path sobre un gate FÍSICO por la rama app (no se puede retocar parcialmente)', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    await assertFails(upd('sofia', { 'sst_gate.estado': 'con_novedad' }))
    await assertFails(upd('sofia', { 'sst_gate.fisico.motivo': 'reescrito por otra persona' }))
    await assertFails(upd('sofia', { 'sst_gate.fisico.declaracion': false }))
  }, TIMEOUT)

  it('99. RECHAZO: ingrid edita sst_gate.fisico DESPUÉS del aval sin re-presentar el registro completo', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    await assertFails(upd('ingrid', { 'sst_gate.fisico.motivo': 'cambiado después, sin traza en el historial' }))
    await assertFails(upd('ingrid', { 'sst_gate.fisico.declaracion': false }))
  }, TIMEOUT)

  it('100. BORRAR sst_gate (deleteField) sigue permitido — CON traza — y deja el gate en pendiente (cierra el pago)', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    await assertSucceeds(upd('sofia', {
      sst_gate: deleteField(), fecha_actualizacion: Timestamp.now(),
      historial: arrayUnion({ de: 'al_dia', a: 'pendiente', por: 'sofia', fecha: Timestamp.now(), motivo: 'gate retirado' }),
    }))
  }, TIMEOUT)

  it('100b. RECHAZO: BORRAR sst_gate SIN dejar traza de quién lo hizo (la cadena de la habilitación no se pierde)', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    await assertFails(upd('sofia', { sst_gate: deleteField(), fecha_actualizacion: Timestamp.now() }))
    await assertFails(upd('ingrid', { sst_gate: deleteField(), fecha_actualizacion: Timestamp.now() }))
  }, TIMEOUT)
})

// ───────────────────────── historial append-only ─────────────────────────

describe('`historial` es append-only para los 3 roles — también en writes que NO tocan sst_gate', () => {
  const previo = [{ de: 'pendiente', a: 'con_novedad', por: 'sofia', fecha: Timestamp.now(), motivo: 'faltan permisos' }]
  const conPrevio = async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await updateDoc(doc(ctx.firestore(), REF), { historial: previo }) })
  }
  const entrada = (extra: Record<string, any> = {}) =>
    ({ de: 'con_novedad', a: 'con_novedad', por: 'sofia', fecha: Timestamp.now(), motivo: 'nota', ...extra })

  for (const [a, rol] of [['sofia', 'sst'], ['ramiro', 'residente_sst'], ['ingrid', 'gestion_integral']] as const) {
    it(`101. RECHAZO: ${rol} VACÍA el historial (updateDoc historial: [])`, async () => {
      await conPrevio()
      await assertFails(upd(a, { fecha_actualizacion: Timestamp.now(), historial: [] }))
    }, TIMEOUT)

    it(`102. RECHAZO: ${rol} REEMPLAZA el historial por uno inventado`, async () => {
      await conPrevio()
      await assertFails(upd(a, { historial: [{ de: 'pendiente', a: 'al_dia', por: a, fecha: Timestamp.now(), motivo: 'reescrito' }] }))
    }, TIMEOUT)
  }

  it('103. RECHAZO: recortar el historial (borrar la entrada vieja y dejar una nueva)', async () => {
    await conPrevio()
    await assertFails(upd('sofia', { historial: [entrada()] }))
  }, TIMEOUT)

  it("104. RECHAZO: agregar una entrada atribuida a OTRA persona ('por')", async () => {
    await conPrevio()
    await assertFails(upd('sofia', { historial: arrayUnion(entrada({ por: 'ingrid' })) }))
  }, TIMEOUT)

  it('105. RECHAZO: agregar DOS entradas de una vez', async () => {
    await conPrevio()
    await assertFails(upd('sofia', { historial: arrayUnion(entrada({ motivo: 'a' }), entrada({ motivo: 'b' })) }))
  }, TIMEOUT)

  it('106. RECHAZO: agregar UNA entrada propia SIN cambiar el gate (entradas sueltas fechadas a gusto)', async () => {
    await conPrevio()
    await assertFails(upd('sofia', { historial: arrayUnion(entrada()) }))
  }, TIMEOUT)

  it('106b. CONTROL: UNA entrada propia JUNTO con el cambio del gate a un historial existente → permitido', async () => {
    await conPrevio()
    await assertSucceeds(upd('sofia', {
      sst_gate: { estado: 'con_novedad', verificado_por: 'sofia', fecha: Timestamp.now(), observacion: 'x' },
      historial: arrayUnion(entrada({ de: 'pendiente', a: 'con_novedad' })),
    }))
  }, TIMEOUT)

  it('107. CONTROL: un write que no toca historial ni gate (solo fecha_actualizacion) → permitido', async () => {
    await conPrevio()
    await assertSucceeds(upd('sofia', { fecha_actualizacion: Timestamp.now() }))
  }, TIMEOUT)

  it('108. RECHAZO: historial que no es una lista / deleteField con traza previa', async () => {
    await conPrevio()
    await assertFails(upd('sofia', { historial: 'x' }))
    await assertFails(upd('sofia', { historial: deleteField() }))
  }, TIMEOUT)

  it('109. RECHAZO: la entrada nueva no es un mapa / trae claves extra / motivo de 2.501 / fecha o "a" inválidos', async () => {
    await conPrevio()
    await assertFails(upd('sofia', { historial: arrayUnion('texto suelto') }))
    await assertFails(upd('sofia', { historial: arrayUnion(entrada({ colado: true })) }))
    await assertFails(upd('sofia', { historial: arrayUnion(entrada({ motivo: 'x'.repeat(2501) })) }))
    await assertFails(upd('sofia', { historial: arrayUnion(entrada({ fecha: 'hoy' })) }))
    await assertFails(upd('sofia', { historial: arrayUnion(entrada({ a: 'aprobado_por_telefono' })) }))
  }, TIMEOUT)

  it('110. RECHAZO: sst inventa una COPIA de custodia en la traza (sin gate físico)', async () => {
    await conPrevio()
    await assertFails(upd('sofia', {
      historial: arrayUnion(entrada({ fisico: { responsable_archivo: 'Inventado', declaracion: true } })),
    }))
  }, TIMEOUT)
})

// ───────────────────────── lo que NO cambia ─────────────────────────

describe('lo que no cambia', () => {
  it('111. ingrid no puede tocar otros campos del doc (hasOnly intacto)', async () => {
    await assertFails(upd('ingrid', { ...avalFisico('ingrid'), estado: 'liquidado_contratista' }))
    await assertFails(upd('ingrid', { contratista_nombre: 'otro' }))
  }, TIMEOUT)

  it('112. LECTURA: sst, residente_sst, gestion_integral, admin y las dos gerencias leen', async () => {
    for (const a of ['sofia', 'ramiro', 'ingrid', 'root', 'marcela', 'giovanny'] as Actor[]) {
      await assertSucceeds(getDoc(doc(db(a), REF)))
    }
  }, TIMEOUT)

  it('113. LECTURA: director_proyectos, comercial y residente_obra NO leen la proyección', async () => {
    for (const a of ['diego', 'karen', 'cesar'] as Actor[]) {
      await assertFails(getDoc(doc(db(a), REF)))
    }
    await assertFails(getDocs(collection(db('diego'), 'verificaciones_sst')))
  }, TIMEOUT)

  it('114. nadie crea ni borra la proyección (solo la CF, Admin SDK) — ni ingrid', async () => {
    await assertFails(setDoc(doc(db('ingrid'), 'verificaciones_sst/pry_nuevo'), proyeccion({ proyecto_id: 'pry_nuevo' })))
    await assertFails(deleteDoc(doc(db('ingrid'), REF)))
    await assertFails(deleteDoc(doc(db('root'), REF)))
  }, TIMEOUT)
})

// ───────────────────────── integración con la liquidación ─────────────────────────

describe('integración — el aval físico libera la liquidación (y sin aval no)', () => {
  const PROY = 'pry_001'
  const sembrarProyecto = async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `proyectos/${PROY}`), {
        consecutivo: 'PRY-2026-040', estado: 'pagado_cliente', historial: [], pago_cliente: { valor: 1000 },
      })
    })
  }
  const liquidar = () => updateDoc(doc(db('diego'), `proyectos/${PROY}`), { estado: 'liquidado_contratista' })

  it('115. RECHAZO: sin aval del gate no se liquida (actor: director_proyectos, que SÍ gestiona proyectos)', async () => {
    await sembrarProyecto()
    await assertFails(liquidar())
  }, TIMEOUT)

  it('116. con el aval FÍSICO de gestion_integral → se liquida', async () => {
    await sembrarProyecto()
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    await assertSucceeds(liquidar())
  }, TIMEOUT)

  it('117. con una NOVEDAD vigente no se liquida', async () => {
    await sembrarProyecto()
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    await assertSucceeds(upd('sofia', avalApp('sofia', 'con_novedad', { observacion: 'el registro de custodia está incompleto' })))
    await assertFails(liquidar())
  }, TIMEOUT)

  it('118. tras un aval físico, borrar sst_gate y luego intentar liquidar → denegado', async () => {
    await sembrarProyecto()
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    await assertSucceeds(upd('sofia', {
      sst_gate: deleteField(), fecha_actualizacion: Timestamp.now(),
      historial: arrayUnion({ de: 'al_dia', a: 'pendiente', por: 'sofia', fecha: Timestamp.now(), motivo: 'gate retirado' }),
    }))
    await assertFails(liquidar())
  }, TIMEOUT)
})

// ═════════════ REFINAMIENTO: la declaración es INMUTABLE (corregir = aval NUEVO) ═════════════

describe('declaración inmutable — corregir es un aval físico NUEVO; el anterior permanece', () => {
  /** Lee el doc saltándose reglas. */
  const leer = async () => {
    let data: any
    await env.withSecurityRulesDisabled(async (ctx) => { data = (await getDoc(doc(ctx.firestore(), REF))).data() })
    return data
  }

  it('119. CONTROL: ingrid corrige con un aval físico NUEVO (contenido distinto, de="al_dia") → permitido', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    await assertSucceeds(upd('ingrid', avalFisico('ingrid', {
      fis: f => { f.responsable_archivo = 'Nuevo Custodio'; f.ubicacion = 'Archivador 7, carpeta Claro 2027' },
      ent: e => { e.de = 'al_dia' },
    })))
  }, TIMEOUT)

  it('120. tras la corrección, el historial conserva AMBAS declaraciones y el gate lleva la nueva', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    await assertSucceeds(upd('ingrid', avalFisico('ingrid', {
      fis: f => { f.responsable_archivo = 'Nuevo Custodio' }, ent: e => { e.de = 'al_dia' },
    })))
    const d = await leer()
    const fisicas = d.historial.filter((h: any) => h.fisico)
    if (fisicas.length !== 2) throw new Error(`se esperaban 2 declaraciones en el historial, hay ${fisicas.length}`)
    if (fisicas[0].fisico.responsable_archivo !== 'Marcela Torres') throw new Error('la declaración anterior no permaneció intacta')
    if (fisicas[1].fisico.responsable_archivo !== 'Nuevo Custodio') throw new Error('la nueva no quedó en el historial')
    if (d.sst_gate.fisico.responsable_archivo !== 'Nuevo Custodio') throw new Error('el gate no lleva la declaración nueva')
    if (+d.sst_gate.fisico.fecha_registro.toMillis() === +fisicas[0].fisico.fecha_registro.toMillis()) {
      throw new Error('la declaración nueva reutilizó la fecha_registro anterior')
    }
  }, TIMEOUT)

  it('121. RECHAZO: reescribir el físico previo MANTENIENDO su fecha_registro (la fecha debe ser la del servidor)', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    const previo = (await leer()).sst_gate
    await assertFails(upd('ingrid', avalFisico('ingrid', {
      fis: f => { f.motivo = 'Motivo reescrito en sitio, misma fecha'; f.fecha_registro = previo.fisico.fecha_registro },
      gate: g => { g.fecha = previo.fecha },
      ent: e => { e.de = 'al_dia' },
    })))
  }, TIMEOUT)

  it('122. RECHAZO: reescribir el físico previo con fecha_registro vieja, sin entrada nueva en el historial', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    const previo = (await leer()).sst_gate
    await assertFails(upd('ingrid', {
      sst_gate: { ...previo, fisico: { ...previo.fisico, ubicacion: 'Otro lugar distinto de antes' } },
      fecha_actualizacion: Timestamp.now(),
    }))
  }, TIMEOUT)

  it('123. RECHAZO: editar en sitio una declaración YA copiada al historial (tamaño igual, contenido distinto)', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    const d = await leer()
    const alterado = d.historial.map((h: any) => h.fisico ? { ...h, fisico: { ...h.fisico, motivo: 'Motivo alterado a posteriori' } } : h)
    await assertFails(upd('ingrid', { historial: alterado }))
    await assertFails(upd('sofia', { historial: alterado }))
  }, TIMEOUT)

  it('124. RECHAZO: borrar la declaración anterior del historial al registrar la corrección', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    const nueva = {
      de: 'al_dia', a: 'al_dia', por: 'ingrid', fecha: Timestamp.now(), motivo: 'corrección',
      fisico: { responsable_archivo: 'Nuevo Custodio', ubicacion: 'Archivador 7, carpeta Claro 2027',
        fecha_formatos: dias(1), tipos_formato: ['ats'], motivo: 'Corrección de custodia por traslado',
        declaracion: true, declaracion_version: 'SST-FIS-v1', declaracion_email: emailDe('ingrid'), registrado_por: 'ingrid', fecha_registro: Timestamp.now() },
    }
    await assertFails(upd('ingrid', avalFisico('ingrid', {
      fis: f => { f.responsable_archivo = 'Nuevo Custodio' },
      historial: [nueva],   // reemplaza el historial: la declaración anterior desaparece
    })))
  }, TIMEOUT)

  it('125. la corrección NO la puede hacer otro rol (sst/residente_sst) aunque copie el contenido → denegado', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    await assertFails(upd('sofia', avalFisico('sofia', { ent: e => { e.de = 'al_dia' } })))
    await assertFails(upd('ramiro', avalFisico('ramiro', { ent: e => { e.de = 'al_dia' } })))
  }, TIMEOUT)

  it('126. si SST sobrescribe por la rama app, la declaración física anterior PERMANECE en el historial', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    await assertSucceeds(upd('sofia', avalApp('sofia', 'con_novedad', { observacion: 'el archivo no se encontró' })))
    const d = await leer()
    if (d.sst_gate.origen === 'fisico') throw new Error('el gate debería haber dejado de ser físico')
    if (!d.historial.some((h: any) => h.fisico?.responsable_archivo === 'Marcela Torres')) {
      throw new Error('la declaración física desapareció del historial')
    }
  }, TIMEOUT)
})

// ═════════════ SEGUNDA REVISIÓN OPUS: traza atada al gate, topes anti-inflado ═════════════

describe('traza — entradas con fecha acotada, `de` válido y atadas al cambio del gate', () => {
  const dosAnios = Timestamp.fromMillis(Date.now() - 730 * 86_400_000)
  const conCambio = (entrada: Record<string, any>) => ({
    sst_gate: { estado: 'al_dia', verificado_por: 'sofia', fecha: Timestamp.now() },
    fecha_actualizacion: Timestamp.now(),
    historial: arrayUnion(entrada),
  })
  const e = (extra: Record<string, any> = {}) =>
    ({ de: 'pendiente', a: 'al_dia', por: 'sofia', fecha: Timestamp.now(), motivo: 'm', ...extra })

  it('127. CONTROL: entrada válida con el cambio del gate → permitido', async () => {
    await assertSucceeds(upd('sofia', conCambio(e())))
  }, TIMEOUT)

  it('128. RECHAZO: entrada a:"al_dia" FECHADA hace 2 años junto con un cambio de gate', async () => {
    await assertFails(upd('sofia', conCambio(e({ fecha: dosAnios }))))
  }, TIMEOUT)

  it('129. RECHAZO: entrada fechada en el FUTURO (+3 días)', async () => {
    await assertFails(upd('sofia', conCambio(e({ fecha: Timestamp.fromMillis(Date.now() + 3 * 86_400_000) }))))
  }, TIMEOUT)

  it('130. RECHAZO: gate.fecha de la rama app fechado hace 2 años', async () => {
    await assertFails(upd('sofia', {
      sst_gate: { estado: 'al_dia', verificado_por: 'sofia', fecha: dosAnios },
      historial: arrayUnion(e()),
    }))
  }, TIMEOUT)

  it("131. RECHAZO: 'de' inválido ('aprobado', 123, texto enorme)", async () => {
    await assertFails(upd('sofia', conCambio(e({ de: 'aprobado' }))))
    await assertFails(upd('sofia', conCambio(e({ de: 123 }))))
    await assertFails(upd('sofia', conCambio(e({ de: 'x'.repeat(100_000) }))))
  }, TIMEOUT)

  it('132. RECHAZO: la entrada no coincide con el estado que quedó en el gate', async () => {
    await assertFails(upd('sofia', conCambio(e({ a: 'con_novedad' }))))
  }, TIMEOUT)

  it('133. RECHAZO: entrada que acompaña un BORRADO del gate pero afirma "al_dia"', async () => {
    await assertSucceeds(upd('sofia', avalApp('sofia')))   // el gate existe: así el borrado SÍ lo cambia
    await assertFails(upd('sofia', {
      sst_gate: deleteField(), fecha_actualizacion: Timestamp.now(),
      historial: arrayUnion(e({ a: 'al_dia' })),
    }))
  }, TIMEOUT)

  it('134. CONTROL: borrar el gate dejando la traza honesta (a:"pendiente") → permitido', async () => {
    await assertSucceeds(upd('sofia', avalApp('sofia')))   // el gate existe: así el borrado SÍ lo cambia
    await assertSucceeds(upd('sofia', {
      sst_gate: deleteField(), fecha_actualizacion: Timestamp.now(),
      historial: arrayUnion(e({ de: 'al_dia', a: 'pendiente' })),
    }))
  }, TIMEOUT)

  it('135. RECHAZO: historial que ya tiene 300 entradas no admite una más (tope anti-inflado)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), REF), {
        historial: Array.from({ length: 300 }, (_, i) => ({ de: 'pendiente', a: 'pendiente', por: 'sofia', fecha: Timestamp.now(), motivo: `n${i}` })),
      })
    })
    await assertFails(upd('sofia', conCambio(e())))
  }, TIMEOUT)

  it('136. CONTROL: con 299 entradas todavía cabe una (borde del tope)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), REF), {
        historial: Array.from({ length: 299 }, (_, i) => ({ de: 'pendiente', a: 'pendiente', por: 'sofia', fecha: Timestamp.now(), motivo: `n${i}` })),
      })
    })
    await assertSucceeds(upd('sofia', conCambio(e())))
  }, TIMEOUT)
})

describe('tipos_formato — sin duplicados y de tamaño acotado', () => {
  const caso = (n: number, titulo: string, tipos: unknown[]) =>
    it(`${n}. RECHAZO: ${titulo}`, async () => {
      await assertFails(upd('ingrid', avalFisico('ingrid', { fis: f => { f.tipos_formato = tipos } })))
    }, TIMEOUT)

  caso(137, 'elementos duplicados', ['ats', 'ats'])
  // RESIDUAL DOCUMENTADO: `join` no falla con números/null (lo coacciona), así que
  // [1] y [null] pasan. Es inofensivo — ≤20 elementos y la suma ya está acotada —
  // y cerrarlo exigiría acoplar la regla al catálogo de formatos (decisión previa:
  // la regla solo valida lista no vacía). Se fija para que cambiarlo sea consciente.
  it('138. RESIDUAL: un elemento numérico ([1]) pasa (acotado, inofensivo)', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid', { fis: f => { f.tipos_formato = [1] } })))
  }, TIMEOUT)
  it('139. RESIDUAL: un elemento null ([null]) pasa (acotado, inofensivo)', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid', { fis: f => { f.tipos_formato = [null] } })))
  }, TIMEOUT)
  caso(140, 'un elemento mapa', [{}])
  caso(141, 'un elemento de 100.000 caracteres (inflaría el doc)', ['x'.repeat(100_000)])
  caso(142, 'suma de tamaños sobre 1000 caracteres', Array.from({ length: 10 }, (_, i) => `${i}`.repeat(110)))

  it('143. CONTROL: los 14 tipos de la app + otro (con su nombre) caben → permitido', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid', {
      fis: f => {
        f.tipos_formato = ['preoperacional', 'ats', 'charla', 'permiso_alturas', 'permiso_caliente', 'inspeccion_herramientas',
          'inspeccion_epp', 'inspeccion_escaleras', 'inspeccion_arnes', 'inspeccion_tieoff', 'inspeccion_instalaciones',
          'inspeccion_hseq', 'reporte_actos', 'emergencia', 'otro']
        f.formato_otro = 'Formato del cliente'
      },
    })))
  }, TIMEOUT)
})

describe('el payload REAL del builder pasa — incluido el peor caso de tamaño', () => {
  it('144. patchAvalFisico con tres textos de 2000 caracteres → permitido (la leyenda del historial se recorta)', async () => {
    const ahora = Timestamp.now()
    const p = patchAvalFisico(
      {
        responsable_archivo: 'r'.repeat(2000), ubicacion: 'u'.repeat(2000), fecha_formatos: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
        tipos_formato: ['ats', 'otro'], formato_otro: 'o'.repeat(2000), motivo: 'm'.repeat(2000), declaracion: true,
      },
      'ingrid', emailDe('ingrid'), 'pendiente', serverTimestamp(), ahora, Timestamp.fromMillis(fechaFormatosATimestampMs(new Date(Date.now() - 86_400_000).toISOString().slice(0, 10))),
    )
    if (!p) throw new Error('el builder no debería rechazar una entrada válida')
    await assertSucceeds(upd('ingrid', {
      sst_gate: p.sst_gate, fecha_actualizacion: serverTimestamp(), historial: arrayUnion(p.entradaHistorial),
    }))
  }, TIMEOUT)

  it('145. patchAvalFisico con una entrada normal → permitido', async () => {
    const ayer = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    const p = patchAvalFisico(
      { responsable_archivo: 'Marcela Torres', ubicacion: 'Archivador 3, carpeta Claro 2026', fecha_formatos: ayer,
        tipos_formato: ['ats'], motivo: 'Exigencia del cliente en sitio', declaracion: true },
      'ingrid', emailDe('ingrid'), 'pendiente', serverTimestamp(), Timestamp.now(), Timestamp.fromMillis(fechaFormatosATimestampMs(ayer)),
    )!
    await assertSucceeds(upd('ingrid', { sst_gate: p.sst_gate, fecha_actualizacion: serverTimestamp(), historial: arrayUnion(p.entradaHistorial) }))
  }, TIMEOUT)
})

// ═════════════ DECISIÓN SIGP: declaración versionada + correo auténtico ═════════════

describe('declaracion_version y declaracion_email — validados en la regla (actor ingrid, un elemento roto a la vez)', () => {
  const caso = (n: number, titulo: string, m: Mutadores) =>
    it(`${n}. RECHAZO: ${titulo}`, async () => {
      await assertFails(upd('ingrid', avalFisico('ingrid', m)))
    }, TIMEOUT)

  it('146. CONTROL: versión SST-FIS-v1 + correo igual al del token → permitido', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
  }, TIMEOUT)

  caso(147, 'sin declaracion_version', { fis: f => { delete f.declaracion_version } })
  caso(148, "declaracion_version desconocida ('SST-FIS-v9')", { fis: f => { f.declaracion_version = 'SST-FIS-v9' } })
  caso(149, "declaracion_version vacía / otro tipo", { fis: f => { f.declaracion_version = '' } })
  caso(150, 'declaracion_version numérica', { fis: f => { f.declaracion_version = 1 } })
  caso(151, 'sin declaracion_email', { fis: f => { delete f.declaracion_email } })
  caso(152, 'declaracion_email TECLEADO de otra persona (no es el del token)', { fis: f => { f.declaracion_email = emailDe('sofia') } })
  caso(153, 'declaracion_email con otra capitalización (no coincide con el token)', { fis: f => { f.declaracion_email = 'INGRID@test.dev' } })
  caso(154, 'declaracion_email vacío', { fis: f => { f.declaracion_email = '' } })
  caso(155, 'declaracion_email no es string', { fis: f => { f.declaracion_email = 123 } })
  caso(156, 'la copia del historial dice otro correo', { ent: e => { e.fisico = { ...e.fisico, declaracion_email: emailDe('sofia') } } })
  caso(157, 'la copia del historial dice otra versión', { ent: e => { e.fisico = { ...e.fisico, declaracion_version: 'SST-FIS-v9' } } })
  caso(158, 'la copia del historial SIN correo ni versión', { ent: e => { delete e.fisico.declaracion_email; delete e.fisico.declaracion_version } })

  it('159. un token SIN correo (cuenta sin email) no puede avalar físico → denegado', async () => {
    const sinEmail = env.authenticatedContext('ingrid').firestore()
    await assertFails(updateDoc(doc(sinEmail, REF), avalFisico('ingrid')))
  }, TIMEOUT)

  it('160. quien tiene OTRO correo en su token no puede reutilizar el de ingrid (suplantación de identidad legible)', async () => {
    const otroCorreo = env.authenticatedContext('ingrid', { email: 'otra@test.dev' }).firestore()
    await assertFails(updateDoc(doc(otroCorreo, REF), avalFisico('ingrid')))    // el payload dice ingrid@test.dev
  }, TIMEOUT)

  it('161. el correo y la versión quedan en el gate y en la copia del historial', async () => {
    await assertSucceeds(upd('ingrid', avalFisico('ingrid')))
    let d: any
    await env.withSecurityRulesDisabled(async (ctx) => { d = (await getDoc(doc(ctx.firestore(), REF))).data() })
    const copia = d.historial.find((h: any) => h.fisico).fisico
    if (d.sst_gate.fisico.declaracion_email !== 'ingrid@test.dev' || copia.declaracion_email !== 'ingrid@test.dev') throw new Error('correo no registrado')
    if (d.sst_gate.fisico.declaracion_version !== 'SST-FIS-v1' || copia.declaracion_version !== 'SST-FIS-v1') throw new Error('versión no registrada')
  }, TIMEOUT)
})

// ═════════════ TERCERA PASADA OPUS (final) ═════════════

describe('endurecimientos finales — fecha de la copia, tope del motivo, borrado con traza, correo', () => {
  const e = (extra: Record<string, any> = {}) =>
    ({ de: 'pendiente', a: 'al_dia', por: 'sofia', fecha: Timestamp.now(), motivo: 'm', ...extra })
  const conCambio = (entrada: Record<string, any>) => ({
    sst_gate: { estado: 'al_dia', verificado_por: 'sofia', fecha: Timestamp.now() },
    fecha_actualizacion: Timestamp.now(),
    historial: arrayUnion(entrada),
  })

  it('162. RECHAZO: la copia con fecha_registro ABSURDA (2020) distinta de la fecha de la entrada', async () => {
    await assertFails(upd('ingrid', avalFisico('ingrid', {
      ent: x => { x.fisico.fecha_registro = Timestamp.fromMillis(Date.parse('2020-01-01')) },
    })))
  }, TIMEOUT)

  it('163. RECHAZO: la copia con fecha_registro != fecha de la entrada (aunque ambas sean recientes)', async () => {
    await assertFails(upd('ingrid', avalFisico('ingrid', {
      ent: x => { x.fisico.fecha_registro = Timestamp.fromMillis(x.fecha.toMillis() + 60_000) },
    })))
  }, TIMEOUT)

  it('164. el motivo de la entrada: 2500 caracteres pasa, 2501 no (tope anti-inflado)', async () => {
    await assertSucceeds(upd('sofia', conCambio(e({ motivo: 'x'.repeat(2500) }))))
    // mismo actor y mismo payload válido: la ÚNICA diferencia es 1 carácter de motivo
    await env.withSecurityRulesDisabled(async (ctx) => { await updateDoc(doc(ctx.firestore(), REF), { sst_gate: deleteField(), historial: deleteField() }) })
    await assertFails(upd('sofia', conCambio(e({ motivo: 'x'.repeat(2501) }))))
  }, TIMEOUT)

  it('165. RECHAZO: token SIN correo con declaracion_email vacío (no se cuela si alguien "arregla" token.email)', async () => {
    const sinEmail = env.authenticatedContext('ingrid').firestore()
    await assertFails(updateDoc(doc(sinEmail, REF), avalFisico('ingrid', { fis: f => { f.declaracion_email = '' } })))
  }, TIMEOUT)

  it('166. RECHAZO: declaracion_email de menos de 3 caracteres', async () => {
    const corto = env.authenticatedContext('ingrid', { email: 'a@' }).firestore()
    await assertFails(updateDoc(doc(corto, REF), avalFisico('ingrid', { fis: f => { f.declaracion_email = 'a@' } })))
  }, TIMEOUT)

  it('167. DECISIÓN DOCUMENTADA: email_verified=false NO bloquea el aval físico (las cuentas del panel nacen sin verificar)', async () => {
    const noVerificado = env.authenticatedContext('ingrid', { email: emailDe('ingrid'), email_verified: false }).firestore()
    await assertSucceeds(updateDoc(doc(noVerificado, REF), avalFisico('ingrid')))
  }, TIMEOUT)

  it('168. el aval físico con el payload REAL del builder sigue pasando (fecha de la copia == fecha de la entrada)', async () => {
    const ayer = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    const p = patchAvalFisico(
      { responsable_archivo: 'Marcela Torres', ubicacion: 'Archivador 3, carpeta Claro 2026', fecha_formatos: ayer,
        tipos_formato: ['ats'], motivo: 'Exigencia del cliente en sitio', declaracion: true },
      'ingrid', emailDe('ingrid'), 'pendiente', serverTimestamp(), Timestamp.now(), Timestamp.fromMillis(fechaFormatosATimestampMs(ayer)),
    )!
    await assertSucceeds(upd('ingrid', { sst_gate: p.sst_gate, fecha_actualizacion: serverTimestamp(), historial: arrayUnion(p.entradaHistorial) }))
  }, TIMEOUT)
})

describe('REGRESIÓN — configuracion/horarios_personales (PR #155) sigue viva con estas reglas', () => {
  // La 3.ª revisión atrapó que una rama atrasada habría BORRADO este match al desplegar.
  const HP = 'configuracion/horarios_personales'
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), HP), { horarios: { sofia: '16:00' } })
    })
  }, TIMEOUT)

  it('169. sst y residente_sst LEEN su hora de cierre (la regla genérica de configuracion NO se lo permitiría)', async () => {
    await assertSucceeds(getDoc(doc(db('sofia'), HP)))
    await assertSucceeds(getDoc(doc(db('ramiro'), HP)))
  }, TIMEOUT)

  it('170. gerencia_administrativa ESCRIBE los horarios (la genérica solo dejaría a GG y admin)', async () => {
    await assertSucceeds(updateDoc(doc(db('marcela'), HP), { 'horarios.cesar': '15:30' }))
  }, TIMEOUT)

  it('171. sst NO escribe los horarios; anónimo no lee', async () => {
    await assertFails(updateDoc(doc(db('sofia'), HP), { 'horarios.sofia': '23:00' }))
    await assertFails(getDoc(doc(dbAnon(), HP)))
  }, TIMEOUT)
})
