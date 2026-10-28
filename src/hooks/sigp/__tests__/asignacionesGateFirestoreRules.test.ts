// @vitest-environment node
//
// Batería de la regla `proyectos/{id}/asignaciones/{aid}` — GATE SST en la
// transición hacia `liquidada` (cierre del hallazgo de la revisión de
// seguridad: la rama de GERENCIA no consultaba `verificaciones_sst`, así que
// el gate "no esquivable" solo se aplicaba en la UI de AsignacionesProyecto).
//
// PRINCIPIO (lección de método SB2.2): cada vía se prueba con el actor de
// MÍNIMO PRIVILEGIO que solo califica por ESA vía —
//   · marcela (gerencia_administrativa): SOLO la rama de gerencia
//     (no está en puedeCrearProyectos) → es el actor del bypass.
//   · diego (director_proyectos): SOLO la rama de gestores.
//   · root (admin) / giovanny (gerencia_general): ambas ramas.
//
// ESTRECHAMIENTO 26-oct (mandato: "una regla más ancha que la interfaz es una
// capacidad que nadie sabe que existe"): LIQUIDAR quedó acotado a
// gerencia_administrativa + admin (espejo de puedeLiquidarUI + respaldo
// declarado) — gerencia_general y gestion_integral ya no llegan a 'liquidada'
// por ninguna vía (B2b/A9/A10); sus vías de APROBAR preliquidación con
// salvedad siguen intactas (B2c).
//
// Los casos "BYPASS" son la reproducción: contra las reglas SIN el cierre
// deben fallar (el write pasa); con el cierre, denegados.
//
// NO forma parte del `npm test` por defecto. Se corre con:
//   npx firebase emulators:exec --project demo-neg --only firestore \
//     "npx vitest run --config vitest.emulator.config.ts src/hooks/sigp/__tests__/asignacionesGateFirestoreRules.test.ts"

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc, writeBatch, arrayUnion, Timestamp } from 'firebase/firestore'

const TIMEOUT = 30_000

const ROLES = {
  marcela: 'gerencia_administrativa',   // SOLO rama gerencia
  giovanny: 'gerencia_general',         // ambas ramas
  root: 'admin',                        // ambas ramas
  ingrid: 'gestion_integral',           // SOLO rama gerencia
  diego: 'director_proyectos',          // SOLO rama gestores
  karen: 'operacion_comercial',         // ninguna (fuera de proyectos desde §16)
  sofia: 'sst',                         // dueña del gate; sin acceso a asignaciones
} as const
type Actor = keyof typeof ROLES

const P1 = 'p1'
const P2 = 'p2'
const ASIG = (p: string, a = 'a1') => `proyectos/${p}/asignaciones/${a}`
// 28-oct (Parte A del bloque proyección/saldo): el gate es POR CONTRATISTA —
// la regla lee `{pid}__{contratista_id del resource}`. Los fixtures usan
// contratista_id 'c1'; sembrar el gate en el doc compuesto ES el contrato.
const GATE = (p: string, cid = 'c1') => `verificaciones_sst/${p}__${cid}`

let env: RulesTestEnvironment
const db = (a: Actor) => env.authenticatedContext(a).firestore()
const ts = () => Timestamp.now()

const gate = (estado: 'pendiente' | 'al_dia' | 'con_novedad') => ({
  proyecto_id: 'x', consecutivo: 'PRY-2026-001', estado: 'pagado_cliente',
  sst_gate: { estado, verificado_por: 'sofia', fecha: ts() },
})

const preliq = (extra?: Record<string, unknown>) => ({
  valor_alcance: 1_000_000, valor_contratista: 700_000, anticipo_pct: 50,
  definida_por: 'diego', fecha_definicion: ts(),
  aprobada_por: 'marcela', fecha_aprobacion: ts(),
  anticipo: { valor: 350_000, fecha: ts(), registrado_por: 'marcela' },
  ...extra,
})

const sinAnticipo = () => {
  const { anticipo: _a, ...resto } = preliq()
  return resto
}

const asigContratista = (extra?: Record<string, unknown>) => ({
  tipo: 'contratista', estado: 'anticipo_girado',
  contratista_id: 'c1', contratista_nombre: 'Héctor', atomos: ['g1'],
  preliquidacion: preliq(), historial: [], fecha_actualizacion: ts(),
  ...extra,
})

const asigDirecta = (extra?: Record<string, unknown>) => ({
  tipo: 'administracion_directa', estado: 'estimada',
  contratista_id: 'neg', contratista_nombre: 'NEG', atomos: ['g1'],
  historial: [], fecha_actualizacion: ts(),
  ...extra,
})

/** El patch EXACTO que arma patchLiquidarAsignacion (+ arrayUnion del historial). */
const liquidarPatch = (uid: string) => ({
  estado: 'liquidada',
  liquidacion: {
    mano_obra: 700_000, compras_reembolsos: [], ajustes_reconocidos: [], retenciones: [],
    total_final: 700_000, diferencia: 0, es_igual: true,
    anticipo_girado: 350_000, saldo_final: 350_000, liquidada_por: uid, fecha: ts(),
  },
  preliquidacion: preliq(),
  fecha_actualizacion: ts(),
  historial: arrayUnion({ de: 'anticipo_girado', a: 'liquidada', por: uid, fecha: ts(), motivo: 'Liquidación' }),
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-neg',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../../../firestore.rules'), 'utf8'),
      // emulators:exec exporta FIRESTORE_EMULATOR_HOST: sirve para correr en un puerto propio
      // cuando el 8080 lo ocupa otra sesión.
      host: (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')[0],
      port: Number((process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')[1]),
    },
  })
}, TIMEOUT)

