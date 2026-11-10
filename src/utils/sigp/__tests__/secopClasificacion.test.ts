/**
 * Clasificación híbrida del radar y léxico de NEG (B.1b) — contra fixtures
 * reales y contra el JSON del léxico. Sin red, igual que los de B.1.
 *
 * Lo que fija este archivo:
 *  · el tokenizador es parte del contrato del léxico (otro tokenizador = otro
 *    léxico, y las métricas medidas dejarían de significar lo que dicen);
 *  · los cuatro casos de la tabla de clasificación, y que el CÓDIGO manda
 *    sobre el texto;
 *  · el hueco MEDIDO de la regla: los 3 procesos que NEG ganó con código
 *    presente y fuera de las familias salen `no`, y quedan CONTADOS como
 *    descartados-con-texto-coincidente;
 *  · la cadena de fechas, con las filas reales de cada eslabón;
 *  · que solo se persiste `si` y `probable`, y que los `no` dejan número.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash } from 'node:crypto'
import FIXTURES from './fixtures/secop.p6dx-8zbt.json'
import VOCABULARIO_JSON from '../../../../functions/scripts/vocabulario-neg-v1.0.json'
import {
  TERMINOS_NEG, VOCABULARIO_NEG_VERSION, FRECUENCIAS_NEG, CAMPOS_JSON_VOCABULARIO,
  PALABRAS_FUNCIONALES, LARGO_MINIMO_PALABRA,
  normalizarObjeto, terminosDelObjeto, coincideVocabulario,
  terminosVigentes, versionVocabularioVigente, construirSemillaVocabularioNeg,
  type RegistroVocabularioNeg,
} from '../../../types/sigp/vocabularioNeg'
import {
  clasificarProceso, sePersiste, VEREDICTOS_PERSISTIBLES,
  fechaReferencia, colapsarPorProceso, mapearProceso, ingerirSecop,
  construirResumenCorrida, CAMPO_SECOP, texto,
  type FilaSecop,
} from '../secopMapeo'

const hash = (s: string) => createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 8)
type Caso = { consulta: string; filas: FilaSecop[] }
const casos = FIXTURES.casos as unknown as Record<string, Caso>
const caso = (k: string): FilaSecop[] => {
  const c = casos[k]
  if (!c) throw new Error(`fixture ausente: ${k}`)
  return c.filas
}
const una = (k: string): FilaSecop => caso(k)[0]

let fetchOriginal: typeof globalThis.fetch
beforeAll(() => {
  fetchOriginal = globalThis.fetch
  globalThis.fetch = (() => {
    throw new Error('ningún test de este archivo puede tocar la red')
  }) as unknown as typeof globalThis.fetch
})
afterAll(() => { globalThis.fetch = fetchOriginal })

// ── El léxico ────────────────────────────────────────────────────────────────

describe('léxico de NEG — el documento versionado', () => {
  it('trae los 48 términos derivados, únicos y normalizados', () => {
    expect(TERMINOS_NEG).toHaveLength(48)
    expect(new Set(TERMINOS_NEG).size).toBe(48)
    for (const t of TERMINOS_NEG) {
      expect(t, t).toBe(normalizarObjeto(t))
      expect(t.length, t).toBeGreaterThanOrEqual(LARGO_MINIMO_PALABRA)
    }
    expect(VOCABULARIO_NEG_VERSION).toBe('v1.0')
  })

  it('cada término trae su frecuencia medida, y ninguna es inventada', () => {
    expect(Object.keys(FRECUENCIAS_NEG)).toHaveLength(48)
    for (const t of TERMINOS_NEG) {
      const f = FRECUENCIAS_NEG[t]
      expect(f, t).toBeDefined()
      expect(f.pos, t).toBeGreaterThanOrEqual(8)   // el corte de la derivación
      expect(f.lift, t).toBeGreaterThanOrEqual(10)
      expect(f.fondo, t).toBeGreaterThanOrEqual(0)
    }
  })

  it('NO contiene nombres de cliente ni de lugar: eso es a quién y dónde, no qué', () => {
    const prohibidos = ['PALACIO', 'REGISTRADURIA', 'ICBF', 'TUNJA', 'HUILA', 'CAUCA', 'BOGOTA']
    for (const p of prohibidos) {
      expect(TERMINOS_NEG.some(t => t.split(' ').includes(p)), p).toBe(false)
    }
    // Y están registrados como excluidos, con su motivo.
    expect(VOCABULARIO_JSON.excluidos.clientes_y_lugares).toContain('ICBF')
    expect(VOCABULARIO_JSON.excluidos.motivo_clientes_y_lugares).toMatch(/cafetería|clientela/)
  })

  it('NO contiene la forma del contrato: precios unitarios fijos no es un trabajo', () => {
    for (const p of ['PRECIOS', 'UNITARIOS', 'FIJOS', 'FORMULA', 'REAJUSTE']) {
      expect(TERMINOS_NEG.some(t => t.split(' ').includes(p)), p).toBe(false)
    }
    expect(VOCABULARIO_JSON.excluidos.forma_contractual).toContain('PRECIOS UNITARIOS')
  })

  it('el JSON declara su derivación, sus métricas y sus limitaciones', () => {
    expect(VOCABULARIO_JSON.derivacion).toMatch(/16\.807|16807/)
    expect(VOCABULARIO_JSON.metricas.corpus_positivo).toBe(395)
    expect(VOCABULARIO_JSON.metricas.validacion_independiente).toMatch(/83\s?%/)
    // La limitación que importa: lo que el léxico NO puede hacer.
    expect(VOCABULARIO_JSON.limitaciones).toMatch(/V1\.30171706/)
    expect(VOCABULARIO_JSON.limitaciones).toMatch(/Antioquia/)
  })

  it('GUARDA ANTI-OMISIÓN: la semilla escribe todos los campos del JSON', () => {
    // El defecto del `limitaciones` omitido en el criterio del semáforo fue
    // invisible porque el script construía el documento por su cuenta.
    const claves = Object.keys(VOCABULARIO_JSON).sort()
    expect(claves).toEqual([...CAMPOS_JSON_VOCABULARIO].sort())
  })
})

describe('semilla de configuracion/vocabulario_neg', () => {
  const ahora = { seconds: 1, nanoseconds: 0 } as never

  it('copia el JSON campo por campo, sin reescribir nada', () => {
    const s = construirSemillaVocabularioNeg('uid-giovanny', ahora)
    const v = s.versiones[VOCABULARIO_NEG_VERSION]
    expect(s.version_actual).toBe('v1.0')
    expect(v.definicion).toBe(VOCABULARIO_JSON.definicion)
    expect(v.derivacion).toBe(VOCABULARIO_JSON.derivacion)
    expect(v.limitaciones).toBe(VOCABULARIO_JSON.limitaciones)
    expect(v.metricas).toEqual(VOCABULARIO_JSON.metricas)
    expect(v.excluidos).toEqual(VOCABULARIO_JSON.excluidos)
    expect(v.terminos).toEqual([...TERMINOS_NEG])
    expect(v.autor_uid).toBe('uid-giovanny')
    expect(v.vigente_hasta).toBeNull()
  })

  it('la versión vigente del documento gana sobre la empaquetada', () => {
    const reg: RegistroVocabularioNeg = {
      versiones: {
        'v2.0': {
          vigente_desde: ahora, vigente_hasta: null, definicion: 'x', derivacion: 'y',
          metricas: {}, excluidos: {}, limitaciones: 'z', autor_uid: 'u',
          terminos: ['CARPINTERIA METALICA'],
        },
      },
      version_actual: 'v2.0',
    }
    expect(terminosVigentes(reg)).toEqual(['CARPINTERIA METALICA'])
    expect(versionVocabularioVigente(reg)).toBe('v2.0')
  })

  it('sin documento DEGRADA al léxico empaquetado, y lo DICE', () => {
    // Un radar que se apaga porque falta un doc de configuración es un radar
    // apagado; pero el reporte no puede mentir sobre con qué criterio midió.
    expect(terminosVigentes(null)).toEqual(TERMINOS_NEG)
    expect(versionVocabularioVigente(null)).toBe('v1.0 (empaquetada)')
    expect(versionVocabularioVigente({ versiones: {}, version_actual: 'v9' }))
      .toBe('v1.0 (empaquetada)')
  })

  it('un documento con la versión vacía también degrada', () => {
    const reg = {
      versiones: {
        'v1.0': {
          vigente_desde: ahora, vigente_hasta: null, definicion: '', derivacion: '',
          metricas: {}, excluidos: {}, limitaciones: '', autor_uid: '', terminos: [],
        },
      },
      version_actual: 'v1.0',
    } as RegistroVocabularioNeg
    expect(terminosVigentes(reg)).toEqual(TERMINOS_NEG)
  })
})

// ── El tokenizador es parte del contrato ────────────────────────────────────

describe('tokenizador', () => {
  it('normaliza sin tildes, en mayúsculas y sin puntuación', () => {
    expect(normalizarObjeto('Adecuación, mantenimiento (y más).'))
      .toBe('ADECUACION MANTENIMIENTO Y MAS')
    expect(normalizarObjeto(null)).toBe('')
  })

  it('produce unigramas y bigramas, y descarta funcionales y palabras cortas', () => {
    const t = terminosDelObjeto('MANTENIMIENTO DE LAS CUBIERTAS')
    expect(t.has('MANTENIMIENTO')).toBe(true)
    expect(t.has('CUBIERTAS')).toBe(true)
    expect(t.has('MANTENIMIENTO CUBIERTAS')).toBe(true)   // 'DE'/'LAS' no cuentan
    expect(t.has('LAS')).toBe(false)
    expect(t.has('DE')).toBe(false)
  })

  it('los bigramas son los que dan precisión: ADECUACION sola es ambigua', () => {
    // 'ADECUACION' aparece en 285 procesos del fondo; 'ADECUACIONES LOCATIVAS'
    // en 11 de 16.807. La precisión vive en los pares.
    expect(FRECUENCIAS_NEG['ADECUACION'].fondo).toBeGreaterThan(200)
    expect(FRECUENCIAS_NEG['ADECUACIONES LOCATIVAS'].fondo).toBeLessThan(20)
    expect(TERMINOS_NEG.filter(t => t.includes(' ')).length).toBeGreaterThan(20)
  })

  it('las palabras funcionales son las mismas que usó la derivación', () => {
    for (const p of ['PARA', 'DONDE', 'OBJETO', 'VIGENCIA', 'UBICADAS']) {
      expect(PALABRAS_FUNCIONALES).toContain(p)
      expect(terminosDelObjeto(`MANTENIMIENTO ${p} CUBIERTAS`).has(p)).toBe(false)
    }
  })

  it('reconoce el objeto REAL de un proceso que NEG ganó', () => {
    const f = caso('ganados_neg_sin_codigo')[0]
    const r = coincideVocabulario(texto(f, CAMPO_SECOP.objeto))
    expect(r.coincide).toBe(true)
    expect(r.terminos.length).toBeGreaterThan(0)
    // Y dice CUÁLES: un `probable` sin términos no es auditable.
    expect(r.terminos.every(t => TERMINOS_NEG.includes(t))).toBe(true)
  })

  it('no reconoce lo que NEG no hace', () => {
    for (const objeto of [
      'SUMINISTRO DE REFRIGERIOS PARA LOS ASISTENTES AL EVENTO',
      'RENOVACION DE LICENCIAS DE SOFTWARE ANTIVIRUS',
      'PRESTACION DE SERVICIOS PROFESIONALES DE APOYO JURIDICO',
      'COMPRA DE PAPELERIA Y UTILES DE OFICINA',
    ]) {
      expect(coincideVocabulario(objeto).coincide, objeto).toBe(false)
    }
  })
})

// ── La tabla de clasificación ────────────────────────────────────────────────

describe('clasificarProceso — los cuatro casos de la tabla', () => {
  const OBJ_NEG = 'MANTENIMIENTO Y ADECUACION DE LA INFRAESTRUCTURA FISICA DE LA SEDE'
  const OBJ_AJENO = 'SUMINISTRO DE REFRIGERIOS PARA EL EVENTO INSTITUCIONAL'

  it('código en familia -> SI, confianza alta', () => {
    const c = clasificarProceso('V1.72101500', OBJ_AJENO, TERMINOS_NEG)
    expect(c.veredicto).toBe('si')
    expect(c.senal).toBe('codigo_en_familia')
    expect(c.familia).toBe('familia_neg')
  })

  it('código presente y fuera -> NO', () => {
    const c = clasificarProceso('V1.90101600', OBJ_AJENO, TERMINOS_NEG)
    expect(c.veredicto).toBe('no')
    expect(c.senal).toBe('codigo_fuera_de_familia')
    expect(c.descartado_con_texto_coincidente).toBe(false)
  })

  it('sin código y el texto coincide -> PROBABLE, con los términos', () => {
    const c = clasificarProceso(null, OBJ_NEG, TERMINOS_NEG)
    expect(c.veredicto).toBe('probable')
    expect(c.senal).toBe('texto_coincide')
    expect(c.familia).toBe('sin_clasificar')
    expect(c.terminos.length).toBeGreaterThan(0)
  })

  it('sin código y el texto no coincide -> NO', () => {
    const c = clasificarProceso(null, OBJ_AJENO, TERMINOS_NEG)
    expect(c.veredicto).toBe('no')
    expect(c.senal).toBe('sin_codigo_ni_texto')
    expect(c.terminos).toEqual([])
  })

  it('EL CÓDIGO MANDA: el texto no puede sobreponerse a un código fuera', () => {
    // Si el texto pudiera ganarle al código, un "mantenimiento de software"
    // entraría por la palabra MANTENIMIENTO.
    const c = clasificarProceso('V1.81112200', 'MANTENIMIENTO DE LA INFRAESTRUCTURA FISICA DEL SOFTWARE', TERMINOS_NEG)
    expect(c.veredicto).toBe('no')
    expect(c.senal).toBe('codigo_fuera_de_familia')
    // Pero NO se pierde la discrepancia: queda contada.
    expect(c.descartado_con_texto_coincidente).toBe(true)
  })

  it('solo `si` y `probable` se persisten', () => {
    expect(VEREDICTOS_PERSISTIBLES).toEqual(['si', 'probable'])
    expect(sePersiste('si')).toBe(true)
    expect(sePersiste('probable')).toBe(true)
    expect(sePersiste('no')).toBe(false)
  })
})

describe('el hueco MEDIDO de la regla: los ganados con código fuera de familia', () => {
  it('los 3 que NEG ganó fuera de familia salen NO, y 2 quedan contados', () => {
    const filas = caso('ganados_neg_fuera_de_familia')
    expect(filas).toHaveLength(3)
    const rep = ingerirSecop(filas, hash)
    expect(rep.procesos_vistos).toBe(3)
    expect(rep.procesos, 'ninguno se persiste: el código los descarta').toBe(0)
    expect(rep.descartes.total).toBe(3)
    expect(rep.descartes.codigo_fuera_de_familia).toBe(3)
    // De los 3, el léxico reconoce 2 (la subestación eléctrica y la adecuación
    // de ambientes); la ferretería no. Ese contador es la medida de lo que la
    // regla deja pasar.
    expect(rep.descartes.con_texto_coincidente).toBe(2)
    expect(rep.descartes.ejemplos_con_texto_coincidente).toHaveLength(2)
    for (const e of rep.descartes.ejemplos_con_texto_coincidente) {
      expect(e.categoria).not.toBeNull()
      expect(e.terminos.length).toBeGreaterThan(0)
      expect(e.objeto.length).toBeGreaterThan(0)
    }
  })

  it('los 3 que ganó SIN código entran como PROBABLE', () => {
    const filas = caso('ganados_neg_sin_codigo')
    // 6 filas para 3 procesos: multi-adjudicación otra vez (trampa 9).
    expect(filas.length).toBeGreaterThan(3)
    const rep = ingerirSecop(filas, hash)
    expect(rep.procesos_vistos).toBe(3)
    expect(rep.por_veredicto.probable).toBe(3)
    expect(rep.procesos).toBe(3)
    expect(rep.descartes.total).toBe(0)
    for (const r of rep.registros) {
      expect(r.meta.clasificacion.senal).toBe('texto_coincide')
      expect(r.doc.categoria_unspsc).toBeNull()
    }
  })
})

// ── La cadena de fechas ──────────────────────────────────────────────────────

describe('cadena de fechas: publicación -> recepción de ofertas -> marcada', () => {
  it('con publicación, gana la publicación', () => {
    const r = fechaReferencia(una('minima_limpia'))
    expect(r.origen).toBe('publicacion')
    expect(r.iso).toBe('2025-01-20T05:00:00.000Z')
  })

  it('SIN publicación pero con recepción, entra por la recepción', () => {
    const f = una('precio_base_negativo')
    expect(CAMPO_SECOP['cronograma.publicacion'] in f).toBe(false)
    const r = fechaReferencia(f)
    expect(r.origen).toBe('recepcion_de_ofertas')
    expect(r.iso).toBe('2022-06-01T05:00:00.000Z')
    expect(mapearUnaCon(f).meta.origen_fecha).toBe('recepcion_de_ofertas')
  })

  it('sin NINGUNA fecha, entra MARCADA — no desaparece', () => {
    const f = una('sin_fecha_publicacion')
    const r = fechaReferencia(f)
    expect(r.iso).toBeNull()
    expect(r.origen).toBe('ninguna')
    const reg = mapearUnaCon(f)
    expect(reg.meta.origen_fecha).toBe('ninguna')
    expect(reg.doc.cronograma.publicacion).toBeNull()
    expect(reg.doc.cronograma.cierre).toBeNull()
    expect(reg.doc.id_secop).not.toBe('')      // el proceso sigue existiendo
  })

  it('`fecha_de_ultima_publicaci` NUNCA entra en la cadena', () => {
    // Está vacía en las 3.785 filas sin publicación: un respaldo que nunca
    // tiene dato es peor que no tenerlo, porque se cita como si existiera.
    const f: FilaSecop = {
      id_del_proceso: 'CO1.REQ.X', descripci_n_del_procedimiento: 'MANTENIMIENTO ADECUACION',
      fecha_de_ultima_publicaci: '2026-10-01T00:00:00.000',
    }
    expect(fechaReferencia(f)).toEqual({ iso: null, origen: 'ninguna' })
  })

  it('el cierre del cronograma sale de la recepción de ofertas', () => {
    const f = caso('ganados_neg_fuera_de_familia')
      .find(x => CAMPO_SECOP['cronograma.cierre'] in x)!
    const { procesos } = colapsarPorProceso([f])
    const reg = mapearProceso(procesos[0], hash)!
    expect(reg.doc.cronograma.cierre).not.toBeNull()
    expect(new Date(reg.doc.cronograma.cierre!).getTime())
      .toBeGreaterThanOrEqual(new Date(reg.doc.cronograma.publicacion!).getTime())
  })
})

function mapearUnaCon(f: FilaSecop) {
  const { procesos } = colapsarPorProceso([f])
  const r = mapearProceso(procesos[0], hash)
  if (!r) throw new Error('el mapeo devolvió null')
  return r
}

// ── El agregado de la corrida ────────────────────────────────────────────────

describe('agregado de la corrida', () => {
  it('cuadra: vistos = persistidos + descartados, y los no dejan número', () => {
    const todas = Object.values(casos).flatMap(c => c.filas)
    const rep = ingerirSecop(todas, hash)
    expect(rep.procesos_vistos).toBe(rep.procesos + rep.descartes.total)
    expect(rep.por_veredicto.si + rep.por_veredicto.probable + rep.por_veredicto.no)
      .toBe(rep.procesos_vistos)
    expect(rep.descartes.codigo_fuera_de_familia + rep.descartes.sin_codigo_ni_texto)
      .toBe(rep.descartes.total)
    expect(rep.registros.every(r => sePersiste(r.meta.clasificacion.veredicto))).toBe(true)
  })

  it('reporta con qué versión del léxico clasificó', () => {
    const rep = ingerirSecop(caso('minima_limpia'), hash)
    expect(rep.vocabulario_version).toBe('v1.0')
    const rep2 = ingerirSecop(caso('minima_limpia'), hash, {
      terminos: ['OTRA COSA'], vocabulario_version: 'v2.0 (documento)',
    })
    expect(rep2.vocabulario_version).toBe('v2.0 (documento)')
  })

  it('el léxico inyectado SE USA: con una lista vacía nada es probable', () => {
    const rep = ingerirSecop(caso('ganados_neg_sin_codigo'), hash, { terminos: [] })
    expect(rep.por_veredicto.probable).toBe(0)
    expect(rep.descartes.sin_codigo_ni_texto).toBe(3)
    expect(rep.procesos).toBe(0)
  })

  it('el resumen de la corrida lleva los conteos y la ventana', () => {
    const todas = Object.values(casos).flatMap(c => c.filas)
    const rep = ingerirSecop(todas, hash)
    const resumen = construirResumenCorrida(rep, {
      ejecutada_en: '2026-11-09T18:00:00.000Z',
      modo: 'radar',
      ventana: { desde: '2026-09-25', hasta: '2026-11-09', solape_dias: 45 },
    })
    expect(resumen.procesos_vistos).toBe(rep.procesos_vistos)
    expect(resumen.persistidos).toBe(rep.procesos)
    expect(resumen.descartes).toEqual(rep.descartes)
    expect(resumen.ventana.solape_dias).toBe(45)
    expect(resumen.modo).toBe('radar')
    expect(resumen.vocabulario_version).toBe('v1.0')
    // Es serializable tal cual: va a un documento.
    expect(() => JSON.stringify(resumen)).not.toThrow()
  })

  it('una corrida sin nada no inventa conteos', () => {
    const rep = ingerirSecop([], hash)
    expect(rep.procesos_vistos).toBe(0)
    expect(rep.descartes.total).toBe(0)
    expect(rep.descartes.ejemplos_con_texto_coincidente).toEqual([])
    expect(rep.puede_escribir).toBe(true)
  })

  it('la muestra de descartes está acotada: no se guarda un corpus entero', () => {
    const base = una('ganados_neg_fuera_de_familia')
    const muchas: FilaSecop[] = []
    for (let i = 0; i < 40; i++) muchas.push({ ...base, id_del_proceso: `CO1.REQ.FAKE${i}` })
    const rep = ingerirSecop(muchas, hash)
    expect(rep.descartes.con_texto_coincidente).toBe(40)
    expect(rep.descartes.ejemplos_con_texto_coincidente).toHaveLength(10)
  })
})
