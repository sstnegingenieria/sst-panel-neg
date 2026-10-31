/**
 * Plantilla de requisitos — fuente única y forma.
 *
 * ⚠ DIFERENCIA DELIBERADA con `semaforoVersiones.test.ts`: allá el archivo TS
 * DECLARA las constantes de texto y el test las compara contra el JSON
 * carácter por carácter (son cuatro párrafos de prosa; duplicarlos y fijar la
 * igualdad por test fue la decisión de la casa). Acá el TS **importa** el
 * JSON, porque son 22 renglones estructurados: re-teclearlos crearía
 * exactamente la divergencia que el patrón quiere evitar. La comparación
 * carácter por carácter se mantiene de todos modos — contra el archivo leído
 * del disco por una vía independiente del import — y además se valida EN
 * RUNTIME que cada vocabulario cerrado se respete, porque el `as` del import
 * no verifica nada.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import type { Timestamp } from 'firebase/firestore'
import {
  CAPITULOS_PLANTILLA, CAPITULO_LABEL,
  VERSION_PLANTILLA_INICIAL, NOMBRE_PLANTILLA_V1_0, ORIGEN_PLANTILLA_V1_0,
  ITEMS_PLANTILLA_V1_0,
  construirSemillaPlantillaRequisitos, plantillaVigente, itemsPlantillaVigente,
  itemPlantillaValido, registroPlantillaCoherente, conteoPorCapitulo,
} from '../plantillaRequisitos'
import type { ItemPlantillaRequisito, RegistroPlantillaRequisitos } from '../plantillaRequisitos'
import { CATEGORIAS_REQUISITO, TIPOS_EVIDENCIA, personalAcreditado } from '../requisito'

/** Lectura del JSON por una vía INDEPENDIENTE del import del módulo. */
const require_ = createRequire(import.meta.url)
const JSON_DISCO = require_(
  resolve(__dirname, '../../../../functions/scripts/plantilla-requisitos-v1.0.json'),
)

const ts = (ms: number) => ({ toMillis: () => ms } as unknown as Timestamp)
const AHORA = ts(1_000_000)

// ═════════════════════════════════════════════════════════════════════════════
// Fuente única
// ═════════════════════════════════════════════════════════════════════════════

