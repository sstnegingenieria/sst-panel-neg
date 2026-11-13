/**
 * La corrida del radar (B.2, capa pura) — guarda de volumen, re-escritura
 * idempotente y registro. Sin red: el `fetch` global queda roto a propósito.
 *
 * Estas tres son las decisiones que pueden hacer daño —volcar el histórico
 * sobre la bandeja, pisar el trabajo de Karen, o dejar una corrida sin
 * rastro— así que se prueban acá y no con un deploy.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash } from 'node:crypto'
import FIXTURES from './fixtures/secop.p6dx-8zbt.json'
import {
  GUARDA_VOLUMEN, evaluarVolumen, evaluarVentana, diasDeVentana,
  CAMPOS_REFRESCABLES, CAMPOS_PROTEGIDOS,
  patchRadarSobreExistente, hayQueEscribir, planearEscritura, completarSiFalta,
  construirRegistroCorrida, marcaSiguiente, resumenLegible, cuantosCrearia,
  sellarParaEscritura, fechasATimestamp, ACTOR_RADAR,
  avanzarEstadoRadar, MAX_CORRIDAS_EN_HISTORIAL, ESTADO_RADAR_INICIAL,
} from '../radarCorrida'
import {
  ingerirSecop, construirResumenCorrida, colapsarPorProceso, mapearProceso,
  type FilaSecop, type LicitacionDetectada,
} from '../secopMapeo'
import { ventanaIngesta } from '../secopConsulta'

const hash = (s: string) => createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 8)
type Caso = { consulta: string; filas: FilaSecop[] }
const casos = FIXTURES.casos as unknown as Record<string, Caso>
const caso = (k: string): FilaSecop[] => casos[k].filas

let fetchOriginal: typeof globalThis.fetch
beforeAll(() => {
  fetchOriginal = globalThis.fetch
  globalThis.fetch = (() => { throw new Error('sin red') }) as unknown as typeof globalThis.fetch
})
afterAll(() => { globalThis.fetch = fetchOriginal })

/** Un documento del radar, tomado de una fila real. */
function docDe(k: string): LicitacionDetectada {
  const { procesos } = colapsarPorProceso(caso(k))
  const r = mapearProceso(procesos[0], hash)
  if (!r) throw new Error('mapeo null')
  return r.doc
}

const AHORA = new Date('2026-11-09T12:00:00.000Z')

// ── 1. Guarda de volumen ─────────────────────────────────────────────────────

describe('guarda de VENTANA — antes de la primera petición', () => {
  // Esto vivía aguas abajo de la cosecha, y con `desde: null` la corrida moría
  // por memoria trayendo 319.531 filas antes de poder decir su propia razón.
  const sinInicio = { desde: null, hasta: '2026-11-11' }

  it('sin inicio NO procede, y lo dice sin haber consultado nada', () => {
    const r = evaluarVentana(sinInicio)
    expect(r.procede).toBe(false)
    expect(r.motivo).toContain('VENTANA SIN INICIO')
    expect(r.consultada).toBe(false)
    // LA FORMA ES PARTE DE LA HONESTIDAD: sin `crearia`, el registro no puede
    // leerse como "la API no trajo nada".
    expect(r).not.toHaveProperty('crearia')
    expect(r).not.toHaveProperty('tope')
  })

  it('una ventana de 45 días procede', () => {
    expect(evaluarVentana({ desde: '2026-09-27', hasta: '2026-11-11' }).procede).toBe(true)
  })

  it('más de 120 días no procede', () => {
    const r = evaluarVentana({ desde: '2026-01-01', hasta: '2026-11-11' })
    expect(r.procede).toBe(false)
    expect(r.motivo).toContain('VENTANA DEMASIADO ANCHA')
  })

  it('la escotilla autorizada pasa igual, pero tiene que decirlo', () => {
    expect(evaluarVentana(sinInicio, { autorizado_manual: true }).procede).toBe(true)
  })

  it('`evaluarVolumen` DELEGA las reglas de ventana: un solo nacimiento', () => {
    // Si alguien vuelve a copiar las reglas en el evaluador de abajo, este test
    // lo atrapa en cuanto los dos textos dejen de coincidir.
    const v = { ...sinInicio, primera_corrida: true }
    const arriba = evaluarVentana(v)
    const abajo = evaluarVolumen(999, v)
    expect(abajo.procede).toBe(false)
    expect(abajo.motivo).toBe(arriba.motivo)
    expect(abajo.sugerencia).toBe(arriba.sugerencia)
    // Y el de abajo SÍ trae lo contado, porque ahí ya se consultó.
    expect(abajo.consultada).toBe(true)
    expect(abajo.crearia).toBe(999)
  })
})

