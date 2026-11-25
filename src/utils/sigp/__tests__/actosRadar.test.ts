/**
 * Los cuatro actos sobre producción, probados como planes.
 *
 * Lo que estos tests vigilan no es que el plan "funcione": es que las GUARDAS
 * se nieguen. Un acto de datos que hace lo correcto en el caso feliz y además
 * pisa un dato cuando el caso no es feliz no sirve — y el caso no feliz no se
 * ve en producción hasta que ya pasó.
 */
import { describe, it, expect } from 'vitest'
import type { Timestamp } from '../../../types/sigp/licitacion'
import {
  planCompletarRadar, planRetirarPorLexico, planFusionarDuplicados,
  planRecalcularSemaforo, huellaDePersona, VERSION_A_ESCRIBIR,
} from '../actosRadar'

const AHORA = { seconds: 1, nanoseconds: 0 } as unknown as Timestamp
const ACTOR = 'uid-giovanny'

// ════════════════════════════════════════════════════════════════════════════

describe('ACTO 1a — completar los hechos, sin reescribir ninguno', () => {
  const radarViejo = {
    senal: 'texto_coincide', terminos: ['ADECUACION'],
    vocabulario_version: 'v1.0 (empaquetada)', corrida: 'c1',
    origen_fecha: 'publicacion',
  }

  it('llena los tres sub-campos que faltaban', () => {
    const plan = planCompletarRadar(
      [{ id: 'd1', numero_proceso: 'SAMC-025-2026 (Presentación de oferta)', radar: { ...radarViejo } }],
      new Map([['d1', { fase: 'Presentación de oferta', portafolio: 'PF-9' }]]),
    )
    expect(plan.patches).toHaveLength(1)
    expect(plan.patches[0].llenados.sort()).toEqual(['fase', 'fases_previas', 'portafolio'])
    expect(plan.patches[0].patch.radar).toMatchObject({
      fase: 'Presentación de oferta',
      portafolio: 'PF-9',
      // La fase ACTUAL no se cuenta como previa.
      fases_previas: [],
    })
    // Y lo que ya estaba sigue ahí.
    expect(plan.patches[0].patch.radar.senal).toBe('texto_coincide')
    expect(plan.patches[0].patch.radar.vocabulario_version).toBe('v1.0 (empaquetada)')
  })

  it('las fases PREVIAS salen del numero menos la actual', () => {
    const plan = planCompletarRadar(
      [{
        id: 'd1',
        numero_proceso: 'SAMC-025-2026 (Manifestación de interés (Menor Cuantía)) (Presentación de oferta)',
        radar: { ...radarViejo },
      }],
      new Map([['d1', { fase: 'Presentación de oferta', portafolio: 'PF-9' }]]),
    )
    expect(plan.patches[0].patch.radar.fases_previas)
      .toEqual(['Manifestación de interés (Menor Cuantía)'])
  })

  it('LA GUARDA: un sub-campo con valor NO se toca, aunque el origen diga otra cosa', () => {
    const plan = planCompletarRadar(
      [{
        id: 'd1',
        numero_proceso: 'X-1',
        radar: { ...radarViejo, fase: 'Presentación de oferta', portafolio: 'PF-VIEJO' },
      }],
      new Map([['d1', { fase: 'OTRA FASE', portafolio: 'PF-NUEVO' }]]),
    )
    // Solo se llena lo que faltaba.
    expect(plan.patches[0].llenados).toEqual(['fases_previas'])
    expect(plan.patches[0].patch.radar.fase).toBe('Presentación de oferta')
    expect(plan.patches[0].patch.radar.portafolio).toBe('PF-VIEJO')
    // Y la negativa queda CONTADA: es la prueba de que la guarda operó.
    expect(plan.respetados).toEqual([{ id: 'd1', campos: ['fase', 'portafolio'] }])
  })

  it('un `null` del origen tambien es un valor: no se pisa', () => {
    // Un `fase: null` escrito por el origen significa «este proceso no tiene
    // fase». Sobrescribirlo seria justo lo que la guarda prohibe.
    const plan = planCompletarRadar(
      [{ id: 'd1', numero_proceso: 'X-1', radar: { ...radarViejo, fase: null } }],
      new Map([['d1', { fase: 'Presentación de oferta', portafolio: 'PF-9' }]]),
    )
    expect(plan.patches[0].patch.radar.fase).toBeNull()
    expect(plan.respetados[0].campos).toContain('fase')
  })

  it('si ya tenia todo, no se escribe nada', () => {
    const plan = planCompletarRadar(
      [{
        id: 'd1', numero_proceso: 'X-1',
        radar: { ...radarViejo, fase: null, fases_previas: [], portafolio: null },
      }],
      new Map([['d1', { fase: null, portafolio: null }]]),
    )
    expect(plan.patches).toEqual([])
    expect(plan.sin_cambio).toBe(1)
  })

  it('sin `radar` no es del radar: no se toca', () => {
    const plan = planCompletarRadar(
      [{ id: 'h1', numero_proceso: 'X', radar: null }], new Map())
    expect(plan.patches).toEqual([])
    expect(plan.sin_radar).toBe(1)
  })

  it('si el origen no devolvio nada, no se inventa', () => {
    const plan = planCompletarRadar(
      [{ id: 'd1', numero_proceso: 'X', radar: { ...radarViejo } }], new Map())
    expect(plan.patches).toEqual([])
    expect(plan.sin_datos_del_origen).toBe(1)
  })

  it('el patch toca SOLO `radar`', () => {
    const plan = planCompletarRadar(
      [{ id: 'd1', numero_proceso: 'X-1', radar: { ...radarViejo } }],
      new Map([['d1', { fase: null, portafolio: 'PF-1' }]]),
    )
    expect(Object.keys(plan.patches[0].patch)).toEqual(['radar'])
  })

  it('cuenta cuantos quedan con portafolio — lo que el 3b podra agrupar', () => {
    const plan = planCompletarRadar([
      { id: 'a', numero_proceso: 'X', radar: { ...radarViejo } },
      { id: 'b', numero_proceso: 'Y', radar: { ...radarViejo } },
    ], new Map([
      ['a', { fase: null, portafolio: 'PF-1' }],
      ['b', { fase: null, portafolio: null }],
    ]))
    expect(plan.con_portafolio).toBe(1)
  })
})

