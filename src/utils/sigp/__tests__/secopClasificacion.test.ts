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
import VOCABULARIO_JSON from '../../../../functions/scripts/vocabulario-neg-v1.1.json'
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
  CLASES_CON_ADJUDICACION_NEG, CATALOGO_UNSPC_NEG, FAMILIAS_RUP_NEG,
  origenCodigoNeg, esDepartamentoObservado, DEPARTAMENTOS_OBSERVADOS,
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
  it('trae los 43 términos derivados, únicos y normalizados', () => {
    expect(TERMINOS_NEG).toHaveLength(43)
    expect(new Set(TERMINOS_NEG).size).toBe(43)
    for (const t of TERMINOS_NEG) {
      expect(t, t).toBe(normalizarObjeto(t))
      expect(t.length, t).toBeGreaterThanOrEqual(LARGO_MINIMO_PALABRA)
    }
    expect(VOCABULARIO_NEG_VERSION).toBe('v1.1')
  })

  it('cada término trae su frecuencia medida, y ninguna es inventada', () => {
    // Siguen siendo 48: el respaldo de la derivación no se poda cuando un
    // término sale del léxico (ver `semillaVocabulario.test.ts`).
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
    expect(s.version_actual).toBe('v1.1')
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
    expect(versionVocabularioVigente(null)).toBe('v1.1 (empaquetada)')
    expect(versionVocabularioVigente({ versiones: {}, version_actual: 'v9' }))
      .toBe('v1.1 (empaquetada)')
  })

  it('un documento con la versión vacía también degrada', () => {
    const reg = {
      versiones: {
        'v1.1': {
          vigente_desde: ahora, vigente_hasta: null, definicion: '', derivacion: '',
          metricas: {}, excluidos: {}, limitaciones: '', autor_uid: '', terminos: [],
        },
      },
      version_actual: 'v1.1',
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
    // Si el texto pudiera ganarle al código, un proceso de otra familia
    // entraría por la palabra MANTENIMIENTO.
    //
    // El objeto de este caso decía «DEL SOFTWARE» hasta v1.1. Ahora SOFTWARE
    // es un término de BLOQUEO y el texto ya no coincide, así que el ejemplo
    // dejó de servir para lo que el test prueba: se cambió el OBJETO, no la
    // expectativa. El caso vetado se prueba aparte, abajo.
    const c = clasificarProceso('V1.81112200', 'MANTENIMIENTO DE LA INFRAESTRUCTURA FISICA DEL EDIFICIO', TERMINOS_NEG)
    expect(c.veredicto).toBe('no')
    expect(c.senal).toBe('codigo_fuera_de_familia')
    // Pero NO se pierde la discrepancia: queda contada.
    expect(c.descartado_con_texto_coincidente).toBe(true)
    expect(c.bloqueado_por).toBeNull()
  })

  it('un término de BLOQUEO no es lo mismo que «ni código ni texto»', () => {
    // Objeto real de la cola: coincide por ADECUACION y no es trabajo de NEG.
    // Si esto cayera en `sin_codigo_ni_texto` el documento afirmaría que el
    // texto no dijo nada — y dijo algo, se le respondió.
    const c = clasificarProceso(
      null,
      'MANTENIMIENTO PREVENTIVO Y CORRECTIVO DE HARDWARE Y SOFTWARE CON LA ADECUACION DE EQUIPOS',
      TERMINOS_NEG)
    expect(c.veredicto).toBe('no')
    expect(c.senal).toBe('texto_vetado')
    expect(c.bloqueado_por).toBe('SOFTWARE')
    // La evidencia de qué palabra lo trajo hasta acá NO se borra.
    expect(c.terminos).toContain('ADECUACION')
    // Y no contamina el contador de discrepancias del código: no hubo código.
    expect(c.descartado_con_texto_coincidente).toBe(false)
  })

  it('un bloqueo que no cambió nada NO se reporta como veto', () => {
    // El caso de Giovanny entraba por REALIZAR ACTIVIDADES, que v1.1 ya quitó
    // del léxico. Hoy NINGÚN término lo reconoce: el bloqueo por SOFTWARE
    // llega cuando ya no hay nada que bloquear. Marcarlo como vetado le
    // atribuiría al negativo un acierto que no tuvo — y la medición de si los
    // negativos sirven se haría sobre un número inflado.
    const c = clasificarProceso(
      null,
      'BRINDAR SOPORTE, MANTENIMIENTO INTEGRAL Y REALIZAR ACTIVIDADES DE DESARROLLO EN EL SOFTWARE SIAF',
      TERMINOS_NEG)
    expect(c.veredicto).toBe('no')
    expect(c.senal).toBe('sin_codigo_ni_texto')
    expect(c.terminos).toEqual([])
    // El bloqueo SÍ queda registrado: no se reporta como veto, no se oculta.
    expect(c.bloqueado_por).toBe('SOFTWARE')
  })

  it('los negativos se INYECTAN, igual que los términos', () => {
    // Si solo se inyectaran los términos, un documento más nuevo clasificaría
    // con sus palabras y con los bloqueos del bundle: dos versiones del léxico
    // decidiendo en la misma corrida.
    const objeto = 'MANTENIMIENTO DE CUBIERTAS DEL POLIDEPORTIVO MUNICIPAL'
    expect(clasificarProceso(null, objeto, TERMINOS_NEG).senal).toBe('texto_coincide')
    const c = clasificarProceso(null, objeto, TERMINOS_NEG, undefined, ['POLIDEPORTIVO'])
    expect(c.senal).toBe('texto_vetado')
    expect(c.bloqueado_por).toBe('POLIDEPORTIVO')
  })

  it('solo `si` y `probable` se persisten', () => {
    expect(VEREDICTOS_PERSISTIBLES).toEqual(['si', 'probable'])
    expect(sePersiste('si')).toBe(true)
    expect(sePersiste('probable')).toBe(true)
    expect(sePersiste('no')).toBe(false)
  })
})