describe('guarda de volumen — que la primera corrida no vuelque el histórico', () => {
  it('una corrida diaria normal pasa', () => {
    const v = ventanaIngesta('2026-11-08', AHORA)
    const r = evaluarVolumen(18, v)
    expect(r.procede).toBe(true)
    expect(r.tope).toBe(GUARDA_VOLUMEN.MAX_CREADOS_POR_CORRIDA)
    expect(r.motivo).toBeNull()
  })

  it('CLAVE: la primera corrida (sin marca) NO procede sola', () => {
    // Su ventana es todo el histórico: 27.214 procesos solo del territorio.
    const v = ventanaIngesta(null, AHORA)
    expect(v.primera_corrida).toBe(true)
    expect(v.desde).toBeNull()
    const r = evaluarVolumen(27_214, v)
    expect(r.procede).toBe(false)
    expect(r.dias_ventana).toBeNull()
    expect(r.motivo).toMatch(/VENTANA SIN INICIO/)
    expect(r.sugerencia).toMatch(/barrido manual/)
  })

  it('la primera corrida CON ventana explícita tiene un tope más bajo', () => {
    const v = { desde: '2026-09-25', hasta: '2026-11-09', primera_corrida: true }
    expect(evaluarVolumen(40, v).procede).toBe(true)
    const r = evaluarVolumen(51, v)
    expect(r.procede).toBe(false)
    expect(r.tope).toBe(GUARDA_VOLUMEN.MAX_CREADOS_PRIMERA_CORRIDA)
    expect(r.motivo).toMatch(/primera corrida/)
  })

  it('una ventana demasiado ancha es un barrido, no una corrida', () => {
    const v = { desde: '2026-01-01', hasta: '2026-11-09', primera_corrida: false }
    expect(diasDeVentana(v)).toBe(312)
    const r = evaluarVolumen(10, v)
    expect(r.procede).toBe(false)
    expect(r.motivo).toMatch(/VENTANA DEMASIADO ANCHA: 312 días/)
  })

  it('demasiados documentos nuevos detienen la corrida', () => {
    const v = ventanaIngesta('2026-11-01', AHORA)
    const r = evaluarVolumen(201, v)
    expect(r.procede).toBe(false)
    expect(r.motivo).toMatch(/DEMASIADOS DOCUMENTOS NUEVOS: 201/)
    expect(evaluarVolumen(200, v).procede).toBe(true)
  })

  it('la escotilla existe pero hay que declararla', () => {
    const v = ventanaIngesta(null, AHORA)
    const r = evaluarVolumen(27_214, v, { autorizado_manual: true })
    expect(r.procede).toBe(true)
    expect(r.crearia).toBe(27_214)      // queda escrito cuánto se autorizó
  })

  it('el solape de 45 días cabe en la ventana permitida', () => {
    const v = ventanaIngesta('2026-11-09', AHORA)
    expect(v.solape_dias).toBe(45)
    expect(diasDeVentana(v)!).toBeLessThanOrEqual(GUARDA_VOLUMEN.MAX_DIAS_VENTANA)
    expect(evaluarVolumen(5, v).procede).toBe(true)
  })
})

// ── 2. Re-escritura idempotente ──────────────────────────────────────────────

