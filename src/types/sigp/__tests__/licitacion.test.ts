import { describe, it, expect } from 'vitest'
import type { Timestamp } from 'firebase/firestore'
import {
  ESTADOS_LICITACION, TRANSICIONES_LICITACION, ESTADOS_INACTIVOS, ESTADOS_TRAS_PORTERO,
  MOTIVOS_DESCARTE,
  puedeTransicionarLicitacion, esLicitacionTerminal, esLicitacionActiva,
  motivoDescarteConsistente, activaConsistente, porteroPermite, overrideValido,
  licitacionConsistente,
  ESTADOS_EXIGEN_CONSECUTIVO, esConsecutivoLicValido,
  consecutivoConsistente, transicionConsecutivoValida, exigeConsecutivo,
  pctNeg, pctGanador,
  patchAvanzarLicitacion, patchDescartarLicitacion, patchReabrirLicitacion,
  patchOverrideSemaforo, patchRecalcularSemaforo,
  patchPresentarLicitacion, patchCerrarConResultado,
  datosPresentacionCompletos, datosResultadoCompletos,
  type Licitacion, type EstadoLicitacion, type OverrideSemaforo,
  type ResultadoSemaforoLicitacion,
} from '../licitacion'

const ts = (ms: number) => ({ toMillis: () => ms, seconds: ms / 1000 } as unknown as Timestamp)
const AHORA = ts(1_000_000)
const ANTES = ts(500_000)

const ACTOR = { uid: 'uid-karen' }

const CONS = 'LIC-2026-0001'

const base = (extra?: Partial<Licitacion>): Licitacion => ({
  // Consecutivo DIFERIDO (1.2b): el documento nace sin número.
  consecutivo: '',
  numero_proceso: 'MC-DNP-004-2026',
  id_secop: 'CO1.BDOS.1234567',
  origen: 'secop_ii',
  url_proceso: 'https://community.secop.gov.co/Public/Tendering/x',
  entidad: {
    nombre: 'Departamento Nacional de Planeación',
    nit: '899999037-4',
    orden: 'Nacional',
    departamento: 'Distrito Capital de Bogotá',
    ciudad: 'Bogotá',
  },
  objeto: 'Mantenimiento locativo de la sede administrativa',
  categoria_unspsc: '72101500',
  modalidad: 'minima_cuantia',
  presupuesto_oficial: 6_011_508,
  lotes: 1,
  cronograma: {
    publicacion: ANTES, manifestacion: null, sorteo: null,
    cierre: null, adjudicacion: null,
  },
  semaforo: 'verde',
  semaforo_motivos: [],
  semaforo_version: 'v1.0',
  semaforo_calculado_en: ANTES,
  override_manual: null,
  estado: 'detectada',
  motivo_descarte: null,
  oferta_neg: null,
  oferta_ganador: null,
  ganador: null,
  manifestaciones: null,
  ofertas_recibidas: null,
  responsable_uid: 'uid-karen',
  creado_por: 'uid-karen',
  creado_en: ANTES,
  actualizado_por: 'uid-karen',
  actualizado_en: ANTES,
  activa: true,
  migrado: false,
  capacidad_manual: null,
  ...extra,
})

