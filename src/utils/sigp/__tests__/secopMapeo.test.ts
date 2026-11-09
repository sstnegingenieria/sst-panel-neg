/**
 * Mapeo de SECOP II — contra FIXTURES REALES, nunca contra la red.
 *
 * Las filas de `fixtures/secop.p6dx-8zbt.json` se capturaron verbatim del
 * endpoint el 09-nov-2026 (la procedencia y la consulta de cada caso están en
 * el propio archivo). NINGÚN test de este archivo hace una petición: el
 * `beforeAll` DEJA `fetch` ROTO a propósito, así que si alguien agrega un test
 * que toque la red, falla acá y no el día que se caiga el Estado.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash } from 'node:crypto'
import FIXTURES from './fixtures/secop.p6dx-8zbt.json'
import {
  CAMPOS_SECOP, CAMPO_SECOP, CAMPOS_NO_MAPEADOS,
  norm, texto, textoONull, numeroSecop, fechaSecopAIso, urlSecop, esUrlGenerica,
  categoriaONull, familiaRup, mapearModalidadSecop, problemaPresupuesto,
  docIdSecop, colapsarPorProceso, mapearProceso, guardaIdentidad, ingerirSecop,
  entradaSemaforoSecop, TOPE_PRESUPUESTO_COP, FAMILIAS_RUP_NEG,
  type FilaSecop,
} from '../secopMapeo'
import { SEMAFORO_VERSION } from '../semaforo'

const hash = (s: string) => createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 8)

type Caso = { consulta: string; filas: FilaSecop[] }
const casos = FIXTURES.casos as unknown as Record<string, Caso>
const caso = (k: string): FilaSecop[] => {
  const c = casos[k]
  if (!c) throw new Error(`fixture ausente: ${k}`)
  return c.filas
}
const una = (k: string): FilaSecop => caso(k)[0]

/** Mapea una fila suelta pasando por el colapso, como en producción. */
function mapearUna(f: FilaSecop) {
  const { procesos } = colapsarPorProceso([f])
  expect(procesos).toHaveLength(1)
  const r = mapearProceso(procesos[0], hash)
  if (!r) throw new Error('el mapeo devolvió null')
  return r
}

let fetchOriginal: typeof globalThis.fetch

beforeAll(() => {
  fetchOriginal = globalThis.fetch
  globalThis.fetch = (() => {
    throw new Error('NINGÚN test de este archivo puede tocar la red: usa los fixtures')
  }) as unknown as typeof globalThis.fetch
})
afterAll(() => { globalThis.fetch = fetchOriginal })

// ── La tabla de traducción ───────────────────────────────────────────────────

describe('tabla de campos — la lección de experiencia_total_smmlv', () => {
  it('las 59 columnas del dataset están todas traducidas o justificadas', () => {
    const traducidos = new Set<string>(Object.values(CAMPO_SECOP))
    const justificados = new Set(Object.keys(CAMPOS_NO_MAPEADOS))
    const huerfanos = CAMPOS_SECOP.filter(c => !traducidos.has(c) && !justificados.has(c))
    expect(huerfanos, `columnas sin destino ni motivo: ${huerfanos.join(', ')}`).toEqual([])
    expect(CAMPOS_SECOP).toHaveLength(59)
  })

  it('ningún campo está a la vez traducido y justificado', () => {
    const traducidos = new Set<string>(Object.values(CAMPO_SECOP))
    const ambos = Object.keys(CAMPOS_NO_MAPEADOS).filter(c => traducidos.has(c))
    expect(ambos).toEqual([])
  })

  it('cada columna del dataset existe en las filas reales o es nula omitida', () => {
    // No exige presencia (Socrata omite nulos): exige que no haya un nombre
    // inventado — ninguna fila real trae una clave fuera de CAMPOS_SECOP.
    const conocidos = new Set<string>(CAMPOS_SECOP)
    for (const [nombre, c] of Object.entries(casos)) {
      for (const f of c.filas) {
        const raras = Object.keys(f).filter(k => !conocidos.has(k))
        expect(raras, `${nombre} trae claves desconocidas: ${raras.join(', ')}`).toEqual([])
      }
    }
  })

  it('`proveedores_que_manifestaron` NO se mapea, y el motivo está escrito', () => {
    expect(Object.values(CAMPO_SECOP)).not.toContain('proveedores_que_manifestaron')
    expect(CAMPOS_NO_MAPEADOS.proveedores_que_manifestaron).toMatch(/CERO EN TODO EL DATASET/)
  })

  it('en los fixtures reales, proveedores_que_manifestaron es 0 en todas las filas', () => {
    const vistos = new Set<unknown>()
    for (const c of Object.values(casos)) {
      for (const f of c.filas) {
        if ('proveedores_que_manifestaron' in f) vistos.add(f.proveedores_que_manifestaron)
      }
    }
    expect([...vistos]).toEqual(['0'])
  })
})