afterAll(async () => { await env.cleanup() })

/** Estado base: P1 en pagado_cliente con una asignación girada y gate sembrado
 *  por cada test; P2 con gate propio para el aislamiento entre proyectos. */
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore()
    for (const [uid, rol] of Object.entries(ROLES)) {
      await setDoc(doc(d, 'users', uid), { nombre: uid, rol, estado: 'activo' })
    }
    await setDoc(doc(d, 'proyectos', P1), { estado: 'pagado_cliente', consecutivo: 'PRY-2026-001', historial: [] })
    await setDoc(doc(d, 'proyectos', P2), { estado: 'pagado_cliente', consecutivo: 'PRY-2026-002', historial: [] })
    await setDoc(doc(d, ASIG(P1)), asigContratista())
    await setDoc(doc(d, ASIG(P2)), asigContratista())
  })
}, TIMEOUT)

const sembrarGate = (p: string, g: ReturnType<typeof gate> | Record<string, unknown>) =>
  env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), GATE(p)), g) })

// ═══════════════ A. EL BYPASS — gerencia liquida sin aval (reproducción) ═══════════════

describe('A. BYPASS: liquidar una asignación de contratista SIN gate al_dia (actor: gerencia_administrativa)', () => {
  it('A1. gate PENDIENTE → denegado', async () => {
    await sembrarGate(P1, gate('pendiente'))
    await assertFails(updateDoc(doc(db('marcela'), ASIG(P1)), liquidarPatch('marcela')))
  }, TIMEOUT)

  it('A2. gate CON_NOVEDAD → denegado', async () => {
    await sembrarGate(P1, gate('con_novedad'))
    await assertFails(updateDoc(doc(db('marcela'), ASIG(P1)), liquidarPatch('marcela')))
  }, TIMEOUT)

  it('A3. proyección SIN campo sst_gate (ausente = pendiente) → denegado', async () => {
    await sembrarGate(P1, { proyecto_id: 'x', consecutivo: 'PRY-2026-001', estado: 'pagado_cliente' })
    await assertFails(updateDoc(doc(db('marcela'), ASIG(P1)), liquidarPatch('marcela')))
  }, TIMEOUT)

  it('A4. proyección INEXISTENTE (proyecto fuera del tramo administrativo) → denegado, falla cerrado', async () => {
    await assertFails(updateDoc(doc(db('marcela'), ASIG(P1)), liquidarPatch('marcela')))
  }, TIMEOUT)

  it('A5. el aval de OTRO proyecto no sirve: P1 pendiente, P2 al_dia → liquidar la de P1 denegado', async () => {
    await sembrarGate(P1, gate('pendiente'))
    await sembrarGate(P2, gate('al_dia'))
    await assertFails(updateDoc(doc(db('marcela'), ASIG(P1)), liquidarPatch('marcela')))
  }, TIMEOUT)

  for (const a of ['root', 'giovanny'] as Actor[]) {
    it(`A6. ${ROLES[a]} (también en la rama de gerencia) con gate pendiente → denegado`, async () => {
      await sembrarGate(P1, gate('pendiente'))
      await assertFails(updateDoc(doc(db(a), ASIG(P1)), liquidarPatch(a)))
    }, TIMEOUT)
  }

  it('A9. gestion_integral NO se avala y liquida: marca el gate al_dia (puede — contrato #154: origen app + traza) y luego liquida en otro write → denegado', async () => {
    await sembrarGate(P1, gate('pendiente'))
    await assertSucceeds(updateDoc(doc(db('ingrid'), GATE(P1)), {
      sst_gate: { estado: 'al_dia', verificado_por: 'ingrid', fecha: ts(), origen: 'app' },
      historial: arrayUnion({ de: 'pendiente', a: 'al_dia', por: 'ingrid', fecha: ts(), motivo: 'al día' }),
      fecha_actualizacion: ts(),
    }))
    await assertFails(updateDoc(doc(db('ingrid'), ASIG(P1)), liquidarPatch('ingrid')))
  }, TIMEOUT)

  it('A10. gestion_integral con el aval puesto por SST (al_dia) tampoco liquida — liquidar no es de su rol', async () => {
    await sembrarGate(P1, gate('al_dia'))
    await assertFails(updateDoc(doc(db('ingrid'), ASIG(P1)), liquidarPatch('ingrid')))
  }, TIMEOUT)

  it('A11. cambiar `tipo` a administracion_directa en el mismo write que liquida NO abre una exención (gate al_dia: cae por hasOnly)', async () => {
    await sembrarGate(P1, gate('al_dia'))
    await assertFails(updateDoc(doc(db('marcela'), ASIG(P1)), { ...liquidarPatch('marcela'), tipo: 'administracion_directa' }))
    await assertFails(updateDoc(doc(db('root'), ASIG(P1)), { ...liquidarPatch('root'), tipo: 'administracion_directa' }))
  }, TIMEOUT)

  it('A12. una asignación LEGACY (sin campo tipo) y gate pendiente → denegado; con al_dia → permitido', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const { tipo: _t, ...sinTipo } = asigContratista({ legacy: true })
      await setDoc(doc(ctx.firestore(), ASIG(P1, 'legacy')), sinTipo)
    })
    await sembrarGate(P1, gate('pendiente'))
    await assertFails(updateDoc(doc(db('marcela'), ASIG(P1, 'legacy')), liquidarPatch('marcela')))
    await sembrarGate(P1, gate('al_dia'))
    await assertSucceeds(updateDoc(doc(db('marcela'), ASIG(P1, 'legacy')), liquidarPatch('marcela')))
  }, TIMEOUT)

  it('A7. cancelada CON incurrido → liquidada con gate pendiente → denegado (la cancelación no es salida)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ASIG(P1)), asigContratista({
        estado: 'cancelada',
        cancelacion: { fecha: ts(), por: 'diego', motivo: 'x', incurrido: { anticipo: 350_000, reembolsos: 0, total: 350_000 } },
      }))
    })
    await sembrarGate(P1, gate('pendiente'))
    await assertFails(updateDoc(doc(db('marcela'), ASIG(P1)), liquidarPatch('marcela')))
  }, TIMEOUT)

  it('A8. lote atómico (asignación + resumen del padre) con gate pendiente → TODO el lote cae', async () => {
    await sembrarGate(P1, gate('pendiente'))
    const fs = db('marcela')
    const b = writeBatch(fs)
    b.update(doc(fs, ASIG(P1)), liquidarPatch('marcela'))
    b.update(doc(fs, 'proyectos', P1), { resumen_asignaciones: { liquidadas: 1 }, fecha_actualizacion: ts() })
    await assertFails(b.commit())
  }, TIMEOUT)
})