// ════════════════════════════════════════════════════════════════════════════

describe('ACTO 1b — retirar lo que el lexico ya no reconoce', () => {
  const sirve = (o: string) => o.includes('CUBIERTA')

  it('retira lo que el criterio nuevo no reconoce', () => {
    const plan = planRetirarPorLexico(
      [{ id: 'd1', objeto: 'CAPACITACION EN IA', estado: 'detectada' }],
      sirve, 'RUIDO_LEXICO', ACTOR, AHORA)
    expect(plan.patches).toHaveLength(1)
    expect(plan.patches[0].patch).toMatchObject({
      estado: 'descartada', motivo_descarte: 'RUIDO_LEXICO', activa: false,
      actualizado_por: ACTOR,
    })
  })

  it('lo que sigue calificando no se toca', () => {
    const plan = planRetirarPorLexico(
      [{ id: 'd1', objeto: 'MANTENIMIENTO DE CUBIERTA', estado: 'detectada' }],
      sirve, 'RUIDO_LEXICO', ACTOR, AHORA)
    expect(plan.patches).toEqual([])
    expect(plan.siguen).toBe(1)
  })

  it('LA GUARDA: donde una persona trabajo, no se toca', () => {
    // El lexico se equivoco al traerlo; retirarlo borraria el trabajo de
    // alguien para tapar nuestro error.
    const casos = [
      { override_manual: { por: 'x' } },
      { oferta_neg: { valor: 1 } },
      { manifestaciones: { una: true } },
    ]
    for (const extra of casos) {
      const plan = planRetirarPorLexico(
        [{ id: 'd1', objeto: 'CAPACITACION EN IA', estado: 'detectada', ...extra }],
        sirve, 'RUIDO_LEXICO', ACTOR, AHORA)
      expect(plan.patches, JSON.stringify(extra)).toEqual([])
      expect(plan.intocables).toHaveLength(1)
    }
  })

  it('un objeto vacio o un `oferta_neg` vacio no cuentan como huella', () => {
    const plan = planRetirarPorLexico(
      [{ id: 'd1', objeto: 'CAPACITACION', estado: 'detectada', oferta_neg: {}, override_manual: null }],
      sirve, 'RUIDO_LEXICO', ACTOR, AHORA)
    expect(plan.patches).toHaveLength(1)
    expect(huellaDePersona({ oferta_neg: {}, override_manual: null })).toEqual([])
  })

  it('lo que ya avanzo de estado es de la maquina, no de un acto de limpieza', () => {
    const plan = planRetirarPorLexico(
      [{ id: 'd1', objeto: 'CAPACITACION', estado: 'manifestada' }],
      sirve, 'RUIDO_LEXICO', ACTOR, AHORA)
    expect(plan.patches).toEqual([])
    expect(plan.fuera_de_juego).toBe(1)
  })

  it('un objeto vacio no se retira: no hay con que juzgarlo', () => {
    const plan = planRetirarPorLexico(
      [{ id: 'd1', objeto: '  ', estado: 'detectada' }],
      sirve, 'RUIDO_LEXICO', ACTOR, AHORA)
    expect(plan.patches).toEqual([])
    expect(plan.siguen).toBe(1)
  })
})