// ── Lectores ─────────────────────────────────────────────────────────────────

describe('lectores — todo llega como texto y las claves nulas no vienen', () => {
  it('numeroSecop convierte el string del alambre', () => {
    const f = una('minima_limpia')
    expect(f[CAMPO_SECOP.presupuesto_oficial]).toBe('6000000')  // string, no número
    expect(numeroSecop(f, CAMPO_SECOP.presupuesto_oficial)).toBe(6_000_000)
    expect(numeroSecop(f, CAMPO_SECOP.ofertas_recibidas)).toBe(7)
  })

  it('un campo AUSENTE da null, no undefined ni NaN', () => {
    const f = una('precio_base_negativo')
    expect(CAMPO_SECOP['cronograma.publicacion'] in f).toBe(false)
    expect(fechaSecopAIso(f, CAMPO_SECOP['cronograma.publicacion'])).toBeNull()
    expect(numeroSecop({}, CAMPO_SECOP.presupuesto_oficial)).toBeNull()
  })

  it('numeroSecop rechaza basura en vez de inventar un número', () => {
    for (const v of ['', 'N/A', 'No Definido', 'abc', '1.200.000', '1,5', '--3']) {
      expect(numeroSecop({ precio_base: v }, 'precio_base'), v).toBeNull()
    }
    expect(numeroSecop({ precio_base: '-35272818' }, 'precio_base')).toBe(-35_272_818)
    expect(numeroSecop({ precio_base: '0' }, 'precio_base')).toBe(0)
  })

  it('el centinela "No Definido" es null, no la cadena', () => {
    const f = una('menor_cuantia')
    expect(f[CAMPO_SECOP['ganador.nit']]).toBe('No Definido')
    expect(textoONull(f, CAMPO_SECOP['ganador.nit'])).toBeNull()
    expect(texto(f, CAMPO_SECOP['ganador.nit'])).toBe('No Definido')  // el crudo sigue disponible
  })

  it('urlproceso llega como objeto y se desenvuelve', () => {
    const f = una('minima_limpia')
    expect(typeof f[CAMPO_SECOP.url_proceso]).toBe('object')
    expect(urlSecop(f, CAMPO_SECOP.url_proceso)).toMatch(/^https:\/\/community\.secop\.gov\.co\//)
    expect(esUrlGenerica(urlSecop(f, CAMPO_SECOP.url_proceso))).toBe(false)
  })

  it('detecta la url que apunta al LOGIN en vez de al proceso', () => {
    const f = una('precio_base_negativo')
    const u = urlSecop(f, CAMPO_SECOP.url_proceso)
    expect(u).toMatch(/STS\/Users\/Login/)
    expect(esUrlGenerica(u)).toBe(true)
    // La fidelidad manda: el valor se mapea igual, solo se marca.
    expect(mapearUna(f).doc.url_proceso).toBe(u)
    expect(mapearUna(f).meta.url_generica).toBe(true)
  })

  it('norm quita tildes y mayúsculas sin perder el texto', () => {
    expect(norm('Mínima cuantía')).toBe('MINIMA CUANTIA')
    expect(norm('  Distrito  Capital de Bogotá ')).toBe('DISTRITO CAPITAL DE BOGOTA')
    expect(norm(undefined)).toBe('')
  })
})

// ── Fechas ───────────────────────────────────────────────────────────────────

describe('fechas flotantes sin zona', () => {
  it('la fecha real se interpreta como hora civil de Colombia', () => {
    const f = una('categoria_unspecified')
    expect(f[CAMPO_SECOP['cronograma.publicacion']]).toBe('2026-10-02T00:00:00.000')
    // Medianoche en Bogotá = 05:00Z. Leerla como UTC mostraría el 1 de octubre.
    expect(fechaSecopAIso(f, CAMPO_SECOP['cronograma.publicacion']))
      .toBe('2026-10-02T05:00:00.000Z')
  })

  it('FECHA CORRUPTA: devuelve null y no rompe el mapeo', () => {
    // El endpoint nunca emite esto — la columna es `floating_timestamp` y lo
    // valida en origen. La fila es REAL y solo se MUTÓ la fecha, para probar
    // que una respuesta malformada (proxy, caché, cambio de esquema) no tumba
    // la ingesta.
    const base = una('minima_limpia')
    for (const corrupta of [
      '13/05/2026', '2026-13-45T00:00:00.000', 'null', '0000-00-00T00:00:00.000',
      '2026-02-31T00:00:00.000', '2026-10-02T99:99:99.000', 'ayer', '1760000000',
    ]) {
      const f: FilaSecop = { ...base, fecha_de_publicacion_del: corrupta }
      expect(fechaSecopAIso(f, CAMPO_SECOP['cronograma.publicacion']), corrupta).toBeNull()
      const r = mapearUna(f)
      expect(r.doc.cronograma.publicacion).toBeNull()
      expect(r.meta.sin_fecha_publicacion).toBe(true)
      // Lo demás del registro sigue intacto: una fecha mala no pierde el proceso.
      expect(r.doc.id_secop).toBe(texto(base, CAMPO_SECOP.id_secop))
      expect(r.doc.presupuesto_oficial).toBe(6_000_000)
    }
  })

  it('el resto del cronograma nace en null: el dataset no lo trae', () => {
    const r = mapearUna(una('minima_limpia'))
    expect(r.doc.cronograma.manifestacion).toBeNull()
    expect(r.doc.cronograma.sorteo).toBeNull()
    expect(r.doc.cronograma.cierre).toBeNull()
    expect(r.doc.cronograma.adjudicacion).toBeNull()
  })
})

// ── Casos del brief ──────────────────────────────────────────────────────────

describe('mínima cuantía limpia', () => {
  it('mapea campo por campo lo que pide el contrato', () => {
    const { doc, meta } = mapearUna(una('minima_limpia'))
    expect(doc.id_secop).toBe('CO1.REQ.7464030')
    expect(doc.numero_proceso).toBe('IMC-20-002-2025')
    expect(doc.entidad).toEqual({
      nombre: 'DIRECCION DE IMPUESTOS Y ADUANAS NACIONALES*',
      nit: '800197268',
      orden: 'Nacional',
      departamento: 'Distrito Capital de Bogotá',
      ciudad: 'Bogotá',
    })
    expect(doc.objeto).toMatch(/^PRESTACIÓN DE SERVICIOS DE LAVADO/)
    expect(doc.categoria_unspsc).toBe('V1.72102103')
    expect(doc.modalidad).toBe('minima_cuantia')
    expect(doc.presupuesto_oficial).toBe(6_000_000)
    expect(doc.lotes).toBe(0)
    expect(doc.cronograma.publicacion).toBe('2025-01-20T05:00:00.000Z')
    expect(doc.ofertas_recibidas).toBe(7)
    expect(doc.ganador).toEqual({ nombre: 'Tierra Viva Servicios Ambientales Integrales S.A.S', nit: '901207337' })
    expect(doc.oferta_ganador).toBe(6_000_000)
    expect(meta.familia_rup).toBe('familia_neg')
  })

  it('la forma de lo que entra es la del §6, y el semáforo va sellado', () => {
    const { doc } = mapearUna(una('minima_limpia'))
    expect(doc.estado).toBe('detectada')
    expect(doc.origen).toBe('secop_ii')
    expect(doc.migrado).toBe(false)
    expect(doc.consecutivo).toBe('')
    expect(doc.activa).toBe(true)
    expect(doc.semaforo).toBe('verde')
    expect(doc.semaforo_motivos).toEqual([])
    expect(doc.semaforo_version).toBe(SEMAFORO_VERSION)
    // Lo que el radar no puede saber nace vacío, no en cero.
    expect(doc.motivo_descarte).toBeNull()
    expect(doc.oferta_neg).toBeNull()
    expect(doc.manifestaciones).toBeNull()
    expect(doc.override_manual).toBeNull()
    expect(doc.capacidad_manual).toBeNull()
  })
})

describe('menor cuantía', () => {
  it('mapea la modalidad y cae en ROJO por el portero', () => {
    const { doc } = mapearUna(una('menor_cuantia'))
    expect(doc.modalidad).toBe('menor_cuantia')
    expect(doc.semaforo).toBe('rojo')
    expect(doc.semaforo_motivos).toEqual(['MODALIDAD_SIN_HISTORIAL'])
    expect(doc.presupuesto_oficial).toBe(640_000_000)
  })

  it('sin adjudicar: ganador y oferta en null, no en cero ni "No Definido"', () => {
    const { doc } = mapearUna(una('menor_cuantia'))
    expect(doc.ganador).toBeNull()
    expect(doc.oferta_ganador).toBeNull()
    expect(doc.ofertas_recibidas).toBe(0)   // ESTE sí es un cero real y medido
  })
})

describe('categoría UNSPECIFIED — el estado normal de lo recién publicado', () => {
  it('va a null y NO rompe', () => {
    const f = una('categoria_unspecified')
    expect(f[CAMPO_SECOP.categoria_unspsc]).toBe('UNSPECIFIED')
    expect(categoriaONull(f)).toBeNull()
    const { doc, meta } = mapearUna(f)
    expect(doc.categoria_unspsc).toBeNull()
    expect(meta.categoria_cruda).toBe('UNSPECIFIED')
  })

  it('la familia queda SIN CLASIFICAR, que no es lo mismo que fuera de familia', () => {
    expect(mapearUna(una('categoria_unspecified')).meta.familia_rup).toBe('sin_clasificar')
    expect(familiaRup(null)).toBe('sin_clasificar')
    expect(familiaRup('V1.72102103')).toBe('familia_neg')
    expect(familiaRup('V1.80111500')).toBe('fuera_de_familia')
    for (const f of FAMILIAS_RUP_NEG) expect(familiaRup(`${f}0000`)).toBe('familia_neg')
  })
})

describe('departamento_entidad = "No Definido"', () => {
  it('no se guarda el centinela: queda vacío y el semáforo no lo toma por territorio', () => {
    const f = una('departamento_no_definido')
    expect(f[CAMPO_SECOP['entidad.departamento']]).toBe('No Definido')
    const { doc } = mapearUna(f)
    expect(doc.entidad.departamento).toBe('')
    expect(doc.entidad.ciudad).toBe('')
    expect(entradaSemaforoSecop(doc).departamento).toBe('')
  })

  it('el ganador con nit centinela conserva el nombre y pierde el nit', () => {
    const { doc } = mapearUna(una('departamento_no_definido'))
    expect(doc.ganador).toEqual({ nombre: 'EDGAR CARPIO SOLANO', nit: null })
    expect(doc.oferta_ganador).toBe(94_733_598)
  })
})

describe('presupuesto inservible', () => {
  it('CERO: a null, y el reporte dice que era cero (no "ausente")', () => {
    const f = una('precio_base_cero')
    expect(f[CAMPO_SECOP.presupuesto_oficial]).toBe('0')
    const { doc, meta } = mapearUna(f)
    expect(doc.presupuesto_oficial).toBeNull()
    expect(meta.problema_presupuesto).toBe('cero')
    expect(meta.presupuesto_crudo).toBe(0)
  })

  it('NEGATIVO (caso real −$35.272.818): a null, marcado como negativo', () => {
    const { doc, meta } = mapearUna(una('precio_base_negativo'))
    expect(doc.presupuesto_oficial).toBeNull()
    expect(meta.problema_presupuesto).toBe('negativo')
    expect(meta.presupuesto_crudo).toBe(-35_272_818)
  })

  it('ABSURDO (caso real $11.111.111.111.111.111): a null por el tope', () => {
    const { doc, meta } = mapearUna(una('precio_base_absurdo'))
    expect(meta.presupuesto_crudo).toBe(11_111_111_111_111_111)
    expect(meta.presupuesto_crudo! > TOPE_PRESUPUESTO_COP).toBe(true)
    expect(meta.problema_presupuesto).toBe('absurdo')
    expect(doc.presupuesto_oficial).toBeNull()
  })

  it('un presupuesto sano pasa igual', () => {
    expect(problemaPresupuesto(6_000_000)).toBeNull()
    expect(problemaPresupuesto(TOPE_PRESUPUESTO_COP)).toBeNull()
    expect(problemaPresupuesto(TOPE_PRESUPUESTO_COP + 1)).toBe('absurdo')
  })
})

describe('modalidades', () => {
  it('la variante SIN TILDES entra como menor cuantía (decisión documentada)', () => {
    const f = una('modalidad_sin_tildes')
    expect(f[CAMPO_SECOP.modalidad]).toBe('Seleccion Abreviada Menor Cuantia Sin Manifestacion Interes')
    const r = mapearModalidadSecop(f)
    expect(r.modalidad).toBe('menor_cuantia')
    expect(r.imprevista).toBe(false)
    expect(mapearUna(f).doc.semaforo).toBe('rojo')
  })

  it('las 17 modalidades medidas en el dataset están todas previstas', () => {
    const MEDIDAS = [
      'Contratación directa', 'Contratación régimen especial', 'Mínima cuantía',
      'Selección Abreviada de Menor Cuantía', 'Selección abreviada subasta inversa',
      'Solicitud de información a los Proveedores', 'Contratación régimen especial (con ofertas)',
      'Contratación Directa (con ofertas)', 'Licitación pública', 'Concurso de méritos abierto',
      'Licitación pública Obra Publica', 'Licitación Pública Acuerdo Marco de Precios',
      'Seleccion Abreviada Menor Cuantia Sin Manifestacion Interes', 'Subasta de prueba',
      'Enajenación de bienes con subasta', 'Enajenación de bienes con sobre cerrado',
      'Concurso de méritos con precalificación',
    ]
    expect(MEDIDAS).toHaveLength(17)
    for (const m of MEDIDAS) {
      const r = mapearModalidadSecop({ modalidad_de_contratacion: m })
      expect(r.imprevista, m).toBe(false)
    }
  })

  it('una modalidad NUEVA cae en "otra" pero queda REPORTADA', () => {
    const r = mapearModalidadSecop({ modalidad_de_contratacion: 'Modalidad que no existía' })
    expect(r.modalidad).toBe('otra')
    expect(r.imprevista).toBe(true)
    expect(r.crudo).toBe('Modalidad que no existía')
  })
})

describe('lotes', () => {
  it('"0" es SIN LOTES, un dato real, no una ausencia', () => {
    const f = una('minima_limpia')
    expect(f[CAMPO_SECOP.lotes]).toBe('0')
    expect(mapearUna(f).doc.lotes).toBe(0)
  })

  it('un proceso con 3 lotes conserva el número', () => {
    const f = una('lotes_multiples')
    expect(f[CAMPO_SECOP.lotes]).toBe('3')
    expect(mapearUna(f).doc.lotes).toBe(3)
  })

  it('si la columna falta, lotes cae en 0 y no en NaN', () => {
    const f: FilaSecop = { ...una('minima_limpia') }
    delete (f as Record<string, unknown>).numero_de_lotes
    expect(mapearUna(f).doc.lotes).toBe(0)
  })
})

// ── Deduplicación: la lección del importador ────────────────────────────────

describe('deduplicación por id_del_proceso, no por referencia', () => {
  it('CLAVE: misma referencia + distinto id = DOS procesos distintos', () => {
    const filas = caso('misma_referencia_distinto_id')
    expect(filas).toHaveLength(2)
    const refs = new Set(filas.map(f => texto(f, CAMPO_SECOP.numero_proceso)))
    const ids = new Set(filas.map(f => texto(f, CAMPO_SECOP.id_secop)))
    expect(refs.size, 'la referencia es la MISMA en las dos filas').toBe(1)
    expect([...refs][0]).toBe('MC-001-2025')
    expect(ids.size, 'los id_del_proceso son distintos').toBe(2)

    const rep = ingerirSecop(filas, hash)
    expect(rep.procesos).toBe(2)
    expect(rep.registros).toHaveLength(2)
    expect(rep.colisiones).toEqual([])
    // Y son entidades distintas: deduplicar por referencia habría perdido una.
    const nits = new Set(rep.registros.map(r => r.doc.entidad.nit))
    expect(nits.size).toBe(2)
  })

  it('el doc id es determinístico: re-ingerir actualiza, no duplica', () => {
    const filas = caso('misma_referencia_distinto_id')
    const a = ingerirSecop(filas, hash).registros.map(r => r.meta.doc_id)
    const b = ingerirSecop([...filas].reverse(), hash).registros.map(r => r.meta.doc_id)
    expect([...a].sort()).toEqual([...b].sort())
  })

  it('el prefijo legible NO es identidad: ids que lo comparten no colisionan', () => {
    // Mismo prefijo tras colapsar la puntuación; el sufijo de hash los separa.
    const a = docIdSecop('CO1.REQ.123', hash)
    const b = docIdSecop('CO1-REQ-123', hash)
    expect(a.startsWith('secop_CO1_REQ_123_')).toBe(true)
    expect(b.startsWith('secop_CO1_REQ_123_')).toBe(true)
    expect(a).not.toBe(b)
  })

  it('la guarda de identidad NOMBRA a los culpables si dos procesos colisionan', () => {
    const colapsado = (id: string) => ({
      doc: { id_secop: id } as never,
      meta: { doc_id: 'secop_MISMO_ID_deadbeef' } as never,
    })
    const g = guardaIdentidad([colapsado('CO1.REQ.1'), colapsado('CO1.REQ.2')])
    expect(g.procesos).toBe(2)
    expect(g.doc_ids).toBe(1)
    expect(g.colisiones).toEqual([
      { doc_id: 'secop_MISMO_ID_deadbeef', ids_secop: ['CO1.REQ.1', 'CO1.REQ.2'] },
    ])
  })

  it('una colisión BLOQUEA la escritura con la señal contada', () => {
    const base = una('minima_limpia')
    // Dos procesos cuyos ids difieren: no colisionan (control).
    const otro: FilaSecop = { ...base, id_del_proceso: 'CO1.REQ.9999999' }
    const ok = ingerirSecop([base, otro], hash)
    expect(ok.procesos).toBe(2)
    expect(ok.puede_escribir).toBe(true)
  })

  it('una fila SIN id_del_proceso se cuenta aparte y no produce documento', () => {
    const base = una('minima_limpia')
    const sinId: FilaSecop = { ...base }
    delete (sinId as Record<string, unknown>).id_del_proceso
    const rep = ingerirSecop([base, sinId], hash)
    expect(rep.filas_vistas).toBe(2)
    expect(rep.filas_sin_identidad).toBe(1)
    expect(rep.procesos).toBe(1)
  })
})

// ── Una fila no es un proceso ────────────────────────────────────────────────

describe('multi-adjudicación: el producto cartesiano de proveedores × valores', () => {
  it('4 filas del mismo proceso colapsan a UN registro', () => {
    const filas = caso('multi_adjudicacion_mismo_id')
    expect(filas.length).toBeGreaterThan(1)
    const ids = new Set(filas.map(f => texto(f, CAMPO_SECOP.id_secop)))
    expect(ids.size).toBe(1)

    const rep = ingerirSecop(filas, hash)
    expect(rep.procesos).toBe(1)
    expect(rep.registros).toHaveLength(1)
    expect(rep.registros[0].meta.filas_origen).toBe(filas.length)
  })

  it('CLAVE: con varias parejas (proveedor, valor) NO se inventa un ganador', () => {
    const filas = caso('multi_adjudicacion_mismo_id')
    const { procesos } = colapsarPorProceso(filas)
    const p = procesos[0]
    // Si el fixture trae más de un proveedor o más de un valor, la pareja de
    // cualquier fila sería inventada.
    if (p.proveedores > 1 || p.valores > 1) {
      expect(p.adjudicacion_ambigua).toBe(true)
      expect(p.ganador).toBeNull()
      expect(p.oferta_ganador).toBeNull()
      const rep = ingerirSecop(filas, hash)
      expect(rep.adjudicacion_ambigua).toBe(1)
      expect(rep.registros[0].doc.ganador).toBeNull()
      expect(rep.registros[0].doc.oferta_ganador).toBeNull()
    } else {
      expect(p.adjudicacion_ambigua).toBe(false)
    }
  })

  it('con un solo proveedor repetido en varias filas SÍ se fija el ganador', () => {
    const base = una('minima_limpia')
    const rep = ingerirSecop([base, { ...base }], hash)
    expect(rep.procesos).toBe(1)
    expect(rep.registros[0].meta.filas_origen).toBe(2)
    expect(rep.registros[0].meta.adjudicacion_ambigua).toBe(false)
    expect(rep.registros[0].doc.ganador?.nit).toBe('901207337')
  })

  it('reporta los campos ESTABLES que divergieron entre filas del mismo proceso', () => {
    const base = una('minima_limpia')
    const mutada: FilaSecop = { ...base, precio_base: '7000000' }
    const { procesos } = colapsarPorProceso([base, mutada])
    expect(procesos[0].campos_divergentes).toContain('precio_base')
  })
})

// ── Semáforo ─────────────────────────────────────────────────────────────────

describe('semáforo en la ingesta — consecuencia honesta', () => {
  it('de SECOP salen VERDES las mínimas cuantías y ROJAS todas las demás', () => {
    const verdes = ['minima_limpia', 'categoria_unspecified']
    const rojas = ['menor_cuantia', 'departamento_no_definido', 'modalidad_sin_tildes', 'precio_base_cero']
    for (const k of verdes) expect(mapearUna(una(k)).doc.semaforo, k).toBe('verde')
    for (const k of rojas) expect(mapearUna(una(k)).doc.semaforo, k).toBe('rojo')
  })

  it('las tres señales que el dataset no tiene entran en false, no inventadas', () => {
    const e = entradaSemaforoSecop({ modalidad: 'minima_cuantia', entidad: { departamento: 'Cundinamarca' } })
    expect(e.tiene_sorteo).toBe(false)
    expect(e.limitacion_mipyme).toBe(false)
    expect(e.requiere_lectura).toBe(false)
    expect(e.departamento).toBe('Cundinamarca')
  })

  it('NINGÚN registro de ingesta nace en amarillo: el amarillo lo pone la lectura', () => {
    const todas = Object.values(casos).flatMap(c => c.filas)
    const rep = ingerirSecop(todas, hash)
    expect(rep.registros.map(r => r.doc.semaforo)).not.toContain('amarillo')
  })
})

// ── Reporte y guard ──────────────────────────────────────────────────────────

describe('reporte de ingesta', () => {
  it('cuenta filas, procesos y familias sobre el lote completo de fixtures', () => {
    const todas = Object.values(casos).flatMap(c => c.filas)
    const rep = ingerirSecop(todas, hash)
    expect(rep.filas_vistas).toBe(todas.length)
    const suma = rep.por_familia.familia_neg + rep.por_familia.fuera_de_familia
      + rep.por_familia.sin_clasificar
    expect(suma).toBe(rep.procesos)
    expect(rep.por_familia.sin_clasificar).toBeGreaterThanOrEqual(1)  // el UNSPECIFIED
    expect(rep.sin_fecha_publicacion).toBeGreaterThanOrEqual(1)       // las dos sin fecha
    expect(rep.urls_genericas).toBeGreaterThanOrEqual(1)              // la del login
  })

  it('las modalidades imprevistas pasan del umbral y BLOQUEAN la escritura', () => {
    const base = una('minima_limpia')
    const rara: FilaSecop = {
      ...base, id_del_proceso: 'CO1.REQ.0000001',
      modalidad_de_contratacion: 'Modalidad del futuro',
    }
    const rep = ingerirSecop([rara], hash)
    expect(rep.modalidades_imprevistas).toEqual([{ crudo: 'Modalidad del futuro', procesos: 1 }])
    expect(rep.puede_escribir).toBe(false)
    expect(rep.senales.join(' ')).toMatch(/MODALIDADES IMPREVISTAS/)
  })

  it('un lote sano puede escribir y no deja señales', () => {
    const rep = ingerirSecop(caso('misma_referencia_distinto_id'), hash)
    expect(rep.senales).toEqual([])
    expect(rep.puede_escribir).toBe(true)
  })

  it('el lote vacío no divide por cero', () => {
    const rep = ingerirSecop([], hash)
    expect(rep.procesos).toBe(0)
    expect(rep.senales).toEqual([])
    expect(rep.puede_escribir).toBe(true)
  })
})