// ═══════════════ B. REGRESIÓN del flujo normal ═══════════════

describe('B. REGRESIÓN: el flujo normal de liquidación sigue vivo', () => {
  it('B1. gate AL_DIA → gerencia_administrativa liquida → permitido', async () => {
    await sembrarGate(P1, gate('al_dia'))
    await assertSucceeds(updateDoc(doc(db('marcela'), ASIG(P1)), liquidarPatch('marcela')))
  }, TIMEOUT)

  it('B2. admin con gate al_dia → permitido (respaldo de infraestructura DECLARADO en la regla)', async () => {
    await sembrarGate(P1, gate('al_dia'))
    await assertSucceeds(updateDoc(doc(db('root'), ASIG(P1)), liquidarPatch('root')))
  }, TIMEOUT)

  it('B2b. ESTRECHAMIENTO (26-oct): gerencia_general con gate al_dia NO liquida — la regla deja de ser más ancha que la UI (puedeLiquidarUI = GA; ninguna pantalla se lo ofrecía a GG)', async () => {
    await sembrarGate(P1, gate('al_dia'))
    await assertFails(updateDoc(doc(db('giovanny'), ASIG(P1)), liquidarPatch('giovanny')))
  }, TIMEOUT)

  it('B2c. REGRESIÓN del respaldo: gerencia_general sigue APROBANDO preliquidación con salvedad (su vía real, intacta)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ASIG(P1)), asigContratista({
        estado: 'preliquidacion_definida', preliquidacion: {
          valor_alcance: 1_000_000, valor_contratista: 700_000, anticipo_pct: 50,
          definida_por: 'diego', fecha_definicion: ts(),
        },
      }))
    })
    await sembrarGate(P1, gate('pendiente'))  // aprobar no pide gate
    await assertSucceeds(updateDoc(doc(db('giovanny'), ASIG(P1)), {
      estado: 'preliquidacion_aprobada',
      preliquidacion: {
        valor_alcance: 1_000_000, valor_contratista: 700_000, anticipo_pct: 50,
        definida_por: 'diego', fecha_definicion: ts(),
        aprobada_por: 'giovanny', fecha_aprobacion: ts(),
        salvedad: 'la titular está de permiso — respaldo PR #45',
      },
      fecha_actualizacion: ts(),
      historial: arrayUnion({ de: 'preliquidacion_definida', a: 'preliquidacion_aprobada', por: 'giovanny', fecha: ts(), motivo: 'respaldo con salvedad' }),
    }))
  }, TIMEOUT)

  it('B3. lote REAL de escribirAsignacion con gate al_dia: asignación + resumen del padre → permitido', async () => {
    await sembrarGate(P1, gate('al_dia'))
    const fs = db('marcela')
    const b = writeBatch(fs)
    b.update(doc(fs, ASIG(P1)), liquidarPatch('marcela'))
    b.update(doc(fs, 'proyectos', P1), { resumen_asignaciones: { liquidadas: 1 }, fecha_actualizacion: ts() })
    await assertSucceeds(b.commit())
  }, TIMEOUT)

  it('B4. PUENTE: última liquidación + padre a liquidado_contratista en el mismo lote, gate al_dia → permitido', async () => {
    await sembrarGate(P1, gate('al_dia'))
    const fs = db('marcela')
    const b = writeBatch(fs)
    b.update(doc(fs, ASIG(P1)), liquidarPatch('marcela'))
    b.update(doc(fs, 'proyectos', P1), {
      // El puente real escribe el resumen RECOMPUTADO del lote (A.4: la
      // coherencia — por_estado solo liquidada/cancelada, ≥1 liquidada).
      resumen_asignaciones: { por_estado: { liquidada: 1 }, total: 1 }, fecha_actualizacion: ts(),
      estado: 'liquidado_contratista',
      historial: arrayUnion({ de: 'pagado_cliente', a: 'liquidado_contratista', por: 'marcela', fecha: ts(), motivo: 'puente' }),
    })
    await assertSucceeds(b.commit())
  }, TIMEOUT)

  it('B5. cancelada CON incurrido → liquidada con gate al_dia → permitido', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ASIG(P1)), asigContratista({
        estado: 'cancelada',
        cancelacion: { fecha: ts(), por: 'diego', motivo: 'x', incurrido: { anticipo: 350_000, reembolsos: 0, total: 350_000 } },
      }))
    })
    await sembrarGate(P1, gate('al_dia'))
    await assertSucceeds(updateDoc(doc(db('marcela'), ASIG(P1)), liquidarPatch('marcela')))
  }, TIMEOUT)

  it('B6. los pasos ANTERIORES a liquidar no piden gate: gerencia gira el anticipo con gate pendiente → permitido', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ASIG(P1)), asigContratista({
        estado: 'preliquidacion_aprobada', preliquidacion: sinAnticipo(),
      }))
    })
    await sembrarGate(P1, gate('pendiente'))
    await assertSucceeds(updateDoc(doc(db('marcela'), ASIG(P1)), {
      estado: 'anticipo_girado', preliquidacion: preliq(), fecha_actualizacion: ts(),
      historial: arrayUnion({ de: 'preliquidacion_aprobada', a: 'anticipo_girado', por: 'marcela', fecha: ts(), motivo: 'giro' }),
    }))
  }, TIMEOUT)
})