describe('el JSON es la fuente única', () => {
  it('versión, nombre y origen coinciden carácter por carácter', () => {
    expect(VERSION_PLANTILLA_INICIAL).toBe(JSON_DISCO.version)
    expect(NOMBRE_PLANTILLA_V1_0).toBe(JSON_DISCO.nombre)
    expect(ORIGEN_PLANTILLA_V1_0).toBe(JSON_DISCO.origen)
  })

  it('los 22 renglones coinciden uno a uno, campo por campo', () => {
    expect(ITEMS_PLANTILLA_V1_0).toHaveLength(JSON_DISCO.items.length)
    ITEMS_PLANTILLA_V1_0.forEach((item, i) => {
      expect(item, `renglón ${i}`).toEqual(JSON_DISCO.items[i])
    })
  })

  it('GUARDARRAÍL: el JSON no trae campos que el TS ignore', () => {
    // La lección del `limitaciones` olvidado: el JSON ganó un campo en el
    // 1.3b y el script de siembra no lo escribía — invisible hasta que se
    // miró el dry-run. Si alguien agrega una clave al JSON, este test la
    // delata en vez de dejarla caer en silencio.
    const CLAVES_RAIZ = ['version', 'nombre', 'origen', 'nota_descripcion', 'nota_capitulo', 'items']
    expect(Object.keys(JSON_DISCO).sort()).toEqual([...CLAVES_RAIZ].sort())

    const CLAVES_ITEM = ['capitulo', 'categoria', 'descripcion', 'tipo_evidencia']
    for (const [i, item] of JSON_DISCO.items.entries()) {
      expect(Object.keys(item).sort(), `renglón ${i}`).toEqual([...CLAVES_ITEM].sort())
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Vocabularios — el `as` del import no verifica nada
// ═════════════════════════════════════════════════════════════════════════════

describe('vocabularios cerrados, validados en RUNTIME', () => {
  it('cada `capitulo` pertenece a CAPITULOS_PLANTILLA', () => {
    for (const i of ITEMS_PLANTILLA_V1_0) {
      expect(CAPITULOS_PLANTILLA, i.descripcion).toContain(i.capitulo)
    }
  })

  it('cada `categoria` pertenece a CATEGORIAS_REQUISITO', () => {
    for (const i of ITEMS_PLANTILLA_V1_0) {
      expect(CATEGORIAS_REQUISITO, i.descripcion).toContain(i.categoria)
    }
  })

  it('cada `tipo_evidencia` pertenece a TIPOS_EVIDENCIA', () => {
    for (const i of ITEMS_PLANTILLA_V1_0) {
      expect(TIPOS_EVIDENCIA, i.descripcion).toContain(i.tipo_evidencia)
    }
  })

  it('ninguna descripción está vacía', () => {
    for (const i of ITEMS_PLANTILLA_V1_0) expect(i.descripcion.trim()).not.toBe('')
  })

  it('no hay descripciones repetidas — dos renglones iguales son un error de captura', () => {
    const d = ITEMS_PLANTILLA_V1_0.map(i => i.descripcion)
    expect(new Set(d).size).toBe(d.length)
  })

  it('los tres capítulos tienen label', () => {
    for (const c of CAPITULOS_PLANTILLA) expect(CAPITULO_LABEL[c]).toBeTruthy()
  })

  it('itemPlantillaValido acepta los 22 y rechaza basura', () => {
    for (const i of ITEMS_PLANTILLA_V1_0) expect(itemPlantillaValido(i), i.descripcion).toBe(true)
    const malo = { ...ITEMS_PLANTILLA_V1_0[0] }
    expect(itemPlantillaValido({ ...malo, descripcion: '  ' })).toBe(false)
    expect(itemPlantillaValido({ ...malo, categoria: 'inventada' as never })).toBe(false)
    expect(itemPlantillaValido({ ...malo, tipo_evidencia: 'papelito' as never })).toBe(false)
    expect(itemPlantillaValido({ ...malo, capitulo: 'otros' as never })).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// El contenido que reportó el área
// ═════════════════════════════════════════════════════════════════════════════

describe('la lista reportada por el área comercial', () => {
  it('10 jurídicos · 5 técnicos · 7 financieros = 22', () => {
    expect(conteoPorCapitulo(ITEMS_PLANTILLA_V1_0))
      .toEqual({ juridicos: 10, tecnicos: 5, financieros: 7 })
    expect(ITEMS_PLANTILLA_V1_0).toHaveLength(22)
  })

  it('los diez jurídicos están, con el nombre con que llegaron', () => {
    const d = ITEMS_PLANTILLA_V1_0.filter(i => i.capitulo === 'juridicos')
      .map(i => i.descripcion.toLowerCase())
    for (const esperado of [
      'carta de presentación', 'parafiscales', 'cédula', 'existencia y representación',
      'antecedentes de la empresa', 'antecedentes del representante',
      'formatos de la entidad', 'mipyme', 'industria nacional', 'empresa de mujeres',
    ]) {
      expect(d.some(x => x.includes(esperado)), esperado).toBe(true)
    }
  })

  it('los cinco técnicos y los siete financieros, igual', () => {
    const tec = ITEMS_PLANTILLA_V1_0.filter(i => i.capitulo === 'tecnicos')
      .map(i => i.descripcion.toLowerCase())
    for (const e of ['experiencia', 'personal mínimo', 'sst', 'calidad', 'ambientales']) {
      expect(tec.some(x => x.includes(e)), e).toBe(true)
    }
    const fin = ITEMS_PLANTILLA_V1_0.filter(i => i.capitulo === 'financieros')
      .map(i => i.descripcion.toLowerCase())
    for (const e of [
      'estados financieros', 'capacidad residual', 'rup', 'garantía de seriedad',
      'oferta económica', 'rut', 'certificación bancaria',
    ]) {
      expect(fin.some(x => x.includes(e)), e).toBe(true)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// La consecuencia que NO es cosmética: `personal mínimo` y la invariante 3
// ═════════════════════════════════════════════════════════════════════════════

describe('CLAVE: «personal mínimo» entra como categoria `personal`', () => {
  const personalMinimo = ITEMS_PLANTILLA_V1_0.find(i => i.descripcion.includes('Personal mínimo'))!

  it('el pliego lo agrupa en Técnicos, pero su categoria es `personal`', () => {
    // Las dos cosas son ciertas y viven en campos distintos: `capitulo`
    // conserva la agrupación del pliego, `categoria` es la taxonomía del
    // modelo. No se perdió nada.
    expect(personalMinimo).toBeDefined()
    expect(personalMinimo.capitulo).toBe('tecnicos')
    expect(personalMinimo.categoria).toBe('personal')
  })

  it('y por eso la INVARIANTE 3 se dispara sobre él', () => {
    // Si estuviera en `tecnico`, marcarlo `cumple` SIN persona pasaría — y
    // ese es exactamente el requisito que costó la pérdida de 2026 (COPNIA).
    // Esto es la razón de que la elección de categoria no sea cosmética.
    expect(personalAcreditado({
      categoria: personalMinimo.categoria, estado: 'cumple', persona: null,
    })).toBe(false)

    expect(personalAcreditado({
      categoria: 'tecnico', estado: 'cumple', persona: null,
    })).toBe(true)
  })

  it('«experiencia» usa su propia categoria — descriptivo, sin cambio de comportamiento', () => {
    const exp = ITEMS_PLANTILLA_V1_0.find(i => i.descripcion.includes('Experiencia'))!
    expect(exp.capitulo).toBe('tecnicos')
    expect(exp.categoria).toBe('experiencia')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Una lista de PREGUNTAS, no de respuestas
// ═════════════════════════════════════════════════════════════════════════════

describe('la plantilla no trae veredictos', () => {
  it('ningún renglón declara estado, firma ni evidencia', () => {
    // No hay camino para que la plantilla traiga un `cumple` preasignado,
    // por la misma razón que la invariante 1 impide heredar estado entre
    // licitaciones: lo que se hereda es la ESTRUCTURA, nunca el veredicto.
    const PROHIBIDOS = [
      'estado', 'verificado_por', 'verificado_en', 'valor_neg', 'persona',
      'documento_empresa_id', 'activo',
    ]
    for (const i of ITEMS_PLANTILLA_V1_0) {
      for (const k of PROHIBIDOS) {
        expect(Object.keys(i), `${i.descripcion} / ${k}`).not.toContain(k)
      }
    }
  })

  it('ningún RENGLÓN menciona un veredicto', () => {
    // Acotado a los items a propósito: la prosa de las notas del JSON sí
    // habla de "cumple" al explicar la invariante 3, y eso es documentación,
    // no dato. Lo que no puede traer un veredicto es el renglón.
    for (const i of JSON_DISCO.items) {
      const texto = JSON.stringify(i).toLowerCase()
      for (const v of ['cumple', 'no_cumple', 'no_aplica', 'pendiente']) {
        expect(texto, `${i.descripcion} / ${v}`).not.toContain(v)
      }
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// El documento a sembrar
// ═════════════════════════════════════════════════════════════════════════════

describe('construirSemillaPlantillaRequisitos', () => {
  const doc = () => construirSemillaPlantillaRequisitos('uid-de-prueba', AHORA)

  it('la versión del JSON es la clave y también `version_actual`', () => {
    expect(Object.keys(doc().versiones)).toEqual([JSON_DISCO.version])
    expect(doc().version_actual).toBe(JSON_DISCO.version)
  })

  it('nace vigente y con los 22 renglones', () => {
    const v = plantillaVigente(doc())!
    expect(v.vigente_hasta).toBeNull()
    expect(v.items).toHaveLength(22)
    expect(v.nombre).toBe(JSON_DISCO.nombre)
    expect(v.origen).toBe(JSON_DISCO.origen)
  })

  it('el autor y el reloj entran por parámetro — la función es pura', () => {
    expect(plantillaVigente(doc())!.autor_uid).toBe('uid-de-prueba')
    expect(plantillaVigente(doc())!.vigente_desde).toBe(AHORA)
    expect(construirSemillaPlantillaRequisitos('a', AHORA))
      .toEqual(construirSemillaPlantillaRequisitos('a', AHORA))
  })

  it('el registro sembrado es coherente', () => {
    expect(registroPlantillaCoherente(doc())).toBe(true)
  })
})

describe('plantillaVigente / itemsPlantillaVigente', () => {
  it('resuelve la vigente por índice del objeto', () => {
    const r = construirSemillaPlantillaRequisitos('u', AHORA)
    expect(plantillaVigente(r)?.nombre).toBe(NOMBRE_PLANTILLA_V1_0)
    expect(itemsPlantillaVigente(r)).toHaveLength(22)
  })

  it('null y lista vacía sin lanzar cuando no hay registro', () => {
    expect(plantillaVigente(null)).toBeNull()
    expect(plantillaVigente(undefined)).toBeNull()
    expect(itemsPlantillaVigente(null)).toEqual([])
  })

  it('null si `version_actual` apunta a una versión que no existe', () => {
    const r = { ...construirSemillaPlantillaRequisitos('u', AHORA), version_actual: 'v9.9' }
    expect(plantillaVigente(r)).toBeNull()
    expect(registroPlantillaCoherente(r)).toBe(false)
  })
})

describe('registroPlantillaCoherente — los casos de rechazo', () => {
  const base = () => construirSemillaPlantillaRequisitos('u', AHORA)

  it('RECHAZO: la versión actual ya está cerrada', () => {
    const r = base()
    r.versiones[VERSION_PLANTILLA_INICIAL].vigente_hasta = AHORA
    expect(registroPlantillaCoherente(r)).toBe(false)
  })

  it('RECHAZO: plantilla sin renglones — una lista vacía no sirve de punto de partida', () => {
    const r = base()
    r.versiones[VERSION_PLANTILLA_INICIAL].items = []
    expect(registroPlantillaCoherente(r)).toBe(false)
  })

  it('RECHAZO: un renglón con vocabulario inventado', () => {
    const r = base()
    const items = [...r.versiones[VERSION_PLANTILLA_INICIAL].items]
    items[3] = { ...items[3], tipo_evidencia: 'papelito' as never }
    r.versiones[VERSION_PLANTILLA_INICIAL].items = items
    expect(registroPlantillaCoherente(r)).toBe(false)
  })

  it('RECHAZO: registro sin versiones', () => {
    expect(registroPlantillaCoherente(
      { versiones: {}, version_actual: 'v1.0' } as RegistroPlantillaRequisitos,
    )).toBe(false)
  })
})

describe('conteoPorCapitulo', () => {
  it('cuenta sin perder renglones', () => {
    const c = conteoPorCapitulo(ITEMS_PLANTILLA_V1_0)
    expect(c.juridicos + c.tecnicos + c.financieros).toBe(ITEMS_PLANTILLA_V1_0.length)
  })

  it('lista vacía da ceros, no undefined', () => {
    expect(conteoPorCapitulo([] as ItemPlantillaRequisito[]))
      .toEqual({ juridicos: 0, tecnicos: 0, financieros: 0 })
  })
})