const OVERRIDE: OverrideSemaforo = {
  por: 'uid-giovanny', en: ANTES, motivo: 'Cliente conocido, entramos igual',
  semaforo_anterior: 'rojo',
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Máquina de estados — TODA transición, válida e inválida
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tabla ESPERADA escrita a mano desde la especificación — deliberadamente NO
 * se deriva de TRANSICIONES_LICITACION, o el test sería una tautología.
 */
const ESPERADO: Record<EstadoLicitacion, EstadoLicitacion[]> = {
  detectada:      ['en_evaluacion', 'descartada'],
  en_evaluacion:  ['en_preparacion', 'descartada'],
  en_preparacion: ['manifestada', 'presentada', 'descartada'],
  manifestada:    ['presentada', 'descartada', 'revocada'],
  presentada:     ['adjudicada', 'perdida', 'rechazada', 'revocada', 'desierta'],
  descartada:     ['en_evaluacion'],
  adjudicada:     [],
  perdida:        [],
  rechazada:      [],
  revocada:       [],
  desierta:       [],
}

describe('máquina de estados de licitaciones', () => {
  it('cubre exactamente los 11 estados declarados', () => {
    expect(Object.keys(TRANSICIONES_LICITACION).sort()).toEqual([...ESTADOS_LICITACION].sort())
    expect(ESTADOS_LICITACION).toHaveLength(11)
  })

  it('cada par (de, a) del producto cartesiano coincide con la especificación', () => {
    for (const de of ESTADOS_LICITACION) {
      for (const a of ESTADOS_LICITACION) {
        const esperado = ESPERADO[de].includes(a)
        expect(
          puedeTransicionarLicitacion(de, a),
          `${de} -> ${a} debería ser ${esperado ? 'válida' : 'INVÁLIDA'}`,
        ).toBe(esperado)
      }
    }
  })

  it('los cinco estados de resultado son terminales duros', () => {
    for (const t of ['adjudicada', 'perdida', 'rechazada', 'revocada', 'desierta'] as const) {
      expect(esLicitacionTerminal(t)).toBe(true)
      for (const a of ESTADOS_LICITACION) {
        expect(puedeTransicionarLicitacion(t, a)).toBe(false)
      }
    }
  })

  it('descartada NO es terminal: se reabre a en_evaluacion, y solo a eso', () => {
    expect(esLicitacionTerminal('descartada')).toBe(false)
    expect(TRANSICIONES_LICITACION.descartada).toEqual(['en_evaluacion'])
  })

  it('la reapertura desde descartada es la ÚNICA marcha atrás del sistema', () => {
    const haciaAtras: string[] = []
    const orden = ['detectada', 'en_evaluacion', 'en_preparacion', 'manifestada', 'presentada']
    for (const de of ESTADOS_LICITACION) {
      for (const a of TRANSICIONES_LICITACION[de]) {
        const i = orden.indexOf(de), j = orden.indexOf(a)
        if (i >= 0 && j >= 0 && j < i) haciaAtras.push(`${de}->${a}`)
        if (i < 0 && j >= 0) haciaAtras.push(`${de}->${a}`)
      }
    }
    expect(haciaAtras).toEqual(['descartada->en_evaluacion'])
  })

  it('descartar es alcanzable desde los cuatro estados en juego, nunca desde un terminal', () => {
    for (const de of ['detectada', 'en_evaluacion', 'en_preparacion', 'manifestada'] as const) {
      expect(puedeTransicionarLicitacion(de, 'descartada')).toBe(true)
    }
    // Ya presentada la oferta, descartar no tiene sentido: hay resultado.
    expect(puedeTransicionarLicitacion('presentada', 'descartada')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Invariante 1 — descartada <=> motivo_descarte
// ─────────────────────────────────────────────────────────────────────────────

describe('invariante 1 — descartada <=> motivo_descarte', () => {
  it('el validador exige motivo en descartada y su ausencia en el resto', () => {
    expect(motivoDescarteConsistente('descartada', 'SORTEO')).toBe(true)
    expect(motivoDescarteConsistente('descartada', null)).toBe(false)
    for (const e of ESTADOS_LICITACION) {
      if (e === 'descartada') continue
      expect(motivoDescarteConsistente(e, null)).toBe(true)
      expect(motivoDescarteConsistente(e, 'EXPERIENCIA')).toBe(false)
    }
  })

  it('descartar SIEMPRE escribe el motivo', () => {
    const patch = patchDescartarLicitacion(base(), ACTOR, AHORA, 'LIMITACION_MIPYME')
    expect(patch).not.toBeNull()
    expect(patch!.estado).toBe('descartada')
    expect(patch!.motivo_descarte).toBe('LIMITACION_MIPYME')
    expect(motivoDescarteConsistente(patch!.estado, patch!.motivo_descarte)).toBe(true)
  })

  it('acepta los ocho motivos del vocabulario', () => {
    for (const m of MOTIVOS_DESCARTE) {
      expect(patchDescartarLicitacion(base(), ACTOR, AHORA, m)).not.toBeNull()
    }
  })

  it('RECHAZO: un motivo fuera del vocabulario no descarta', () => {
    // @ts-expect-error — motivo inválido a propósito (puede llegar de un doc viejo)
    expect(patchDescartarLicitacion(base(), ACTOR, AHORA, 'PORQUE_SI')).toBeNull()
  })

  it('RECHAZO: no se descarta desde un estado que no lo permite', () => {
    expect(patchDescartarLicitacion(base({ estado: 'presentada' }), ACTOR, AHORA, 'OTRO')).toBeNull()
    expect(patchDescartarLicitacion(base({ estado: 'adjudicada', activa: false }), ACTOR, AHORA, 'OTRO')).toBeNull()
  })

  it('reabrir LIMPIA el motivo — fuera de descartada no puede quedar rastro', () => {
    const desc = base({ estado: 'descartada', motivo_descarte: 'SORTEO', activa: false })
    const patch = patchReabrirLicitacion(desc, ACTOR, AHORA)
    expect(patch).not.toBeNull()
    expect(patch!.estado).toBe('en_evaluacion')
    expect(patch!.motivo_descarte).toBeNull()
    expect(motivoDescarteConsistente(patch!.estado, patch!.motivo_descarte)).toBe(true)
  })

  it('avanzar normalmente también deja el motivo en null', () => {
    const patch = patchAvanzarLicitacion(base(), 'en_evaluacion', ACTOR, AHORA)
    expect(patch!.motivo_descarte).toBeNull()
  })

  it('RECHAZO: patchAvanzar no acepta descartada (esa invariante tiene un solo dueño)', () => {
    expect(patchAvanzarLicitacion(base(), 'descartada', ACTOR, AHORA)).toBeNull()
  })

  it('RECHAZO: reabrir solo aplica desde descartada', () => {
    expect(patchReabrirLicitacion(base(), ACTOR, AHORA)).toBeNull()
    expect(patchReabrirLicitacion(base({ estado: 'presentada' }), ACTOR, AHORA)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Invariante 2 — activa derivada del estado
// ─────────────────────────────────────────────────────────────────────────────

describe('invariante 2 — activa es derivada, nunca escrita a mano', () => {
  it('inactiva exactamente en los cinco terminales más descartada', () => {
    expect([...ESTADOS_INACTIVOS].sort()).toEqual(
      ['adjudicada', 'descartada', 'desierta', 'perdida', 'rechazada', 'revocada'],
    )
    for (const e of ESTADOS_LICITACION) {
      expect(esLicitacionActiva(e)).toBe(!ESTADOS_INACTIVOS.includes(e))
    }
  })

  it('el validador detecta el desajuste en ambos sentidos', () => {
    expect(activaConsistente('detectada', true)).toBe(true)
    expect(activaConsistente('detectada', false)).toBe(false)
    expect(activaConsistente('adjudicada', false)).toBe(true)
    expect(activaConsistente('adjudicada', true)).toBe(false)
  })

  it('TODOS los builders dejan activa coherente con el estado que producen', () => {
    const casos = [
      patchAvanzarLicitacion(base(), 'en_evaluacion', ACTOR, AHORA),
      patchAvanzarLicitacion(base({ estado: 'presentada', consecutivo: CONS }), 'adjudicada', ACTOR, AHORA),
      patchAvanzarLicitacion(base({ estado: 'presentada', consecutivo: CONS }), 'perdida', ACTOR, AHORA),
      patchAvanzarLicitacion(base({ estado: 'manifestada', consecutivo: CONS }), 'revocada', ACTOR, AHORA),
      patchDescartarLicitacion(base(), ACTOR, AHORA, 'CAPACIDAD'),
      patchReabrirLicitacion(
        base({ estado: 'descartada', motivo_descarte: 'CAPACIDAD', activa: false }), ACTOR, AHORA,
      ),
    ]
    for (const patch of casos) {
      expect(patch).not.toBeNull()
      expect(activaConsistente(patch!.estado, patch!.activa)).toBe(true)
    }
  })

  it('descartar apaga activa; reabrir la vuelve a encender', () => {
    expect(patchDescartarLicitacion(base(), ACTOR, AHORA, 'OTRO')!.activa).toBe(false)
    const desc = base({ estado: 'descartada', motivo_descarte: 'OTRO', activa: false })
    expect(patchReabrirLicitacion(desc, ACTOR, AHORA)!.activa).toBe(true)
  })

  it('RECHAZO: un documento con activa mentida no pasa el chequeo de consistencia', () => {
    const mentiroso = base({ estado: 'adjudicada', activa: true })
    expect(licitacionConsistente(mentiroso)).toBe(false)
  })

  it('el documento base es consistente', () => {
    expect(licitacionConsistente(base())).toBe(true)
    expect(licitacionConsistente(
      base({ estado: 'descartada', motivo_descarte: 'SORTEO', activa: false }),
    )).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Invariante 3 — el portero del semáforo rojo
// ─────────────────────────────────────────────────────────────────────────────

describe('invariante 3 — portero: rojo bloquea el compromiso', () => {
  const rojo = (estado: EstadoLicitacion, extra?: Partial<Licitacion>) =>
    base({ estado, semaforo: 'rojo', semaforo_motivos: ['MODALIDAD_SIN_HISTORIAL'], ...extra })

  it('bloquea exactamente en_preparacion, manifestada y presentada', () => {
    expect([...ESTADOS_TRAS_PORTERO].sort()).toEqual(
      ['en_preparacion', 'manifestada', 'presentada'],
    )
  })

  it('RECHAZO: rojo sin override no llega a en_preparacion', () => {
    expect(patchAvanzarLicitacion(rojo('en_evaluacion'), 'en_preparacion', ACTOR, AHORA, { consecutivo: CONS })).toBeNull()
  })

  it('RECHAZO: rojo sin override no manifiesta ni presenta', () => {
    expect(patchAvanzarLicitacion(rojo('en_preparacion', { consecutivo: CONS }), 'manifestada', ACTOR, AHORA)).toBeNull()
    expect(patchAvanzarLicitacion(rojo('en_preparacion', { consecutivo: CONS }), 'presentada', ACTOR, AHORA)).toBeNull()
    expect(patchAvanzarLicitacion(rojo('manifestada', { consecutivo: CONS }), 'presentada', ACTOR, AHORA)).toBeNull()
  })

  it('rojo SÍ deja evaluar: leer para decidir no cuesta nada', () => {
    expect(patchAvanzarLicitacion(rojo('detectada'), 'en_evaluacion', ACTOR, AHORA)).not.toBeNull()
  })

  it('rojo SÍ deja descartar', () => {
    expect(patchDescartarLicitacion(rojo('en_evaluacion'), ACTOR, AHORA, 'EXPERIENCIA')).not.toBeNull()
  })

  it('con override registrado, el portero deja pasar', () => {
    const conOverride = rojo('en_evaluacion', { override_manual: OVERRIDE })
    const patch = patchAvanzarLicitacion(conOverride, 'en_preparacion', ACTOR, AHORA, { consecutivo: CONS })
    expect(patch).not.toBeNull()
    expect(patch!.estado).toBe('en_preparacion')
  })

  it('amarillo y verde nunca bloquean', () => {
    for (const s of ['verde', 'amarillo'] as const) {
      for (const destino of ESTADOS_TRAS_PORTERO) {
        expect(porteroPermite({ semaforo: s, override_manual: null }, destino)).toBe(true)
      }
    }
  })

  it('el resultado del proceso no lo frena el portero (ya se presentó)', () => {
    const presentadaRoja = rojo('presentada', { consecutivo: CONS })
    expect(patchAvanzarLicitacion(presentadaRoja, 'adjudicada', ACTOR, AHORA)).not.toBeNull()
    expect(patchAvanzarLicitacion(presentadaRoja, 'perdida', ACTOR, AHORA)).not.toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Invariante 4 — override auditable
// ─────────────────────────────────────────────────────────────────────────────

describe('invariante 4 — override con quién, por qué y qué había antes', () => {
  const enRojo = base({ semaforo: 'rojo', semaforo_motivos: ['MODALIDAD_SIN_HISTORIAL'] })

  it('el override registra el valor previo REAL, no uno elegido por el caller', () => {
    const patch = patchOverrideSemaforo(enRojo, ACTOR, AHORA, {
      semaforo: 'amarillo', motivo: 'Ya ganamos dos menores cuantías con esta entidad',
    })
    expect(patch).not.toBeNull()
    expect(patch!.semaforo).toBe('amarillo')
    expect(patch!.override_manual.semaforo_anterior).toBe('rojo')
    expect(patch!.override_manual.por).toBe('uid-karen')
    expect(patch!.override_manual.en).toBe(AHORA)
    expect(overrideValido(patch!.override_manual)).toBe(true)
  })

  it('toma el anterior del documento sea cual sea', () => {
    const desdeVerde = patchOverrideSemaforo(base(), ACTOR, AHORA, {
      semaforo: 'rojo', motivo: 'La entidad exige experiencia que no tenemos',
    })
    expect(desdeVerde!.override_manual.semaforo_anterior).toBe('verde')
  })

  it('un override que MANTIENE el rojo es legítimo — es el caso del portero', () => {
    const patch = patchOverrideSemaforo(enRojo, ACTOR, AHORA, {
      semaforo: 'rojo', motivo: 'Sé que está en rojo, entramos por relación con la entidad',
    })
    expect(patch).not.toBeNull()
    expect(patch!.semaforo).toBe('rojo')
    expect(patch!.override_manual.semaforo_anterior).toBe('rojo')
    // Y con él, el portero deja pasar aunque el semáforo siga rojo.
    const despues = base({
      estado: 'en_evaluacion', semaforo: 'rojo', override_manual: patch!.override_manual,
    })
    expect(patchAvanzarLicitacion(despues, 'en_preparacion', ACTOR, AHORA, { consecutivo: CONS })).not.toBeNull()
  })

  it('RECHAZO: sin motivo no hay override', () => {
    expect(patchOverrideSemaforo(enRojo, ACTOR, AHORA, { semaforo: 'verde', motivo: '' })).toBeNull()
    expect(patchOverrideSemaforo(enRojo, ACTOR, AHORA, { semaforo: 'verde', motivo: '   ' })).toBeNull()
  })

  it('RECHAZO: sin autor no hay override', () => {
    expect(patchOverrideSemaforo(enRojo, { uid: '' }, AHORA, {
      semaforo: 'verde', motivo: 'razón válida',
    })).toBeNull()
    expect(patchOverrideSemaforo(enRojo, { uid: '  ' }, AHORA, {
      semaforo: 'verde', motivo: 'razón válida',
    })).toBeNull()
  })

  it('RECHAZO: un semáforo fuera del vocabulario no se acepta', () => {
    // @ts-expect-error — valor inválido a propósito
    expect(patchOverrideSemaforo(enRojo, ACTOR, AHORA, { semaforo: 'azul', motivo: 'x' })).toBeNull()
  })

  it('el motivo se guarda recortado', () => {
    const patch = patchOverrideSemaforo(enRojo, ACTOR, AHORA, {
      semaforo: 'verde', motivo: '   entramos igual   ',
    })
    expect(patch!.override_manual.motivo).toBe('entramos igual')
  })

  it('el validador rechaza overrides mal formados y acepta la ausencia', () => {
    expect(overrideValido(null)).toBe(true)
    expect(overrideValido({ ...OVERRIDE, motivo: '' })).toBe(false)
    expect(overrideValido({ ...OVERRIDE, motivo: '  ' })).toBe(false)
    expect(overrideValido({ ...OVERRIDE, por: '' })).toBe(false)
    expect(overrideValido(OVERRIDE)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Invariante 5 — la versión del criterio no se mueve sola
// ─────────────────────────────────────────────────────────────────────────────

describe('invariante 5 — semaforo_version no cambia por efecto colateral', () => {
  const r = (version: string, semaforo: ResultadoSemaforoLicitacion['semaforo'] = 'amarillo'):
    ResultadoSemaforoLicitacion => ({ semaforo, motivos: ['SORTEO'], version })

  it('recálculo con la MISMA versión refresca valor y motivos', () => {
    const patch = patchRecalcularSemaforo(base(), r('v1.0'), AHORA)
    expect(patch).not.toBeNull()
    expect(patch!.semaforo).toBe('amarillo')
    expect(patch!.semaforo_motivos).toEqual(['SORTEO'])
    expect(patch!.semaforo_calculado_en).toBe(AHORA)
  })

  it('con la misma versión, semaforo_version NI SIQUIERA aparece en el patch', () => {
    const patch = patchRecalcularSemaforo(base(), r('v1.0'), AHORA)
    expect(Object.keys(patch!)).not.toContain('semaforo_version')
    expect('semaforo_version' in patch!).toBe(false)
  })

  it('RECHAZO: versión distinta SIN declaración explícita no se aplica', () => {
    expect(patchRecalcularSemaforo(base(), r('v2.0'), AHORA)).toBeNull()
  })

  it('versión distinta CON declaración válida sí cambia el criterio', () => {
    const patch = patchRecalcularSemaforo(base(), r('v2.0'), AHORA, {
      motivo: 'Se incorpora el historial de 2026 al criterio',
      version_anterior: 'v1.0',
    })
    expect(patch).not.toBeNull()
    expect(patch!.semaforo_version).toBe('v2.0')
    expect(patch!.semaforo).toBe('amarillo')
  })

  it('RECHAZO: la declaración debe traer el valor anterior REAL del documento', () => {
    expect(patchRecalcularSemaforo(base(), r('v2.0'), AHORA, {
      motivo: 'criterio nuevo',
      version_anterior: 'v1.5',   // el documento dice v1.0
    })).toBeNull()
  })

  it('RECHAZO: la declaración exige motivo no vacío', () => {
    expect(patchRecalcularSemaforo(base(), r('v2.0'), AHORA, {
      motivo: '', version_anterior: 'v1.0',
    })).toBeNull()
    expect(patchRecalcularSemaforo(base(), r('v2.0'), AHORA, {
      motivo: '   ', version_anterior: 'v1.0',
    })).toBeNull()
  })

  it('RECHAZO: declarar un cambio que no ocurre también se rechaza', () => {
    expect(patchRecalcularSemaforo(base(), r('v1.0'), AHORA, {
      motivo: 'no hay nada que cambiar', version_anterior: 'v1.0',
    })).toBeNull()
  })

  it('el recálculo NO toca el override manual: una decisión humana no se borra sola', () => {
    const conOverride = base({ semaforo: 'rojo', override_manual: OVERRIDE })
    const patch = patchRecalcularSemaforo(conOverride, r('v1.0', 'verde'), AHORA)
    expect(patch).not.toBeNull()
    expect(Object.keys(patch!)).not.toContain('override_manual')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Invariante 6 — los estados de compromiso y resultado exigen consecutivo
// ─────────────────────────────────────────────────────────────────────────────

describe('invariante 6 — consecutivo diferido', () => {
  it('la licitación nace SIN número', () => {
    expect(base().consecutivo).toBe('')
    expect(licitacionConsistente(base())).toBe(true)
  })

  it('exigen consecutivo los 3 de compromiso + los 5 de resultado', () => {
    expect([...ESTADOS_EXIGEN_CONSECUTIVO].sort()).toEqual([
      'adjudicada', 'desierta', 'en_preparacion', 'manifestada',
      'perdida', 'presentada', 'rechazada', 'revocada',
    ])
    expect(ESTADOS_EXIGEN_CONSECUTIVO).toHaveLength(8)
  })

  it('los tres de triage lo admiten vacío', () => {
    for (const e of ['detectada', 'en_evaluacion', 'descartada'] as const) {
      expect(ESTADOS_EXIGEN_CONSECUTIVO).not.toContain(e)
      expect(consecutivoConsistente(e, '')).toBe(true)
    }
  })

  it('el validador exige número en los ocho, y no lo exige en los tres', () => {
    for (const e of ESTADOS_LICITACION) {
      const exige = ESTADOS_EXIGEN_CONSECUTIVO.includes(e)
      expect(consecutivoConsistente(e, '')).toBe(!exige)
      expect(consecutivoConsistente(e, CONS)).toBe(true)   // lleno siempre vale
    }
  })

  it('la implicación va en UN sentido: descartada CONSERVA el número que quemó', () => {
    // Se materializó, se descartó después. El hueco en la serie es legítimo,
    // igual que en SOL — el número gastado no se devuelve.
    const quemadaYDescartada = base({
      estado: 'descartada', motivo_descarte: 'SORTEO', activa: false, consecutivo: CONS,
    })
    expect(consecutivoConsistente('descartada', CONS)).toBe(true)
    expect(licitacionConsistente(quemadaYDescartada)).toBe(true)
  })

  it('descartar NO toca el consecutivo, lo tenga o no', () => {
    const sinNumero = patchDescartarLicitacion(base(), ACTOR, AHORA, 'SORTEO')
    expect(Object.keys(sinNumero!)).not.toContain('consecutivo')

    const conNumero = base({ estado: 'en_preparacion', consecutivo: CONS })
    const patch = patchDescartarLicitacion(conNumero, ACTOR, AHORA, 'INDICADORES')
    expect(Object.keys(patch!)).not.toContain('consecutivo')
    expect(licitacionConsistente({ ...conNumero, ...patch! } as Licitacion)).toBe(true)
  })

  it('RECHAZO: avanzar a en_preparacion sin número y sin pasarlo', () => {
    const l = base({ estado: 'en_evaluacion' })
    expect(patchAvanzarLicitacion(l, 'en_preparacion', ACTOR, AHORA)).toBeNull()
  })

  it('avanzar a en_preparacion CON el número en el mismo patch', () => {
    const l = base({ estado: 'en_evaluacion' })
    const patch = patchAvanzarLicitacion(l, 'en_preparacion', ACTOR, AHORA, { consecutivo: CONS })
    expect(patch).not.toBeNull()
    expect(patch!.estado).toBe('en_preparacion')
    // EN EL MISMO PATCH: nunca existe un instante en en_preparacion sin número.
    expect(patch!.consecutivo).toBe(CONS)
    expect(licitacionConsistente({ ...l, ...patch! } as Licitacion)).toBe(true)
  })

  it('los estados de triage NO queman número', () => {
    const patch = patchAvanzarLicitacion(base(), 'en_evaluacion', ACTOR, AHORA)
    expect(Object.keys(patch!)).not.toContain('consecutivo')
  })

  it('RECHAZO: pasar consecutivo a un destino que no lo exige', () => {
    // Quemar número al pasar a en_evaluacion rompe la contigüidad ISO.
    expect(patchAvanzarLicitacion(base(), 'en_evaluacion', ACTOR, AHORA, {
      consecutivo: CONS,
    })).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Invariante 6 · excepción de los MIGRADOS (1.3)
// ─────────────────────────────────────────────────────────────────────────────

describe('invariante 6 — los MIGRADOS no llevan número', () => {
  it('CLAVE: migrado en perdida con consecutivo vacío es CONSISTENTE', () => {
    // No se retro-numera una serie ISO que no existió: los ~350 históricos
    // del registro CM-FT-CPG-26 entran sin consecutivo.
    expect(consecutivoConsistente('perdida', '', true)).toBe(true)
    expect(licitacionConsistente(base({
      migrado: true, estado: 'perdida', activa: false, consecutivo: '',
    }))).toBe(true)
  })

  it('CLAVE: NO migrado en perdida con consecutivo vacío es INCONSISTENTE', () => {
    expect(consecutivoConsistente('perdida', '', false)).toBe(false)
    expect(licitacionConsistente(base({
      migrado: false, estado: 'perdida', activa: false, consecutivo: '',
    }))).toBe(false)
  })

  it('la excepción cubre los OCHO estados que normalmente exigen número', () => {
    for (const e of ESTADOS_EXIGEN_CONSECUTIVO) {
      expect(consecutivoConsistente(e, '', true), `${e} migrado`).toBe(true)
      expect(consecutivoConsistente(e, '', false), `${e} no migrado`).toBe(false)
    }
  })

  it('el default de `migrado` es false — la excepción se pide explícitamente', () => {
    expect(consecutivoConsistente('perdida', '')).toBe(false)
  })

  it('un migrado también puede tener número (no se le prohíbe)', () => {
    expect(consecutivoConsistente('adjudicada', CONS, true)).toBe(true)
  })

  it('exigeConsecutivo: un migrado nunca lo exige', () => {
    for (const e of ESTADOS_EXIGEN_CONSECUTIVO) {
      expect(exigeConsecutivo(e, true), `${e}`).toBe(false)
      expect(exigeConsecutivo(e, false), `${e}`).toBe(true)
    }
    expect(exigeConsecutivo('en_evaluacion', false)).toBe(false)
  })

  it('el builder deja avanzar un migrado sin pedirle número', () => {
    const historico = base({
      migrado: true, estado: 'en_evaluacion', consecutivo: '',
    })
    const patch = patchAvanzarLicitacion(historico, 'en_preparacion', ACTOR, AHORA)
    expect(patch).not.toBeNull()
    expect(Object.keys(patch!)).not.toContain('consecutivo')
    expect(licitacionConsistente({ ...historico, ...patch! } as Licitacion)).toBe(true)
  })

  it('RECHAZO: a un migrado tampoco se le puede meter número por el builder', () => {
    // La serie LIC arranca con la primera licitación NUEVA; un histórico no
    // se cuela dentro de ella.
    expect(patchAvanzarLicitacion(
      base({ migrado: true, estado: 'en_evaluacion' }),
      'en_preparacion', ACTOR, AHORA, { consecutivo: CONS },
    )).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Invariante 7 — el consecutivo es inmutable una vez asignado
// ─────────────────────────────────────────────────────────────────────────────

describe('invariante 7 — inmutabilidad del consecutivo', () => {
  it('el formato de la serie es LIC-AAAA-NNNN con padding 4', () => {
    expect(esConsecutivoLicValido('LIC-2026-0001')).toBe(true)
    expect(esConsecutivoLicValido('LIC-2026-9999')).toBe(true)
    expect(esConsecutivoLicValido('LIC-2026-10000')).toBe(true)   // se extiende
  })

  it('RECHAZO de formatos que no son de la serie', () => {
    for (const malo of [
      '', 'LIC-2026-001', 'LIC-26-0001', 'COT-2026-0001', 'lic-2026-0001',
      'LIC-2026', 'LIC-2026-0001 ', ' LIC-2026-0001', 'LIC-2026-ABCD',
    ]) {
      expect(esConsecutivoLicValido(malo), `"${malo}" no debería ser válido`).toBe(false)
    }
  })

  it('la ÚNICA transición legal es vacío -> número de la serie', () => {
    expect(transicionConsecutivoValida('', CONS)).toBe(true)
  })

  it('no cambiar siempre es legal (vacío o lleno)', () => {
    expect(transicionConsecutivoValida('', '')).toBe(true)
    expect(transicionConsecutivoValida(CONS, CONS)).toBe(true)
  })

  it('RECHAZO: reescribir un número ya asignado', () => {
    expect(transicionConsecutivoValida(CONS, 'LIC-2026-0002')).toBe(false)
    expect(transicionConsecutivoValida(CONS, 'LIC-2027-0001')).toBe(false)
  })

  it('RECHAZO: limpiar un número ya asignado', () => {
    expect(transicionConsecutivoValida(CONS, '')).toBe(false)
  })

  it('RECHAZO: asignar algo que no es de la serie', () => {
    expect(transicionConsecutivoValida('', 'PRY-2026-001')).toBe(false)
    expect(transicionConsecutivoValida('', 'inventado')).toBe(false)
  })

  it('RECHAZO: el builder no reescribe un número existente — ni con el mismo valor', () => {
    const yaTiene = base({ estado: 'en_preparacion', consecutivo: CONS })
    expect(patchAvanzarLicitacion(yaTiene, 'manifestada', ACTOR, AHORA, {
      consecutivo: 'LIC-2026-0002',
    })).toBeNull()
    expect(patchAvanzarLicitacion(yaTiene, 'manifestada', ACTOR, AHORA, {
      consecutivo: CONS,
    })).toBeNull()
  })

  it('con número ya asignado, avanzar NO lo incluye en el patch', () => {
    const yaTiene = base({ estado: 'en_preparacion', consecutivo: CONS })
    const patch = patchAvanzarLicitacion(yaTiene, 'manifestada', ACTOR, AHORA)
    expect(patch).not.toBeNull()
    expect(Object.keys(patch!)).not.toContain('consecutivo')
  })

  it('RECHAZO: el builder rechaza un consecutivo con formato inválido', () => {
    const l = base({ estado: 'en_evaluacion' })
    for (const malo of ['LIC-2026-001', 'PRY-2026-0001', 'x']) {
      expect(patchAvanzarLicitacion(l, 'en_preparacion', ACTOR, AHORA, {
        consecutivo: malo,
      })).toBeNull()
    }
  })

  it('el número sobrevive todo el recorrido hasta el terminal', () => {
    let l = base({ estado: 'en_evaluacion' })
    const aplicar = (patch: Record<string, unknown> | null) => {
      expect(patch).not.toBeNull()
      l = { ...l, ...patch } as Licitacion
      expect(licitacionConsistente(l)).toBe(true)
      expect(transicionConsecutivoValida(CONS, l.consecutivo) || l.consecutivo === '').toBe(true)
    }
    aplicar(patchAvanzarLicitacion(l, 'en_preparacion', ACTOR, AHORA, { consecutivo: CONS }))
    aplicar(patchAvanzarLicitacion(l, 'presentada', ACTOR, AHORA))
    aplicar(patchAvanzarLicitacion(l, 'adjudicada', ACTOR, AHORA))
    expect(l.consecutivo).toBe(CONS)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Captura obligatoria (1.4)
// ─────────────────────────────────────────────────────────────────────────────

describe('captura al PRESENTAR — los tres datos o nada', () => {
  const lista = () => base({ estado: 'en_preparacion', consecutivo: CONS })
  const DATOS = { oferta_neg: 45_000_000, manifestaciones: 22, ofertas_recibidas: 8 }

  it('con los tres datos, presenta y los deja escritos', () => {
    const patch = patchPresentarLicitacion(lista(), ACTOR, AHORA, DATOS)
    expect(patch).not.toBeNull()
    expect(patch!.estado).toBe('presentada')
    expect(patch!.oferta_neg).toBe(45_000_000)
    expect(patch!.manifestaciones).toBe(22)
    expect(patch!.ofertas_recibidas).toBe(8)
    expect(activaConsistente(patch!.estado, patch!.activa)).toBe(true)
  })

  it('CLAVE: falta CUALQUIERA de los tres y no se presenta', () => {
    for (const k of ['oferta_neg', 'manifestaciones', 'ofertas_recibidas'] as const) {
      const parcial = { ...DATOS }
      delete (parcial as Record<string, unknown>)[k]
      expect(patchPresentarLicitacion(lista(), ACTOR, AHORA, parcial), k).toBeNull()
    }
  })

  it('el predicado del botón y el del builder son EL MISMO', () => {
    // Si divergieran, el botón se habilitaría para un patch que devuelve null.
    expect(datosPresentacionCompletos(DATOS)).toBe(true)
    expect(datosPresentacionCompletos({ ...DATOS, manifestaciones: undefined })).toBe(false)
    expect(datosPresentacionCompletos({})).toBe(false)
  })

  it('cero es un dato válido: nadie manifestó, y eso se registra', () => {
    expect(datosPresentacionCompletos({ ...DATOS, manifestaciones: 0 })).toBe(true)
  })

  it('RECHAZO: negativos y no-números', () => {
    expect(datosPresentacionCompletos({ ...DATOS, ofertas_recibidas: -1 })).toBe(false)
    expect(datosPresentacionCompletos({ ...DATOS, oferta_neg: NaN })).toBe(false)
  })

  it('RECHAZO: presentar en rojo sin override (el portero sigue vivo)', () => {
    const roja = base({ estado: 'en_preparacion', consecutivo: CONS, semaforo: 'rojo' })
    expect(patchPresentarLicitacion(roja, ACTOR, AHORA, DATOS)).toBeNull()
  })

  it('RECHAZO: presentar sin consecutivo cuando la invariante 6 lo exige', () => {
    const sinNumero = base({ estado: 'en_preparacion', consecutivo: '' })
    expect(patchPresentarLicitacion(sinNumero, ACTOR, AHORA, DATOS)).toBeNull()
  })

  it('un MIGRADO puede presentarse sin consecutivo', () => {
    const historico = base({ estado: 'en_preparacion', consecutivo: '', migrado: true })
    expect(patchPresentarLicitacion(historico, ACTOR, AHORA, DATOS)).not.toBeNull()
  })

  it('RECHAZO: desde un estado que no lleva a presentada', () => {
    expect(patchPresentarLicitacion(base({ estado: 'detectada' }), ACTOR, AHORA, DATOS)).toBeNull()
  })
})

describe('cierre con RESULTADO — quién ganó y con cuánto', () => {
  const presentada = () => base({ estado: 'presentada', consecutivo: CONS, oferta_neg: 45_000_000 })
  const DATOS = { oferta_ganador: 38_500_000, ganador: { nombre: 'Otra S.A.S.', nit: '900.111.222-3' } }

  it('cierra en perdida con el ganador registrado', () => {
    const patch = patchCerrarConResultado(presentada(), 'perdida', ACTOR, AHORA, DATOS)
    expect(patch).not.toBeNull()
    expect(patch!.estado).toBe('perdida')
    expect(patch!.oferta_ganador).toBe(38_500_000)
    expect(patch!.ganador.nombre).toBe('Otra S.A.S.')
    expect(patch!.activa).toBe(false)
  })

  it('CLAVE: adjudicada TAMBIÉN exige el monto — sin él no hay pctGanador', () => {
    expect(patchCerrarConResultado(presentada(), 'adjudicada', ACTOR, AHORA, {
      ganador: { nombre: 'NEG Ingeniería S.A.S. BIC', nit: '900.975.870-1' },
    })).toBeNull()
  })

  it('RECHAZO: sin nombre del ganador', () => {
    expect(patchCerrarConResultado(presentada(), 'perdida', ACTOR, AHORA, {
      oferta_ganador: 1, ganador: { nombre: '   ', nit: '' },
    })).toBeNull()
  })

  it('el NIT del ganador es opcional (SECOP no siempre lo publica)', () => {
    expect(datosResultadoCompletos({
      oferta_ganador: 1_000, ganador: { nombre: 'Alguien', nit: '' },
    })).toBe(true)
  })

  it('recorta los espacios del nombre y del NIT', () => {
    const patch = patchCerrarConResultado(presentada(), 'perdida', ACTOR, AHORA, {
      oferta_ganador: 1_000, ganador: { nombre: '  Otra S.A.S.  ', nit: '  900  ' },
    })
    expect(patch!.ganador).toEqual({ nombre: 'Otra S.A.S.', nit: '900' })
  })

  it('RECHAZO: desde un estado que no lleva a resultado', () => {
    expect(patchCerrarConResultado(base({ estado: 'en_evaluacion' }), 'perdida', ACTOR, AHORA, DATOS)).toBeNull()
  })

  it('los otros tres terminales NO pasan por acá — no hubo ganador', () => {
    // rechazada/revocada/desierta van por patchAvanzarLicitacion.
    for (const t of ['rechazada', 'revocada', 'desierta'] as const) {
      expect(patchAvanzarLicitacion(presentada(), t, ACTOR, AHORA)).not.toBeNull()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Derivados
// ─────────────────────────────────────────────────────────────────────────────

describe('pctNeg / pctGanador — derivados, jamás persistidos', () => {
  it('calculan el porcentaje sobre el presupuesto oficial', () => {
    const l = base({ presupuesto_oficial: 10_000_000, oferta_neg: 8_700_000, oferta_ganador: 8_200_000 })
    expect(pctNeg(l)).toBeCloseTo(87, 6)
    expect(pctGanador(l)).toBeCloseTo(82, 6)
  })

  it('null con presupuesto_oficial en 0 — jamás una división por cero disfrazada', () => {
    const l = base({ presupuesto_oficial: 0, oferta_neg: 5_000_000, oferta_ganador: 4_800_000 })
    expect(pctNeg(l)).toBeNull()
    expect(pctGanador(l)).toBeNull()
  })

  it('null con presupuesto negativo', () => {
    const l = base({ presupuesto_oficial: -1, oferta_neg: 100, oferta_ganador: 100 })
    expect(pctNeg(l)).toBeNull()
    expect(pctGanador(l)).toBeNull()
  })

  it('null cuando falta la oferta, aunque el presupuesto sea válido', () => {
    const l = base({ presupuesto_oficial: 6_011_508 })
    expect(pctNeg(l)).toBeNull()
    expect(pctGanador(l)).toBeNull()
  })

  it('una oferta en 0 es un dato, no una ausencia: devuelve 0, no null', () => {
    const l = base({ presupuesto_oficial: 1_000_000, oferta_neg: 0 })
    expect(pctNeg(l)).toBe(0)
  })

  it('admiten ofertas por encima del presupuesto (dato real, no se recorta)', () => {
    const l = base({ presupuesto_oficial: 1_000_000, oferta_ganador: 1_050_000 })
    expect(pctGanador(l)).toBeCloseTo(105, 6)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Trazabilidad y pureza de los builders
// ─────────────────────────────────────────────────────────────────────────────

describe('builders — sello de trazabilidad y pureza', () => {
  it('todo patch de estado arrastra quién y cuándo', () => {
    const casos = [
      patchAvanzarLicitacion(base(), 'en_evaluacion', ACTOR, AHORA),
      patchDescartarLicitacion(base(), ACTOR, AHORA, 'UBICACION'),
      patchReabrirLicitacion(base({ estado: 'descartada', motivo_descarte: 'UBICACION', activa: false }), ACTOR, AHORA),
      patchOverrideSemaforo(base(), ACTOR, AHORA, { semaforo: 'rojo', motivo: 'x' }),
    ]
    for (const patch of casos) {
      expect(patch!.actualizado_por).toBe('uid-karen')
      expect(patch!.actualizado_en).toBe(AHORA)
    }
  })

  it('ningún builder muta la licitación de entrada', () => {
    const l = base({ estado: 'en_evaluacion' })
    const copia = JSON.parse(JSON.stringify({ ...l, creado_en: null, actualizado_en: null, semaforo_calculado_en: null, cronograma: null }))
    patchAvanzarLicitacion(l, 'en_preparacion', ACTOR, AHORA, { consecutivo: CONS })
    patchDescartarLicitacion(l, ACTOR, AHORA, 'OTRO')
    patchOverrideSemaforo(l, ACTOR, AHORA, { semaforo: 'rojo', motivo: 'x' })
    patchRecalcularSemaforo(l, { semaforo: 'rojo', motivos: [], version: 'v1.0' }, AHORA)
    const despues = JSON.parse(JSON.stringify({ ...l, creado_en: null, actualizado_en: null, semaforo_calculado_en: null, cronograma: null }))
    expect(despues).toEqual(copia)
  })

  it('el recorrido feliz completo encadena sin romper invariantes', () => {
    let l = base()
    const aplicar = (patch: Record<string, unknown> | null) => {
      expect(patch).not.toBeNull()
      l = { ...l, ...patch } as Licitacion
      expect(licitacionConsistente(l)).toBe(true)
    }
    aplicar(patchAvanzarLicitacion(l, 'en_evaluacion', ACTOR, AHORA))
    aplicar(patchAvanzarLicitacion(l, 'en_preparacion', ACTOR, AHORA, { consecutivo: CONS }))
    expect(l.consecutivo).toBe(CONS)
    aplicar(patchAvanzarLicitacion(l, 'manifestada', ACTOR, AHORA))
    aplicar(patchAvanzarLicitacion(l, 'presentada', ACTOR, AHORA))
    aplicar(patchAvanzarLicitacion(l, 'adjudicada', ACTOR, AHORA))
    expect(l.estado).toBe('adjudicada')
    expect(l.activa).toBe(false)
    expect(l.motivo_descarte).toBeNull()
  })

  it('el recorrido descarte -> reapertura -> avance también', () => {
    let l = base()
    const aplicar = (patch: Record<string, unknown> | null) => {
      expect(patch).not.toBeNull()
      l = { ...l, ...patch } as Licitacion
      expect(licitacionConsistente(l)).toBe(true)
    }
    aplicar(patchDescartarLicitacion(l, ACTOR, AHORA, 'BAJO_PRESUPUESTO'))
    expect(l.activa).toBe(false)
    aplicar(patchReabrirLicitacion(l, ACTOR, AHORA))
    expect(l.estado).toBe('en_evaluacion')
    expect(l.activa).toBe(true)
    aplicar(patchAvanzarLicitacion(l, 'en_preparacion', ACTOR, AHORA, { consecutivo: CONS }))
    expect(l.consecutivo).toBe(CONS)
  })
})