describe('B7. Proyecto CANCELADO sin proyección: cancelada → liquidada queda CERRADA (decisión pendiente del dueño)', () => {
  it('cancelada con incurrido, padre en `cancelado`, SIN proyección → denegado (la UI tampoco lo ofrece: el builder exige pagado_cliente/facturado)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const d = ctx.firestore()
      await setDoc(doc(d, 'proyectos', P1), { estado: 'cancelado', consecutivo: 'PRY-2026-001', historial: [] })
      await setDoc(doc(d, ASIG(P1)), asigContratista({
        estado: 'cancelada',
        cancelacion: { fecha: ts(), por: 'diego', motivo: 'x', incurrido: { anticipo: 350_000, reembolsos: 0, total: 350_000 } },
      }))
    })
    const fs = db('marcela')
    const b = writeBatch(fs)
    b.update(doc(fs, ASIG(P1)), liquidarPatch('marcela'))
    b.update(doc(fs, 'proyectos', P1), { resumen_asignaciones: { liquidadas: 1 }, fecha_actualizacion: ts() })
    await assertFails(b.commit())
  }, TIMEOUT)
})

// ═══════════════ C. NO re-evaluar lo ya liquidado ═══════════════

describe('C. Una asignación YA liquidada no re-evalúa la transición', () => {
  it('C1. liquidada + gate después en con_novedad: gerencia agrega un reembolso (estado intacto) → permitido', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ASIG(P1)), asigContratista({ estado: 'liquidada', liquidacion: liquidarPatch('marcela').liquidacion }))
    })
    await sembrarGate(P1, gate('con_novedad'))
    await assertSucceeds(updateDoc(doc(db('marcela'), ASIG(P1)), {
      historial: arrayUnion({ de: 'liquidada', a: 'liquidada', por: 'marcela', fecha: ts(), motivo: 'nota' }),
      fecha_actualizacion: ts(),
    }))
  }, TIMEOUT)

  it('C2. liquidada y la proyección ya no existe: sigue editable (no se exige el aval otra vez)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ASIG(P1)), asigContratista({ estado: 'liquidada', liquidacion: liquidarPatch('marcela').liquidacion }))
    })
    await assertSucceeds(updateDoc(doc(db('marcela'), ASIG(P1)), { fecha_actualizacion: ts() }))
  }, TIMEOUT)
})

// ═══════════════ D. CANCELAR no es liquidar ═══════════════

describe('D. Cancelar una asignación NO pide gate (actor de la rama de gestores)', () => {
  const cancelar = () => ({
    estado: 'cancelada',
    cancelacion: { fecha: ts(), por: 'diego', motivo: 'se cae el frente', incurrido: { anticipo: 350_000, reembolsos: 0, total: 350_000 } },
    fecha_actualizacion: ts(),
    historial: arrayUnion({ de: 'anticipo_girado', a: 'cancelada', por: 'diego', fecha: ts(), motivo: 'cancela' }),
  })

  it('D1. director cancela con gate pendiente → permitido', async () => {
    await sembrarGate(P1, gate('pendiente'))
    await assertSucceeds(updateDoc(doc(db('diego'), ASIG(P1)), cancelar()))
  }, TIMEOUT)

  it('D2. director cancela SIN proyección (en ejecución) → permitido', async () => {
    await assertSucceeds(updateDoc(doc(db('diego'), ASIG(P1)), cancelar()))
  }, TIMEOUT)
})