describe('re-escritura: el radar no pisa el trabajo humano', () => {
  it('la partición de campos es completa y disjunta', () => {
    const r = new Set<string>(CAMPOS_REFRESCABLES)
    const p = new Set<string>(CAMPOS_PROTEGIDOS)
    const ambos = [...r].filter(c => p.has(c))
    expect(ambos, 'un campo no puede ser refrescable y protegido').toEqual([])
    // La exhaustividad la verifica el compilador (`_TODOS_LOS_CAMPOS`); acá se
    // comprueba contra un documento real, que es la otra mitad del contrato.
    const doc = docDe('minima_limpia')
    const sinClasificar = Object.keys(doc).filter(c => !r.has(c) && !p.has(c))
    expect(sinClasificar).toEqual([])
  })

  it('CLAVE: leer dos veces el MISMO proceso no escribe nada', () => {
    const doc = docDe('minima_limpia')
    const p = patchRadarSobreExistente(doc, doc)
    expect(p.cambios).toEqual([])
    expect(p.patch).toEqual({})
    expect(hayQueEscribir(p)).toBe(false)
  })

  it('CLAVE: el SELLO de la corrida no es un cambio material', () => {
    // El mapeo produce siempre `corrida: null` y el escritor le pone el id al
    // crear. Comparar el guardado (con sello) contra el mapeado (sin sello)
    // hacía que `radar` saliera como cambio material en TODOS los documentos
    // y en TODAS las corridas. Medido en producción el 12-nov-2026: la corrida
    // de las 19:00 reportó 24 cambios materiales, los 24 en `radar`, ninguno
    // real. Un campo que grita siempre es la forma de que nadie mire la lista.
    const guardado = docDe('minima_limpia')
    const sellado = { ...guardado, radar: { ...guardado.radar, corrida: 'corr-2026-11-12' } }
    const mapeado = { ...guardado, radar: { ...guardado.radar, corrida: null } }
    const p = patchRadarSobreExistente(sellado, mapeado)
    expect(p.cambios_materiales).toEqual([])
    expect(p.patch).toEqual({})
  })

  it('un cambio REAL dentro de `radar` sí se cuenta', () => {
    // La otra mitad: ignorar el sello no puede volver ciega la comparación.
    const guardado = docDe('minima_limpia')
    const sellado = { ...guardado, radar: { ...guardado.radar, corrida: 'corr-1' } }
    const otro = {
      ...guardado,
      radar: { ...guardado.radar, corrida: null, vocabulario_version: 'v2.0' },
    }
    expect(patchRadarSobreExistente(sellado, otro).cambios_materiales).toEqual(['radar'])
  })

  it('COMPLETA-SI-FALTA: el documento viejo gana `fase` y `portafolio`', () => {
    // Los que el radar escribió antes de capturarlas no las tienen, y `radar`
    // es protegido. Sin esto nunca las tendrían.
    const guardado = docDe('minima_limpia')
    const viejo = { ...guardado, radar: { ...guardado.radar, corrida: 'corr-1' } }
    delete (viejo.radar as Record<string, unknown>).fase
    delete (viejo.radar as Record<string, unknown>).portafolio
    const nuevo = {
      ...guardado,
      radar: {
        ...guardado.radar, corrida: null,
        fase: 'Presentación de oferta', portafolio: 'CO1.BDOS.123',
      },
    }
    const p = patchRadarSobreExistente(viejo, nuevo)
    expect(p.patch.radar?.fase).toBe('Presentación de oferta')
    expect(p.patch.radar?.portafolio).toBe('CO1.BDOS.123')
    // Rellenar un hueco no es un cambio material.
    expect(p.cambios_materiales).toEqual([])
    // Y el sello que ya tenía NO se pierde al completar.
    expect(p.patch.radar?.corrida).toBe('corr-1')
  })

  it('COMPLETAR NO ES SOBRESCRIBIR: un sub-campo con valor se queda', () => {
    const guardado = docDe('minima_limpia')
    const viejo = {
      ...guardado,
      radar: { ...guardado.radar, corrida: 'corr-1', fase: 'Presentación de oferta' },
    }
    const nuevo = {
      ...guardado,
      radar: { ...guardado.radar, corrida: null, fase: 'OTRA COSA' },
    }
    const p = patchRadarSobreExistente(viejo, nuevo)
    expect(p.patch.radar).toBeUndefined()
    // Eso sí: la discrepancia se CUENTA. Para eso está cambios_materiales.
    expect(p.cambios_materiales).toEqual(['radar'])
  })

  it('la categoría que llega TARDE sí se refresca — para eso es el solape', () => {
    const viejo = { ...docDe('categoria_unspecified'), categoria_unspsc: null }
    const nuevo = { ...viejo, categoria_unspsc: 'V1.72101500' }
    const p = patchRadarSobreExistente(viejo, nuevo)
    expect(p.cambios).toEqual(['categoria_unspsc'])
    expect(p.patch.categoria_unspsc).toBe('V1.72101500')
  })

  it('el presupuesto corregido y el cierre nuevo se refrescan', () => {
    const viejo = docDe('minima_limpia')
    const nuevo: LicitacionDetectada = {
      ...viejo,
      presupuesto_oficial: 9_000_000,
      cronograma: { ...viejo.cronograma, cierre: '2025-02-01T05:00:00.000Z' },
    }
    const p = patchRadarSobreExistente(viejo, nuevo)
    expect(p.cambios.sort()).toEqual(['cronograma', 'presupuesto_oficial'])
  })

  it('CLAVE: NO toca el estado, el consecutivo, el semáforo ni el override', () => {
    const base = docDe('minima_limpia')
    // Como quedaría tras el trabajo de una persona.
    const trabajado = {
      ...base,
      estado: 'en_preparacion',
      consecutivo: 'LIC-2026-0007',
      semaforo: 'rojo',
      semaforo_version: 'v1.0',
      override_manual: { por: 'uid-karen', motivo: 'vale la pena' },
      oferta_neg: 5_500_000,
      manifestaciones: 12,
      responsable_uid: 'uid-karen',
      activa: true,
    } as unknown as LicitacionDetectada
    // Y el origen vuelve a traer el documento recién nacido.
    const p = patchRadarSobreExistente(trabajado, base)
    for (const campo of CAMPOS_PROTEGIDOS) {
      expect(Object.keys(p.patch), campo).not.toContain(campo)
    }
    expect(p.patch).toEqual({})     // nada descriptivo cambió
    expect(hayQueEscribir(p)).toBe(false)
  })

  it('un cambio de MODALIDAD se cuenta, no se escribe', () => {
    // Cambiarla sin recalcular el semáforo dejaría un verde con modalidad roja,
    // y recalcular es un acto explícito (invariante 5).
    const viejo = docDe('minima_limpia')
    const nuevo = { ...viejo, modalidad: 'menor_cuantia' as const }
    const p = patchRadarSobreExistente(viejo, nuevo)
    expect(p.cambios).toEqual([])
    expect(p.cambios_materiales).toEqual(['modalidad'])
  })

  it('un documento viejo sin el campo no cuenta como cambio material', () => {
    const nuevo = docDe('minima_limpia')
    const viejoSinModalidad: Partial<LicitacionDetectada> = { ...nuevo }
    delete viejoSinModalidad.modalidad
    const p = patchRadarSobreExistente(viejoSinModalidad, nuevo)
    expect(p.cambios_materiales).toEqual([])
  })
})