// ════════════════════════════════════════════════════════════════════════════

describe('ACTO 3b — los duplicados ya escritos', () => {
  const doc = (id: string, portafolio: string | null, previas: string[] = [], extra = {}) => ({
    id,
    estado: 'detectada',
    radar: { portafolio, fases_previas: previas } as never,
    ...extra,
  })

  it('se queda el de la fase MAS AVANZADA', () => {
    const plan = planFusionarDuplicados([
      doc('a', 'PF-1', []),
      doc('b', 'PF-1', ['Manifestación de interés (Menor Cuantía)']),
    ], 'DUPLICADO', ACTOR, AHORA)
    expect(plan.grupos).toEqual([{ portafolio: 'PF-1', se_queda: 'b', salen: ['a'] }])
    expect(plan.patches).toHaveLength(1)
    expect(plan.patches[0].id).toBe('a')
    expect(plan.patches[0].patch.motivo_descarte).toBe('DUPLICADO')
  })

  it('agrupa por PORTAFOLIO, nunca por el texto del objeto', () => {
    // Dos licitaciones distintas pueden tener el objeto palabra por palabra
    // igual. Emparejar por objeto sirvio para MEDIR, no para escribir.
    const plan = planFusionarDuplicados([
      doc('a', 'PF-1'), doc('b', 'PF-2'),
    ], 'DUPLICADO', ACTOR, AHORA)
    expect(plan.patches).toEqual([])
    expect(plan.grupos).toEqual([])
  })

  it('LA GUARDA: con trabajo humano en DOS del grupo, no toca nada', () => {
    // Fusionar ahi seria decidir cual trabajo humano vale mas, y eso no lo
    // decide un script.
    const plan = planFusionarDuplicados([
      doc('a', 'PF-1', [], { oferta_neg: { v: 1 } }),
      doc('b', 'PF-1', ['x'], { manifestaciones: { m: 1 } }),
    ], 'DUPLICADO', ACTOR, AHORA)
    expect(plan.patches).toEqual([])
    expect(plan.grupos).toEqual([])
    expect(plan.grupos_con_huella).toHaveLength(1)
    expect(plan.grupos_con_huella[0].ids.map(x => x.id).sort()).toEqual(['a', 'b'])
  })

  it('con huella en UNO solo, ese se queda — aunque su fase sea anterior', () => {
    const plan = planFusionarDuplicados([
      doc('a', 'PF-1', [], { oferta_neg: { v: 1 } }),
      doc('b', 'PF-1', ['x']),
    ], 'DUPLICADO', ACTOR, AHORA)
    expect(plan.grupos[0].se_queda).toBe('a')
    expect(plan.patches[0].id).toBe('b')
  })

  it('sin portafolio no se puede agrupar: queda contado', () => {
    const plan = planFusionarDuplicados([
      doc('a', null), doc('b', ''),
    ], 'DUPLICADO', ACTOR, AHORA)
    expect(plan.sin_portafolio).toBe(2)
    expect(plan.patches).toEqual([])
  })

  it('un portafolio con UN solo documento no es un duplicado', () => {
    const plan = planFusionarDuplicados([doc('a', 'PF-1')], 'DUPLICADO', ACTOR, AHORA)
    expect(plan.patches).toEqual([])
    expect(plan.grupos).toEqual([])
  })

  it('tres del mismo portafolio: se queda uno, salen dos', () => {
    const plan = planFusionarDuplicados([
      doc('a', 'PF-1', []), doc('b', 'PF-1', ['x']), doc('c', 'PF-1', ['x', 'y']),
    ], 'DUPLICADO', ACTOR, AHORA)
    expect(plan.grupos[0].se_queda).toBe('c')
    expect(plan.patches.map(p => p.id).sort()).toEqual(['a', 'b'])
  })

  it('el que se queda NUNCA esta entre los patches', () => {
    const plan = planFusionarDuplicados([
      doc('a', 'PF-1', []), doc('b', 'PF-1', ['x']),
      doc('c', 'PF-2', []), doc('d', 'PF-2', ['x']),
    ], 'DUPLICADO', ACTOR, AHORA)
    const quedan = new Set(plan.grupos.map(g => g.se_queda))
    for (const p of plan.patches) expect(quedan.has(p.id), p.id).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════════════════

describe('ACTO 1c — recalcular el semaforo', () => {
  const lic = (over: Record<string, unknown> = {}) => ({
    id: 'd1',
    modalidad: 'menor_cuantia',
    semaforo: 'rojo',
    semaforo_motivos: ['MODALIDAD_SIN_HISTORIAL'],
    semaforo_version: 'v1.0',
    entidad: { departamento: 'Cundinamarca' },
    cronograma: { sorteo: null },
    ...over,
  }) as never

  it('la menor cuantia deja de ser roja, y la version se mueve CON motivo', () => {
    const plan = planRecalcularSemaforo([lic()], 'adopción de v1.1', AHORA)
    expect(plan.patches).toHaveLength(1)
    expect(plan.patches[0].antes).toEqual({ semaforo: 'rojo', version: 'v1.0' })
    expect(plan.patches[0].despues.semaforo).toBe('amarillo')
    expect(plan.patches[0].despues.version).toBe(VERSION_A_ESCRIBIR)
    expect(plan.patches[0].patch.semaforo_version).toBe(VERSION_A_ESCRIBIR)
    expect(plan.dejan_de_ser_rojo).toBe(1)
  })

  it('LA INVARIANTE 5: sin motivo, el constructor rechaza y el acto lo dice', () => {
    const plan = planRecalcularSemaforo([lic()], '   ', AHORA)
    expect(plan.patches).toEqual([])
    expect(plan.rechazados).toHaveLength(1)
  })

  it('un documento con la version ya puesta no se vuelve a tocar', () => {
    const plan = planRecalcularSemaforo(
      [lic({ semaforo_version: VERSION_A_ESCRIBIR, semaforo: 'amarillo', semaforo_motivos: ['MENOR_CUANTIA'] })],
      'adopción de v1.1', AHORA)
    expect(plan.patches).toEqual([])
    expect(plan.sin_cambio).toBe(1)
  })

  it('la minima cuantia sigue verde: el acto no la mueve de color', () => {
    const plan = planRecalcularSemaforo(
      [lic({ modalidad: 'minima_cuantia', semaforo: 'verde', semaforo_motivos: [] })],
      'adopción de v1.1', AHORA)
    // Cambia de version pero no de color.
    expect(plan.patches[0].despues.semaforo).toBe('verde')
    expect(plan.pasan_a_rojo).toBe(0)
  })

  it('NOMBRA el dato que el adaptador ignora, en vez de pasarlo en silencio', () => {
    // Una fecha de sorteo puesta a mano NO entra al calculo —el adaptador del
    // radar la deja en false— y eso tiene que verse.
    const plan = planRecalcularSemaforo(
      [lic({ cronograma: { sorteo: '2026-12-01' } })], 'adopción de v1.1', AHORA)
    expect(plan.con_dato_que_el_adaptador_ignora)
      .toEqual([{ id: 'd1', campos: ['cronograma.sorteo'] }])
  })

  it('el patch lleva la fecha del calculo, que es como se sabe cuando se hizo', () => {
    const plan = planRecalcularSemaforo([lic()], 'adopción de v1.1', AHORA)
    expect(plan.patches[0].patch.semaforo_calculado_en).toBe(AHORA)
  })
})

// ════════════════════════════════════════════════════════════════════════════
//  EL PATCH DE DESCARTE SALE DEL DUENO DE LA INVARIANTE, NO DEL ACTO
// ════════════════════════════════════════════════════════════════════════════

describe('el patch de descarte, campo por campo', () => {
  const sirve = (o: string) => o.includes('CUBIERTA')
  const RADAR = { portafolio: 'PF-1', fases_previas: [] }

  // ── EL DEFECTO QUE ESTE BLOQUE EXISTE PARA ATRAPAR ────────────────────────
  //
  // La primera version de los planificadores armaba este patch a mano y
  // escribia `fecha_actualizacion` — el nombre que usan `accionMejora` y
  // `asignacion`, NO esta coleccion, que usa `actualizado_en`. Habria dejado 34
  // documentos de produccion con un campo que nadie lee y el campo real sin
  // mover.
  //
  // Y los 29 tests de este archivo pasaban igual, porque el unico que miraba
  // el patch usaba `toMatchObject` con los tres campos de la invariante: una
  // comprobacion de SUBCONJUNTO no ve el campo equivocado que si esta. Es la
  // misma leccion otra vez, en su forma mas cara: «hay test» no es «el test
  // cubre este caso».
  it('CLAVE: lleva `actualizado_en`, el campo de ESTA coleccion', () => {
    const plan = planRetirarPorLexico(
      [{ id: 'd1', objeto: 'CAPACITACION', estado: 'detectada', radar: RADAR }],
      sirve, 'RUIDO_LEXICO', ACTOR, AHORA)
    const patch = plan.patches[0].patch as Record<string, unknown>
    expect(patch.actualizado_en).toBe(AHORA)
    expect(patch.actualizado_por).toBe(ACTOR)
    expect(patch).not.toHaveProperty('fecha_actualizacion')
  })

  it('CLAVE: lleva el SELLO DEL TRIAGE — descartar una fila del radar ES el triage', () => {
    // Sin esto el documento queda sin registro de quien lo saco de la seccion
    // del radar, que es justamente la pregunta que el sello responde.
    const plan = planRetirarPorLexico(
      [{ id: 'd1', objeto: 'CAPACITACION', estado: 'detectada', radar: RADAR }],
      sirve, 'RUIDO_LEXICO', ACTOR, AHORA)
    const patch = plan.patches[0].patch as Record<string, unknown>
    expect(patch.revisado_por).toBe(ACTOR)
    expect(patch.revisado_en).toBe(AHORA)
  })

  it('sin bloque radar NO hay sello de triage: no hubo triage que registrar', () => {
    const plan = planRetirarPorLexico(
      [{ id: 'd1', objeto: 'CAPACITACION', estado: 'detectada', radar: null }],
      sirve, 'RUIDO_LEXICO', ACTOR, AHORA)
    const patch = plan.patches[0].patch as Record<string, unknown>
    expect(patch).not.toHaveProperty('revisado_por')
    expect(patch.estado).toBe('descartada')
  })

  it('el patch no trae nada mas que lo que el dueno declara', () => {
    const plan = planRetirarPorLexico(
      [{ id: 'd1', objeto: 'CAPACITACION', estado: 'detectada', radar: RADAR }],
      sirve, 'RUIDO_LEXICO', ACTOR, AHORA)
    expect(Object.keys(plan.patches[0].patch).sort()).toEqual([
      'activa', 'actualizado_en', 'actualizado_por', 'estado',
      'motivo_descarte', 'revisado_en', 'revisado_por',
    ])
  })

  it('un motivo que no existe lo RECHAZA el dueno, y se reporta', () => {
    // Que el dueno de la invariante diga no a un acto de limpieza no es un
    // estorbo: es la invariante funcionando. Lo que importa es que el rechazo
    // se vea, no que se cuente en silencio.
    const plan = planRetirarPorLexico(
      [{ id: 'd1', objeto: 'CAPACITACION', estado: 'detectada', radar: RADAR }],
      sirve, 'NO_EXISTE' as never, ACTOR, AHORA)
    expect(plan.patches).toEqual([])
    expect(plan.rechazados).toHaveLength(1)
    expect(plan.rechazados[0].id).toBe('d1')
    expect(plan.rechazados[0].por).toContain('NO_EXISTE')
  })

  it('el 3b arma el mismo patch, con su propio motivo', () => {
    const plan = planFusionarDuplicados(
      [
        { id: 'a', estado: 'detectada', radar: { portafolio: 'PF-9', fases_previas: ['x'] } },
        { id: 'b', estado: 'detectada', radar: { portafolio: 'PF-9', fases_previas: [] } },
      ],
      'DUPLICADO', ACTOR, AHORA)
    const patch = plan.patches[0].patch as Record<string, unknown>
    expect(plan.patches[0].id).toBe('b')
    expect(patch.motivo_descarte).toBe('DUPLICADO')
    expect(patch.actualizado_en).toBe(AHORA)
    expect(patch.revisado_por).toBe(ACTOR)
    expect(patch).not.toHaveProperty('fecha_actualizacion')
    expect(plan.rechazados).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════════════════
//  ADMITIR ES HUELLA, Y EN EL 3b ESO ELIGE
// ════════════════════════════════════════════════════════════════════════════

describe('admitir cuenta como trabajo humano', () => {
  it('un documento que avanzo de estado tiene huella, sin oferta ni nada mas', () => {
    expect(huellaDePersona({ estado: 'en_evaluacion' })[0]).toContain('admitida')
    expect(huellaDePersona({ estado: 'detectada' })).toEqual([])
    expect(huellaDePersona({})).toEqual([])
  })

  it('CLAVE: de dos duplicados, se queda el que alguien ADMITIO', () => {
    // Y no el de la fase mas avanzada. Sin esta regla el acto se habria
    // quedado con `a` —arrastra dos fases previas— y habria descartado `b`,
    // que es el que Karen abrio. El trabajo de una persona manda sobre la fase.
    const plan = planFusionarDuplicados(
      [
        { id: 'a', estado: 'detectada', radar: { portafolio: 'PF-7', fases_previas: ['x', 'y'] } },
        { id: 'b', estado: 'en_evaluacion', radar: { portafolio: 'PF-7', fases_previas: [] } },
      ],
      'DUPLICADO', ACTOR, AHORA)
    expect(plan.grupos).toEqual([{ portafolio: 'PF-7', se_queda: 'b', salen: ['a'] }])
    expect(plan.patches.map(x => x.id)).toEqual(['a'])
  })

  it('si DOS del grupo tienen huella, el acto se abstiene', () => {
    const plan = planFusionarDuplicados(
      [
        { id: 'a', estado: 'en_evaluacion', radar: { portafolio: 'PF-8', fases_previas: [] } },
        {
          id: 'b', estado: 'detectada', oferta_neg: { valor: 1 },
          radar: { portafolio: 'PF-8', fases_previas: [] },
        },
      ],
      'DUPLICADO', ACTOR, AHORA)
    expect(plan.patches).toEqual([])
    expect(plan.grupos).toEqual([])
    expect(plan.grupos_con_huella).toHaveLength(1)
    expect(plan.grupos_con_huella[0].ids.map(x => x.id).sort()).toEqual(['a', 'b'])
  })

  it('lo que SALE de una fusion esta siempre en `detectada`', () => {
    // La consecuencia que hace legal el patch: una admitida o se queda (huella
    // unica) o manda al grupo entero a `grupos_con_huella`. Nunca sale.
    const plan = planFusionarDuplicados(
      [
        { id: 'a', estado: 'detectada', radar: { portafolio: 'PF-6', fases_previas: [] } },
        { id: 'b', estado: 'manifestada', radar: { portafolio: 'PF-6', fases_previas: [] } },
        { id: 'c', estado: 'detectada', radar: { portafolio: 'PF-6', fases_previas: [] } },
      ],
      'DUPLICADO', ACTOR, AHORA)
    expect(plan.grupos[0].se_queda).toBe('b')
    expect(plan.grupos[0].salen.slice().sort()).toEqual(['a', 'c'])
    expect(plan.rechazados).toEqual([])
  })
})