// ═══════════════ E. Administración directa: no sale dinero a terceros ═══════════════

describe('E. Administración directa — sin gate (decisión 04-sep, ambas ramas)', () => {
  const cerrarDirecta = () => ({
    estado: 'liquidada',
    cierre_directa: { costo_real: 500_000, dias_reales: 3, cerrada_por: 'diego', fecha: ts() },
    fecha_actualizacion: ts(),
    historial: arrayUnion({ de: 'estimada', a: 'liquidada', por: 'diego', fecha: ts(), motivo: 'cierre' }),
  })

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), ASIG(P1)), asigDirecta()) })
  }, TIMEOUT)

  it('E1. gestor (director) cierra la directa sin proyección → permitido (rama de gestores intacta)', async () => {
    await assertSucceeds(updateDoc(doc(db('diego'), ASIG(P1)), cerrarDirecta()))
  }, TIMEOUT)

  it('E2. gestor cierra la directa con gate con_novedad → permitido', async () => {
    await sembrarGate(P1, gate('con_novedad'))
    await assertSucceeds(updateDoc(doc(db('diego'), ASIG(P1)), cerrarDirecta()))
  }, TIMEOUT)

  it('E3. gerencia (marcela) NO lleva la directa a liquidada por su rama — sin exención por `tipo`: la etiqueta no es un candado', async () => {
    await assertFails(updateDoc(doc(db('marcela'), ASIG(P1)), {
      estado: 'liquidada', fecha_actualizacion: ts(),
      historial: arrayUnion({ de: 'estimada', a: 'liquidada', por: 'marcela', fecha: ts(), motivo: 'cierre' }),
    }))
  }, TIMEOUT)

  it('E3b. gerencia tampoco con anticipo + liquidacion con saldo sobre una directa (el escape que mostró la revisión) → denegado', async () => {
    await assertFails(updateDoc(doc(db('marcela'), ASIG(P1)), liquidarPatch('marcela')))
  }, TIMEOUT)

  it('E3c. admin cierra la directa por la rama de GESTORES (sin proyección ni gate) → permitido: la directa sigue cerrable', async () => {
    await assertSucceeds(updateDoc(doc(db('root'), ASIG(P1)), cerrarDirecta()))
  }, TIMEOUT)

  it('E4. el director NO liquida una de CONTRATISTA aunque el gate esté al_dia (liquidar es de gerencia — intacto)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), ASIG(P1)), asigContratista()) })
    await sembrarGate(P1, gate('al_dia'))
    await assertFails(updateDoc(doc(db('diego'), ASIG(P1)), liquidarPatch('diego')))
  }, TIMEOUT)
})

// ═══════════════ F. Actores sin vía ═══════════════

describe('F. Actores de control (anti-falso-403)', () => {
  it('F1. comercial y sst (dueña del gate) no escriben asignaciones aunque el gate esté al_dia', async () => {
    await sembrarGate(P1, gate('al_dia'))
    await assertFails(updateDoc(doc(db('karen'), ASIG(P1)), liquidarPatch('karen')))
    await assertFails(updateDoc(doc(db('sofia'), ASIG(P1)), liquidarPatch('sofia')))
  }, TIMEOUT)

  it('F2. gerencia_administrativa y admin NO escriben sst_gate (no pueden avalar lo que liquidan)', async () => {
    await sembrarGate(P1, gate('pendiente'))
    await assertFails(updateDoc(doc(db('marcela'), GATE(P1)), { sst_gate: { estado: 'al_dia', verificado_por: 'marcela', fecha: ts() }, fecha_actualizacion: ts() }))
    await assertFails(updateDoc(doc(db('root'), GATE(P1)), { sst_gate: { estado: 'al_dia', verificado_por: 'root', fecha: ts() }, fecha_actualizacion: ts() }))
  }, TIMEOUT)

  it('F3. sst SÍ avala (control positivo del F2 — contrato #154: origen app + traza) y con su aval la liquidación pasa', async () => {
    await sembrarGate(P1, gate('pendiente'))
    await assertSucceeds(updateDoc(doc(db('sofia'), GATE(P1)), {
      sst_gate: { estado: 'al_dia', verificado_por: 'sofia', fecha: ts(), origen: 'app' },
      historial: arrayUnion({ de: 'pendiente', a: 'al_dia', por: 'sofia', fecha: ts(), motivo: 'al día' }),
      fecha_actualizacion: ts(),
    }))
    await assertSucceeds(updateDoc(doc(db('marcela'), ASIG(P1)), liquidarPatch('marcela')))
  }, TIMEOUT)
})

// ═══════════════ G. [F1 — 28-oct] los creates que nacen en `liquidada` ═══════════════
//
// El residual G1/G2 del PR #193 DEJA de ser residual: histórico solo
// GA/admin, con motivo, SOLO proyectos anteriores al 26-oct-2026 (la fecha en
// que el gate existe); la vía legacy NO nace liquidada.