describe('el sello del escritor', () => {
  it('agrega lo que el mapeo no puede saber, y nada más', () => {
    const doc = docDe('minima_limpia')
    const sellado = sellarParaEscritura(doc, { corrida: 'corr-1', ahora: 'T', actor: ACTOR_RADAR })
    expect(sellado.creado_por).toBe('radar_secop')
    expect(sellado.actualizado_por).toBe('radar_secop')
    expect(sellado.creado_en).toBe('T')
    expect(sellado.actualizado_en).toBe('T')
    // El CUARTO campo del grupo del semaforo. El mapeo escribe valor, motivos y
    // version; la FECHA es del escritor, porque el mapeo es puro y no tiene
    // reloj. Faltaba, y `Licitacion` la declara obligatoria.
    expect(sellado.semaforo_calculado_en).toBe('T')
    expect(sellado.semaforo).toBe(doc.semaforo)
    expect(sellado.semaforo_version).toBe(doc.semaforo_version)
    expect((sellado.radar as { corrida: string }).corrida).toBe('corr-1')
    // Lo demás queda intacto.
    expect(sellado.id_secop).toBe(doc.id_secop)
    expect(sellado.estado).toBe('detectada')
  })

  it('`responsable_uid` nace VACÍO: nadie es dueño de lo que nadie miró', () => {
    const sellado = sellarParaEscritura(docDe('minima_limpia'),
      { corrida: 'c', ahora: 'T0', actor: ACTOR_RADAR })
    expect(sellado.responsable_uid).toBe('')
  })

  it('las fechas ISO se convierten con la fábrica que inyecte el escritor', () => {
    const doc = docDe('minima_limpia')
    expect(typeof doc.cronograma.publicacion).toBe('string')
    const conv = fechasATimestamp(doc, iso => ({ ts: iso }))
    expect(conv.cronograma.publicacion).toEqual({ ts: '2025-01-20T05:00:00.000Z' })
    expect(conv.cronograma.manifestacion).toBeNull()
    expect(conv.cronograma.sorteo).toBeNull()
    expect(conv.cronograma.adjudicacion).toBeNull()
  })

  it('un cronograma sin fechas no inventa Timestamps', () => {
    const doc = docDe('sin_fecha_publicacion')
    const conv = fechasATimestamp(doc, iso => ({ ts: iso }))
    expect(conv.cronograma.publicacion).toBeNull()
    expect(conv.cronograma.cierre).toBeNull()
  })
})

// ── 3. Plan de escritura ─────────────────────────────────────────────────────