describe('las tres CLASES con adjudicación probada (B.1c)', () => {
  it('el criterio de inclusión es la evidencia: tres clases, no tres segmentos', () => {
    expect(CLASES_CON_ADJUDICACION_NEG).toEqual(['V1.301717', 'V1.311628', 'V1.831018'])
    // Clase = 6 dígitos. Si alguien metiera el segmento (2) o la familia (4),
    // entraría el sector entero: medido, 532 procesos en 2025 contra 69.
    for (const c of CLASES_CON_ADJUDICACION_NEG) {
      expect(c.replace('V1.', ''), c).toHaveLength(6)
    }
    expect(CATALOGO_UNSPC_NEG.familias).toBe(FAMILIAS_RUP_NEG)
    expect(CATALOGO_UNSPC_NEG.clases).toBe(CLASES_CON_ADJUDICACION_NEG)
  })

  it('clase SIN que el léxico diga nada: entra por evidencia, con señal aparte', () => {
    // Los 24 de ferretería pura de 2025: NEG ganó bajo ese código, así que
    // entran; pero el texto no habla de mantenimiento y eso queda marcado.
    const c = clasificarProceso('V1.31162800', 'ADQUISICION DE ELEMENTOS DE ENCIERRO',
      TERMINOS_NEG, { departamento: 'Cundinamarca' })
    expect(c.veredicto).toBe('si')
    expect(c.senal).toBe('codigo_en_clase_sin_texto')
    expect(c.origen_codigo).toBe('clase')
    expect(c.terminos).toEqual([])
  })

  it('clase CON el léxico de acuerdo: señal distinta, para poder separarlos', () => {
    const c = clasificarProceso('V1.31162800',
      'SUMINISTRO DE FERRETERIA PARA EL MANTENIMIENTO DE LA INFRAESTRUCTURA FISICA',
      TERMINOS_NEG, { departamento: 'Cundinamarca' })
    expect(c.veredicto).toBe('si')
    expect(c.senal).toBe('codigo_en_clase_con_texto')
    expect(c.terminos.length).toBeGreaterThan(0)
  })

  it('la familia del RUP conserva su señal: el aporte de B.1c es medible aparte', () => {
    const c = clasificarProceso('V1.72101500', 'MANTENIMIENTO', TERMINOS_NEG,
      { departamento: 'Cundinamarca' })
    expect(c.senal).toBe('codigo_en_familia')
    expect(c.origen_codigo).toBe('familia')
  })

  it('NO entra el segmento ni la familia de esas clases: solo la clase', () => {
    // 30 / 3017 son vidrio y muebles en general; 31 / 3116, herrajes enteros;
    // 83 / 8310, servicios públicos. Entra 301717, no 3017 ni 30.
    for (const ajeno of ['V1.30101500', 'V1.31160000', 'V1.83110000', 'V1.30171500']) {
      const c = clasificarProceso(ajeno, 'SUMINISTRO', TERMINOS_NEG, { departamento: 'Cundinamarca' })
      expect(c.veredicto, ajeno).toBe('no')
      expect(c.origen_codigo, ajeno).toBeNull()
    }
    expect(origenCodigoNeg('V1.3017')).toBeNull()
    expect(origenCodigoNeg('V1.301717')).toBe('clase')
    expect(origenCodigoNeg('V1.30171706')).toBe('clase')
  })

  it('con las filas REALES: 2 de los 3 ganados entran, el de Boyacá se cuenta', () => {
    const filas = caso('ganados_neg_fuera_de_familia')
    expect(filas).toHaveLength(3)
    const rep = ingerirSecop(filas, hash)
    expect(rep.procesos_vistos).toBe(3)
    // Los tres son de las clases nuevas, así que por CÓDIGO ya califican…
    expect(rep.por_senal.codigo_fuera_de_familia).toBe(0)
    // …pero uno está en Boyacá y el territorio lo deja afuera: 2 persistidos.
    expect(rep.procesos).toBe(2)
    const porClase = rep.por_senal.codigo_en_clase_con_texto + rep.por_senal.codigo_en_clase_sin_texto
    expect(porClase).toBe(2)
    expect(rep.descartes.fuera_de_territorio).toBe(1)
    expect(rep.observados.total).toBe(1)
    expect(rep.observados.habrian_calificado).toBe(1)
    expect(rep.observados.ejemplos[0].departamento).toBe('Boyacá')
    expect(rep.observados.ejemplos[0].senal_previa).toMatch(/^codigo_en_clase_/)
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

describe('los que entran por evidencia sin que el texto lo diga', () => {
  const ferreteriaPura = (i: number): FilaSecop => ({
    ...una('minima_limpia'),
    id_del_proceso: `CO1.REQ.FERR${i}`,
    codigo_principal_de_categoria: 'V1.31162800',
    descripci_n_del_procedimiento: 'ADQUISICION DE ELEMENTOS DE ENCIERRO PARA EL CENTRO',
  })

  it('se persisten, con su señal, y el reporte los SEPARA con muestra', () => {
    const rep = ingerirSecop([ferreteriaPura(1), ferreteriaPura(2)], hash)
    expect(rep.procesos).toBe(2)                         // entran
    expect(rep.por_senal.codigo_en_clase_sin_texto).toBe(2)
    expect(rep.por_senal.codigo_en_clase_con_texto).toBe(0)
    expect(rep.evidencia_sin_texto.total).toBe(2)
    expect(rep.evidencia_sin_texto.ejemplos).toHaveLength(2)
    expect(rep.evidencia_sin_texto.ejemplos[0].categoria).toBe('V1.31162800')
    // La identidad que importa: el total del bloque es el de la señal.
    expect(rep.evidencia_sin_texto.total).toBe(rep.por_senal.codigo_en_clase_sin_texto)
  })

  it('la muestra está acotada aunque sean muchos', () => {
    const muchas = Array.from({ length: 30 }, (_, i) => ferreteriaPura(i))
    const rep = ingerirSecop(muchas, hash)
    expect(rep.evidencia_sin_texto.total).toBe(30)
    expect(rep.evidencia_sin_texto.ejemplos).toHaveLength(10)
  })

  it('EL DOCUMENTO guarda por qué entró: la pregunta de los tres meses', () => {
    // Sin esto, "¿alguno de los que entraron por clase sin texto se trabajó?"
    // solo se podría responder con la muestra de 10 del registro de la corrida.
    const rep = ingerirSecop([ferreteriaPura(7)], hash)
    const doc = rep.registros[0].doc
    expect(doc.radar.senal).toBe('codigo_en_clase_sin_texto')
    expect(doc.radar.terminos).toEqual([])
    expect(doc.radar.vocabulario_version).toBe('v1.1')
    expect(doc.radar.corrida, 'lo sella el escritor, no el mapeo').toBeNull()
  })

  it('un probable guarda los términos que lo trajeron', () => {
    const rep = ingerirSecop(caso('ganados_neg_sin_codigo'), hash)
    const doc = rep.registros[0].doc
    expect(doc.radar.senal).toBe('texto_coincide')
    expect(doc.radar.terminos.length).toBeGreaterThan(0)
  })

  it('la versión del léxico inyectada queda en el documento', () => {
    const rep = ingerirSecop(caso('ganados_neg_sin_codigo'), hash, {
      terminos: ['MANTENIMIENTO'], vocabulario_version: 'v2.0 (documento)',
    })
    expect(rep.registros[0].doc.radar.vocabulario_version).toBe('v2.0 (documento)')
  })
})

describe('Antioquia y Boyacá: no se abren, se cuentan (B.1c)', () => {
  it('los departamentos observados son exactamente dos', () => {
    expect(DEPARTAMENTOS_OBSERVADOS).toEqual(['Antioquia', 'Boyacá'])
    expect(esDepartamentoObservado('antioquia')).toBe(true)
    expect(esDepartamentoObservado('BOYACA')).toBe(true)      // sin tilde
    expect(esDepartamentoObservado('Cundinamarca')).toBe(false)
  })

  it('el territorio se aplica DESPUÉS de clasificar: por eso hay qué contar', () => {
    // Al revés no habría nada que medir — y lo que se mide es exactamente
    // "qué estamos dejando pasar".
    const c = clasificarProceso('V1.72101500', 'MANTENIMIENTO DE CUBIERTAS', TERMINOS_NEG,
      { departamento: 'Antioquia' })
    expect(c.veredicto).toBe('no')
    expect(c.senal).toBe('fuera_de_territorio')
    expect(c.habria_calificado).toBe(true)
    expect(c.origen_codigo).toBe('familia')   // la señal previa se conserva
  })

  it('lo que NO habría calificado igual no cuenta como pérdida', () => {
    const c = clasificarProceso('V1.90101600', 'SUMINISTRO DE REFRIGERIOS', TERMINOS_NEG,
      { departamento: 'Boyacá' })
    expect(c.senal).toBe('fuera_de_territorio')
    expect(c.habria_calificado).toBe(false)
  })

  it('en el territorio nada se marca fuera', () => {
    for (const d of ['Distrito Capital de Bogotá', 'Cundinamarca', 'distrito capital de bogota']) {
      const c = clasificarProceso('V1.72101500', 'MANTENIMIENTO', TERMINOS_NEG, { departamento: d })
      expect(c.veredicto, d).toBe('si')
      expect(c.habria_calificado, d).toBe(false)
    }
  })

  it('un departamento vacío o ausente NO se trata como fuera de territorio', () => {
    // 'No Definido' llega como centinela y el mapeo lo deja en ''. Descartar
    // por eso sería perder procesos del territorio por un dato que falta.
    for (const d of [undefined, '']) {
      const c = clasificarProceso('V1.72101500', 'MANTENIMIENTO', TERMINOS_NEG,
        d === undefined ? undefined : { departamento: d })
      expect(c.veredicto).toBe('si')
    }
    const r = ingerirSecop(caso('departamento_no_definido'), hash)
    expect(r.por_senal.fuera_de_territorio).toBe(0)
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
    // La identidad del struct de descartes cierra con los CUATRO motivos.
    expect(rep.descartes.codigo_fuera_de_familia + rep.descartes.sin_codigo_ni_texto
      + rep.descartes.texto_vetado
      + rep.descartes.fuera_de_territorio).toBe(rep.descartes.total)
    // Y las señales cuadran con los vistos.
    const sumaSenales = Object.values(rep.por_senal).reduce((a, b) => a + b, 0)
    expect(sumaSenales).toBe(rep.procesos_vistos)
    expect(rep.registros.every(r => sePersiste(r.meta.clasificacion.veredicto))).toBe(true)
  })

  it('LA IDENTIDAD con un VETADO de verdad adentro', () => {
    // El test de arriba vigila la identidad y pasó con ella ROTA: cuando
    // agregué la señal `texto_vetado` sumé a `total` sin darle cubo, y ningún
    // fixture producía un vetado. Un invariante con test puede estar roto
    // esperando datos reales — este es el fixture que faltaba.
    const vetado: FilaSecop = {
      ...una('minima_limpia'),
      id_del_proceso: 'VETADO-001',
      referencia_del_proceso: 'VETADO-001',
      codigo_principal_de_categoria: 'UNSPECIFIED',
      // Ojo con el objeto: 'MANTENIMIENTO Y ADECUACION' produce el bigrama
      // MANTENIMIENTO ADECUACION, que ES un termino del lexico — o sea FUERTE,
      // y la regla nueva lo deja entrar. Para que haya veto hacen falta solo
      // palabras SUELTAS. Este es un objeto real de la cola del 13-nov.
      descripci_n_del_procedimiento:
        'ADECUACION DE EQUIPOS DE COMPUTO Y SOFTWARE DE LA ENTIDAD',
    } as FilaSecop

    const rep = ingerirSecop([...Object.values(casos).flatMap(c => c.filas), vetado], hash)
    expect(rep.descartes.texto_vetado, 'el fixture tiene que producir un vetado')
      .toBeGreaterThan(0)
    expect(rep.descartes.codigo_fuera_de_familia + rep.descartes.sin_codigo_ni_texto
      + rep.descartes.texto_vetado
      + rep.descartes.fuera_de_territorio).toBe(rep.descartes.total)
    expect(rep.procesos_vistos).toBe(rep.procesos + rep.descartes.total)
    const sumaSenales = Object.values(rep.por_senal).reduce((a, b) => a + b, 0)
    expect(sumaSenales).toBe(rep.procesos_vistos)
  })

  it('cuenta los negativos IGNORADOS, que no son descartes', () => {
    // Un negativo que pierde contra un término fuerte describe un proceso que
    // SÍ entró. Es la única medición posible de si la regla de bloqueo sirve:
    // lo que un negativo tapa no llega a ninguna pantalla.
    const ignorado: FilaSecop = {
      ...una('minima_limpia'),
      id_del_proceso: 'IGNORADO-001',
      referencia_del_proceso: 'IGNORADO-001',
      codigo_principal_de_categoria: 'UNSPECIFIED',
      descripci_n_del_procedimiento:
        'MANTENIMIENTO DE LA INFRAESTRUCTURA FISICA Y DEL SOFTWARE DE LA SEDE',
    } as FilaSecop

    const rep = ingerirSecop([ignorado], hash)
    expect(rep.descartes.negativos_ignorados).toBe(1)
    // Y NO se contó como descarte: entró.
    expect(rep.descartes.total).toBe(0)
    expect(rep.procesos).toBe(1)
  })

  it('reporta con qué versión del léxico clasificó', () => {
    const rep = ingerirSecop(caso('minima_limpia'), hash)
    expect(rep.vocabulario_version).toBe('v1.1')
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
    expect(resumen.vocabulario_version).toBe('v1.1')
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
    // Código fuera de familia (y fuera de las clases) pero con texto de NEG:
    // el caso que el contador vigila.
    const base: FilaSecop = {
      ...una('minima_limpia'),
      codigo_principal_de_categoria: 'V1.81112200',
      descripci_n_del_procedimiento: 'MANTENIMIENTO Y ADECUACION DE LA INFRAESTRUCTURA FISICA',
    }
    const muchas: FilaSecop[] = []
    for (let i = 0; i < 40; i++) muchas.push({ ...base, id_del_proceso: `CO1.REQ.FAKE${i}` })
    const rep = ingerirSecop(muchas, hash)
    expect(rep.descartes.codigo_fuera_de_familia).toBe(40)
    expect(rep.descartes.con_texto_coincidente).toBe(40)
    expect(rep.descartes.ejemplos_con_texto_coincidente).toHaveLength(10)
  })

  it('la muestra del contador territorial también está acotada', () => {
    const base: FilaSecop = {
      ...una('minima_limpia'),
      departamento_entidad: 'Antioquia',
    }
    const muchas: FilaSecop[] = []
    for (let i = 0; i < 25; i++) muchas.push({ ...base, id_del_proceso: `CO1.REQ.ANT${i}` })
    const rep = ingerirSecop(muchas, hash)
    expect(rep.observados.total).toBe(25)
    expect(rep.observados.habrian_calificado).toBe(25)
    expect(rep.observados.ejemplos).toHaveLength(10)
    expect(rep.procesos).toBe(0)
  })
})