describe('G. [F1] Nacimiento en `liquidada` acotado', () => {
  const histDoc = () => ({
    tipo: 'contratista', estado: 'liquidada', contratista_id: 'c1', contratista_nombre: 'Héctor', atomos: ['g1'],
    registro_historico: { motivo: 'pagado por fuera del panel', fecha: ts(), por: 'marcela' },
    historial: [], fecha_actualizacion: ts(),
  })
  const sembrarFechaProyecto = (iso: string) =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'proyectos', P1),
        { estado: 'pagado_cliente', consecutivo: 'PRY-2026-001', historial: [], fecha_creacion: Timestamp.fromDate(new Date(iso)) })
    })

  it('G1. histórico de GA sobre proyecto ANTERIOR al 26-oct → permitido (con motivo)', async () => {
    await sembrarFechaProyecto('2026-09-01T12:00:00Z')
    await assertSucceeds(setDoc(doc(db('marcela'), ASIG(P1, 'hist1')), histDoc()))
  }, TIMEOUT)

  it('G1b. el MISMO histórico sobre un proyecto POSTERIOR al 26-oct → denegado ("histórico" nuevo = bypass con otro nombre)', async () => {
    await sembrarFechaProyecto('2026-11-02T12:00:00Z')
    await assertFails(setDoc(doc(db('marcela'), ASIG(P1, 'hist1')), histDoc()))
  }, TIMEOUT)

  it('G1c. gerencia_general y gestion_integral YA NO crean históricos (salen de la vía)', async () => {
    await sembrarFechaProyecto('2026-09-01T12:00:00Z')
    await assertFails(setDoc(doc(db('giovanny'), ASIG(P1, 'hist1')), histDoc()))
    await assertFails(setDoc(doc(db('ingrid'), ASIG(P1, 'hist2')), histDoc()))
  }, TIMEOUT)

  it('G1d. proyecto SIN fecha_creacion → denegado (falla cerrado: sin el dato no hay excepción)', async () => {
    // beforeEach siembra P1 sin fecha_creacion
    await assertFails(setDoc(doc(db('marcela'), ASIG(P1, 'hist1')), histDoc()))
  }, TIMEOUT)

  it('G2. la vía legacy YA NO nace liquidada → denegado; nacer en otro estado sigue vivo', async () => {
    await assertFails(setDoc(doc(db('marcela'), ASIG(P1, 'legacy')), {
      tipo: 'contratista', estado: 'liquidada', legacy: true,
      contratista_id: 'c1', contratista_nombre: 'Héctor', atomos: ['g1'],
      liquidacion: liquidarPatch('marcela').liquidacion,
      historial: [], fecha_actualizacion: ts(),
    }))
    await assertSucceeds(setDoc(doc(db('marcela'), ASIG(P1, 'legacy')), {
      tipo: 'contratista', estado: 'anticipo_girado', legacy: true,
      contratista_id: 'c1', contratista_nombre: 'Héctor', atomos: ['g1'],
      preliquidacion: preliq(),
      historial: [], fecha_actualizacion: ts(),
    }))
  }, TIMEOUT)
})

// ═══════════════ I. Parte B (28-oct) — PAGOS del saldo ═══════════════