describe('plan de escritura', () => {
  const reporte = () => ingerirSecop(Object.values(casos).flatMap(c => c.filas), hash)

  it('sin nada en la colección, todo se crea', () => {
    const rep = reporte()
    const plan = planearEscritura(rep.registros, new Map())
    expect(plan.crear).toHaveLength(rep.registros.length)
    expect(plan.refrescar).toEqual([])
    expect(plan.sin_cambio).toBe(0)
    expect(cuantosCrearia(rep, new Set())).toBe(rep.registros.length)
  })

  it('con todo ya escrito e idéntico, NO se escribe nada', () => {
    const rep = reporte()
    const existentes = new Map(rep.registros.map(r => [r.meta.doc_id, r.doc]))
    const plan = planearEscritura(rep.registros, existentes)
    expect(plan.crear).toEqual([])
    expect(plan.refrescar).toEqual([])
    expect(plan.sin_cambio).toBe(rep.registros.length)
    expect(cuantosCrearia(rep, new Set(existentes.keys()))).toBe(0)
  })

  it('mezcla: uno nuevo, uno cambiado y uno igual', () => {
    const rep = reporte()
    expect(rep.registros.length).toBeGreaterThanOrEqual(3)
    const [a, b, c] = rep.registros
    const existentes = new Map<string, Partial<LicitacionDetectada>>([
      [b.meta.doc_id, { ...b.doc, presupuesto_oficial: 1 }],   // cambió
      [c.meta.doc_id, c.doc],                                   // igual
    ])
    const plan = planearEscritura([a, b, c], existentes)
    expect(plan.crear.map(x => x.doc_id)).toEqual([a.meta.doc_id])
    expect(plan.refrescar.map(x => x.doc_id)).toEqual([b.meta.doc_id])
    expect(plan.refrescar[0].cambios).toEqual(['presupuesto_oficial'])
    expect(plan.sin_cambio).toBe(1)
  })

  it('los cambios materiales se listan aparte, con su doc', () => {
    const rep = reporte()
    const r0 = rep.registros[0]
    const existentes = new Map<string, Partial<LicitacionDetectada>>([
      [r0.meta.doc_id, { ...r0.doc, modalidad: 'otra' }],
    ])
    const plan = planearEscritura([r0], existentes)
    expect(plan.cambios_materiales).toEqual([{ doc_id: r0.meta.doc_id, campos: ['modalidad'] }])
    expect(plan.refrescar).toEqual([])
  })
})

// ── 4. El registro de la corrida ─────────────────────────────────────────────

describe('registro de la corrida', () => {
  const armar = (escribio: boolean) => {
    const rep = ingerirSecop(Object.values(casos).flatMap(c => c.filas), hash)
    const ventana = ventanaIngesta('2026-11-01', AHORA)
    const resumen = construirResumenCorrida(rep, {
      ejecutada_en: AHORA.toISOString(), modo: 'radar', ventana,
    })
    const volumen = evaluarVolumen(rep.registros.length, ventana)
    const escritura = escribio
      ? { creados: rep.registros.length, refrescados: 0, sin_cambio: 0, cambios_materiales: [] }
      : null
    return { ventana, registro: construirRegistroCorrida(resumen, volumen, escritura, escribio ? ventana.hasta : null) }
  }

  it('lleva el agregado, la guarda, lo escrito y la marca nueva', () => {
    const { registro } = armar(true)
    expect(registro.modo).toBe('radar')
    expect(registro.volumen.procede).toBe(true)
    expect(registro.escritura!.creados).toBeGreaterThan(0)
    expect(registro.marca_nueva).toBe('2026-11-09')
    expect(registro.por_senal).toBeDefined()
    expect(registro.observados).toBeDefined()
    expect(() => JSON.stringify(registro)).not.toThrow()
  })

  it('una corrida DETENIDA también deja registro', () => {
    // Una corrida abortada que no deja rastro es indistinguible de una que no
    // encontró nada.
    const { registro } = armar(false)
    expect(registro.escritura).toBeNull()
    expect(registro.marca_nueva).toBeNull()
    expect(resumenLegible(registro)).toMatch(/NO SE ESCRIBIÓ|creados/)
  })

  it('la marca NO avanza si no se escribió', () => {
    const v = ventanaIngesta('2026-11-01', AHORA)
    expect(marcaSiguiente(v, false, '2026-11-01')).toBe('2026-11-01')
    expect(marcaSiguiente(v, true, '2026-11-01')).toBe('2026-11-09')
  })

  it('la marca sale del `hasta` de la ventana, no del máximo visto', () => {
    // Si saliera del máximo y la corrida no trajo nada, la marca se quedaría
    // clavada re-leyendo lo mismo para siempre.
    const v = { desde: '2026-09-25', hasta: '2026-11-09', solape_dias: 45, primera_corrida: false }
    expect(marcaSiguiente(v, true, null)).toBe('2026-11-09')
  })

  it('el estado del radar acumula, poda el historial y consume la escotilla', () => {
    const { registro } = armar(true)
    let estado = avanzarEstadoRadar(null, registro)
    expect(estado.acumulado.corridas).toBe(1)
    expect(estado.acumulado.creados).toBe(registro.escritura!.creados)
    expect(estado.corridas).toHaveLength(1)
    expect(estado.marca).toBe('2026-11-09')

    // Una corrida detenida suma a lo VISTO y a las detenidas, no a lo escrito.
    const { registro: detenido } = armar(false)
    estado = avanzarEstadoRadar(estado, detenido)
    expect(estado.acumulado.corridas).toBe(2)
    expect(estado.acumulado.corridas_detenidas).toBe(1)
    expect(estado.acumulado.procesos_vistos).toBe(registro.procesos_vistos * 2)
    expect(estado.marca, 'la marca no retrocede ni avanza con una detenida').toBe('2026-11-09')

    // El historial se poda y el acumulado sobrevive.
    for (let i = 0; i < 40; i++) estado = avanzarEstadoRadar(estado, registro)
    expect(estado.corridas).toHaveLength(MAX_CORRIDAS_EN_HISTORIAL)
    expect(estado.acumulado.corridas).toBe(42)

    // La escotilla se consume: autorizar un volcado no autoriza los siguientes.
    const conEscotilla = avanzarEstadoRadar(
      { ...estado, autorizado_manual: true }, registro)
    expect(conEscotilla.autorizado_manual).toBe(false)
  })

  it('el acumulado lleva los tres contadores que se revisan en tres meses', () => {
    const { registro } = armar(true)
    const estado = avanzarEstadoRadar(null, registro)
    expect(estado.acumulado).toHaveProperty('evidencia_sin_texto')
    expect(estado.acumulado).toHaveProperty('observados_habrian_calificado')
    expect(estado.acumulado).toHaveProperty('descartados_con_texto')
    expect(estado.acumulado.evidencia_sin_texto).toBe(registro.evidencia_sin_texto.total)
    // Y el estado inicial arranca todo en cero, sin marca.
    expect(ESTADO_RADAR_INICIAL.marca).toBeNull()
    expect(ESTADO_RADAR_INICIAL.acumulado.corridas).toBe(0)
    expect(ESTADO_RADAR_INICIAL.solape_dias).toBe(45)
  })

  it('el resumen legible dice lo que importa en una línea', () => {
    const { registro } = armar(true)
    const s = resumenLegible(registro)
    expect(s).toMatch(/modo radar/)
    // 45 días antes de la marca del 1-nov = 17-sep.
    expect(s).toMatch(/ventana 2026-09-17 → 2026-11-09/)
    expect(s).toMatch(/procesos/)
    expect(s).toMatch(/si \d+ · probable \d+ · no \d+/)
  })
})

describe('completarSiFalta', () => {
  it('llena solo las claves ausentes y dice cuáles', () => {
    const r = completarSiFalta({ a: 1, b: null }, { a: 9, b: 9, c: 3, d: 4 })
    expect(r?.valor).toEqual({ a: 1, b: null, c: 3, d: 4 })
    expect(r?.llenados.sort()).toEqual(['c', 'd'])
  })

  it('`null` NO es una ausencia: es un valor y se respeta', () => {
    // La distinción que sostiene todo el patrón. `null` dice "se miró y no
    // había"; `undefined` dice "nunca se miró".
    expect(completarSiFalta({ a: null }, { a: 'algo' })).toBeNull()
  })

  it('sin nada que llenar devuelve null, y el caller no escribe', () => {
    expect(completarSiFalta({ a: 1 }, { a: 2 })).toBeNull()
  })

  it('no inventa estructura sobre lo que no es un objeto', () => {
    expect(completarSiFalta(null, { a: 1 })).toBeNull()
    expect(completarSiFalta('texto', { a: 1 })).toBeNull()
    expect(completarSiFalta([1], [1, 2])).toBeNull()
  })
})