describe('I. pagos_saldo: lista append-only, impuestos por regla, B5', () => {
  const pagoValido = (uid: string, extra: Record<string, unknown> = {}) => ({
    fecha: Timestamp.now(), valor: 350_000, medio: 'transferencia',
    comprobante_url: 'https://x/c.pdf', registrado_por: uid,
    fecha_registro: Timestamp.now(), ...extra,
  })
  const liquidadaDoc = (pagos: Record<string, unknown>[] = []) => asigContratista({
    estado: 'liquidada', liquidacion: liquidarPatch('marcela').liquidacion,
    ...(pagos.length ? { pagos_saldo: pagos } : {}),
  })
  const sembrarLiquidada = (pagos: Record<string, unknown>[] = []) =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ASIG(P1)), liquidadaDoc(pagos))
    })

  it('I1. GA registra un pago válido sobre liquidada → permitido; admin también', async () => {
    await sembrarLiquidada()
    await assertSucceeds(updateDoc(doc(db('marcela'), ASIG(P1)), {
      pagos_saldo: [pagoValido('marcela')], fecha_actualizacion: ts(),
      historial: arrayUnion({ de: 'liquidada', a: 'liquidada', por: 'marcela', fecha: ts(), motivo: 'pago' }),
    }))
    await sembrarLiquidada()
    await assertSucceeds(updateDoc(doc(db('root'), ASIG(P1)), {
      pagos_saldo: [pagoValido('root')], fecha_actualizacion: ts(),
    }))
  }, TIMEOUT)

  it('I2. [B3] nadie firma un pago con el nombre de OTRO: registrado_por ajeno → denegado', async () => {
    await sembrarLiquidada()
    await assertFails(updateDoc(doc(db('marcela'), ASIG(P1)), {
      pagos_saldo: [pagoValido('diego')], fecha_actualizacion: ts(),
    }))
  }, TIMEOUT)

  it('I3. [B3] un pago FUTURO no se registra; fecha_registro inventada (vieja) tampoco', async () => {
    await sembrarLiquidada()
    await assertFails(updateDoc(doc(db('marcela'), ASIG(P1)), {
      pagos_saldo: [pagoValido('marcela', { fecha: Timestamp.fromMillis(Date.now() + 86_400_000) })],
      fecha_actualizacion: ts(),
    }))
    await sembrarLiquidada()
    await assertFails(updateDoc(doc(db('marcela'), ASIG(P1)), {
      pagos_saldo: [pagoValido('marcela', { fecha_registro: Timestamp.fromMillis(Date.now() - 3_600_000) })],
      fecha_actualizacion: ts(),
    }))
  }, TIMEOUT)

  it('I4. [B3] fecha real VIEJA sin registro_posterior → denegado (no se oculta); declarado → permitido', async () => {
    await sembrarLiquidada()
    const viejo = Timestamp.fromMillis(Date.now() - 3 * 86_400_000)
    await assertFails(updateDoc(doc(db('marcela'), ASIG(P1)), {
      pagos_saldo: [pagoValido('marcela', { fecha: viejo })], fecha_actualizacion: ts(),
    }))
    await assertSucceeds(updateDoc(doc(db('marcela'), ASIG(P1)), {
      pagos_saldo: [pagoValido('marcela', { fecha: viejo, registro_posterior: true })], fecha_actualizacion: ts(),
    }))
  }, TIMEOUT)

  it('I5. [B2] sin comprobante o valor 0 → denegado; ENCOGER la lista → denegado', async () => {
    await sembrarLiquidada()
    await assertFails(updateDoc(doc(db('marcela'), ASIG(P1)), {
      pagos_saldo: [pagoValido('marcela', { comprobante_url: '' })], fecha_actualizacion: ts(),
    }))
    await assertFails(updateDoc(doc(db('marcela'), ASIG(P1)), {
      pagos_saldo: [pagoValido('marcela', { valor: 0 })], fecha_actualizacion: ts(),
    }))
    const p1 = pagoValido('marcela')
    await sembrarLiquidada([p1, pagoValido('marcela', { valor: 100 })])
    await assertFails(updateDoc(doc(db('marcela'), ASIG(P1)), {
      pagos_saldo: [p1], fecha_actualizacion: ts(),
    }))
  }, TIMEOUT)

  it('I6. [B5/C2] GI y GG no tocan pagos ni editan la liquidada', async () => {
    await sembrarLiquidada()
    for (const a of ['ingrid', 'giovanny'] as Actor[]) {
      await assertFails(updateDoc(doc(db(a), ASIG(P1)), {
        pagos_saldo: [pagoValido(a)], fecha_actualizacion: ts(),
      }))
      await assertFails(updateDoc(doc(db(a), ASIG(P1)), {
        historial: arrayUnion({ de: 'liquidada', a: 'liquidada', por: a, fecha: ts(), motivo: 'nota' }),
        fecha_actualizacion: ts(),
      }))
    }
  }, TIMEOUT)

  it('I7. [B5] gestor (diego) no edita una liquidada en absoluto', async () => {
    await sembrarLiquidada()
    await assertFails(updateDoc(doc(db('diego'), ASIG(P1)), { fecha_actualizacion: ts() }))
  }, TIMEOUT)

  it('I8. [B5] saldo FIJO con pago existente: GA edita `liquidacion` sin pagos → permitido; con un pago → denegado', async () => {
    await sembrarLiquidada()
    await assertSucceeds(updateDoc(doc(db('marcela'), ASIG(P1)), {
      liquidacion: { ...liquidarPatch('marcela').liquidacion, observaciones: 'nota' },
      fecha_actualizacion: ts(),
    }))
    await sembrarLiquidada([pagoValido('marcela')])
    await assertFails(updateDoc(doc(db('marcela'), ASIG(P1)), {
      liquidacion: { ...liquidarPatch('marcela').liquidacion, saldo_final: 1 },
      fecha_actualizacion: ts(),
    }))
  }, TIMEOUT)

  it('I9. el CIERRE del padre exige saldos_pendientes == 0 en el resumen', async () => {
    const padre = (saldos: number) =>
      env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'proyectos', P1), {
          estado: 'liquidado_contratista', consecutivo: 'PRY-2026-001', historial: [],
          pago_cliente: { fecha: ts(), valor: 1, medio: 'transferencia', registrado_por: 'marcela', fecha_registro: ts() },
          resumen_asignaciones: { por_estado: { liquidada: 1 }, total: 1, saldos_pendientes: saldos },
        })
      })
    const cerrar = () => ({
      estado: 'cerrado',
      cierre: { fecha: ts(), cerrado_por: 'marcela' },
      fecha_actualizacion: ts(),
      historial: arrayUnion({ de: 'liquidado_contratista', a: 'cerrado', por: 'marcela', fecha: ts(), motivo: 'cierre' }),
    })
    await padre(1)
    await assertFails(updateDoc(doc(db('marcela'), 'proyectos', P1), cerrar()))
    await padre(0)
    await assertSucceeds(updateDoc(doc(db('marcela'), 'proyectos', P1), cerrar()))
  }, TIMEOUT)
})

// ═══════════════ H. Parte A (28-oct) — gate POR CONTRATISTA ═══════════════

describe('H. A3: contratista_id INMUTABLE en la asignación (todas las vías)', () => {
  it('H1. gestor cambia contratista_id hacia el contratista al día → denegado (el bypass que A3 cierra)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'verificaciones_sst/p1__c2'), { ...gate('al_dia'), contratista_id: 'c2' })
    })
    await assertFails(updateDoc(doc(db('diego'), ASIG(P1)), {
      contratista_id: 'c2', contratista_nombre: 'Otro', fecha_actualizacion: ts(),
    }))
  }, TIMEOUT)

  it('H2. gerencia tampoco — ni junto con la liquidación en el mismo write', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'verificaciones_sst/p1__c2'), { ...gate('al_dia'), contratista_id: 'c2' })
    })
    await assertFails(updateDoc(doc(db('marcela'), ASIG(P1)), {
      ...liquidarPatch('marcela'), contratista_id: 'c2',
    }))
    await assertFails(updateDoc(doc(db('root'), ASIG(P1)), { contratista_id: 'c2', fecha_actualizacion: ts() }))
  }, TIMEOUT)
})

describe('H. El gate es DEL CONTRATISTA: el doc compuesto manda', () => {
  it('H3. gate al_dia de OTRO contratista del MISMO proyecto no sirve: {p1}__c2 al_dia, {p1}__c1 pendiente → liquidar la de c1 denegado', async () => {
    await sembrarGate(P1, gate('pendiente'))
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'verificaciones_sst/p1__c2'), { ...gate('al_dia'), contratista_id: 'c2' })
    })
    await assertFails(updateDoc(doc(db('marcela'), ASIG(P1)), liquidarPatch('marcela')))
  }, TIMEOUT)

  it('H4. el doc LEGACY {pid} con al_dia ya NO autoriza (congelado por la migración) → denegado sin el compuesto', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `verificaciones_sst/${P1}`), { ...gate('al_dia'), migrada_a: [`${P1}__c1`] })
    })
    await assertFails(updateDoc(doc(db('marcela'), ASIG(P1)), liquidarPatch('marcela')))
  }, TIMEOUT)
})

describe('H. A.4 — el PADRE deja su propio get: puente coherente o gate del contratista de SU asignación', () => {
  const sembrarPadreConAsignacion = (estado: string) =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'proyectos', P1), {
        estado, consecutivo: 'PRY-2026-001', historial: [],
        asignacion: { contratista_id: 'c1', contratista_nombre: 'Héctor' },
      })
    })

  it('H5. vía LEGACY por-proyecto (write CON `liquidacion`): gate del contratista al_dia → permitido', async () => {
    await sembrarPadreConAsignacion('pagado_cliente')
    await sembrarGate(P1, gate('al_dia'))
    await assertSucceeds(updateDoc(doc(db('marcela'), 'proyectos', P1), {
      estado: 'liquidado_contratista',
      liquidacion: { mano_obra: 700_000, total_final: 700_000, saldo_final: 350_000, liquidada_por: 'marcela', fecha: ts() },
      fecha_actualizacion: ts(),
      historial: arrayUnion({ de: 'pagado_cliente', a: 'liquidado_contratista', por: 'marcela', fecha: ts(), motivo: 'liquidación' }),
    }))
  }, TIMEOUT)

  it('H6. vía LEGACY sin gate del contratista (solo el {pid} congelado al_dia) → denegado', async () => {
    await sembrarPadreConAsignacion('pagado_cliente')
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `verificaciones_sst/${P1}`), { ...gate('al_dia'), migrada_a: [`${P1}__c1`] })
    })
    await assertFails(updateDoc(doc(db('marcela'), 'proyectos', P1), {
      estado: 'liquidado_contratista',
      liquidacion: { mano_obra: 700_000, total_final: 700_000, saldo_final: 350_000, liquidada_por: 'marcela', fecha: ts() },
      fecha_actualizacion: ts(),
      historial: arrayUnion({ de: 'pagado_cliente', a: 'liquidado_contratista', por: 'marcela', fecha: ts(), motivo: 'liquidación' }),
    }))
  }, TIMEOUT)

  it('H7. PUENTE del lote (sin `liquidacion` propia): resumen todo liquidado/cancelado → permitido SIN get del padre', async () => {
    await sembrarPadreConAsignacion('pagado_cliente')
    await assertSucceeds(updateDoc(doc(db('marcela'), 'proyectos', P1), {
      estado: 'liquidado_contratista',
      resumen_asignaciones: { por_estado: { liquidada: 2, cancelada: 1 }, total: 3 },
      fecha_actualizacion: ts(),
      historial: arrayUnion({ de: 'pagado_cliente', a: 'liquidado_contratista', por: 'marcela', fecha: ts(), motivo: 'puente' }),
    }))
  }, TIMEOUT)

  it('H8. PUENTE con el lote INCOHERENTE (queda una anticipo_girado) → denegado', async () => {
    await sembrarPadreConAsignacion('pagado_cliente')
    await assertFails(updateDoc(doc(db('marcela'), 'proyectos', P1), {
      estado: 'liquidado_contratista',
      resumen_asignaciones: { por_estado: { liquidada: 2, anticipo_girado: 1 }, total: 3 },
      fecha_actualizacion: ts(),
      historial: arrayUnion({ de: 'pagado_cliente', a: 'liquidado_contratista', por: 'marcela', fecha: ts(), motivo: 'puente' }),
    }))
  }, TIMEOUT)
})
