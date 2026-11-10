/**
 * LA GUARDA DE RUTAS DE ESCRITURA DEL RADAR.
 *
 * Con `roles/datastore.user` la cuenta de servicio del radar puede escribir en
 * CUALQUIER parte de Firestore — está medido y citado en
 * `docs/radar-cuenta-de-servicio.md`: el rol es todo-o-nada sobre la base, IAM
 * no llega a nivel de colección, y los clientes de servidor omiten las
 * Security Rules.
 *
 * Lo único que impide que el radar escriba en `users` o en `proyectos` es
 * nuestro código. Este archivo es el test que convierte esa intención en un
 * control:
 *
 *  1. la matriz de rutas permitidas y negadas;
 *  2. que la lista blanca tenga EXACTAMENTE dos entradas (ampliarla es un diff
 *     visible, no un descuido);
 *  3. que el CÓDIGO FUENTE de la Cloud Function no construya referencias por
 *     fuera de los dos helpers, y que cada ESCRITURA pase por el validador.
 *
 * El punto 3 es el que atrapa el caso real: alguien agrega
 * `db.doc('users/' + uid).set(...)` en la CF y la suite cae acá, no en
 * producción tres meses después.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  COL_LICITACIONES, RUTA_ESTADO_RADAR, RUTA_VOCABULARIO_NEG,
  RUTAS_ESCRITURA_RADAR, RUTAS_LECTURA_RADAR,
  rutaLicitacion, esRutaDeEscrituraPermitida, validarRutaEscritura,
} from '../radarRutas'

const RAIZ = resolve(__dirname, '../../../..')
const RUTA_CF = resolve(RAIZ, 'functions-radar/src/index.ts')
const fuenteCF = readFileSync(RUTA_CF, 'utf8')

// ── 1. La matriz ─────────────────────────────────────────────────────────────

describe('rutas que el radar PUEDE escribir', () => {
  it('el documento de una licitación', () => {
    expect(esRutaDeEscrituraPermitida('licitaciones/secop_CO1_REQ_7464030_ab12cd34')).toBe(true)
    expect(esRutaDeEscrituraPermitida(rutaLicitacion('secop_X_0f0f0f0f'))).toBe(true)
  })

  it('el estado del radar', () => {
    expect(esRutaDeEscrituraPermitida(RUTA_ESTADO_RADAR)).toBe(true)
    expect(RUTA_ESTADO_RADAR).toBe('configuracion/radar_secop')
  })
})

describe('rutas que el radar NO puede escribir', () => {
  it('otras colecciones, incluidas las de los otros frentes', () => {
    for (const r of [
      'users/uid-karen',
      'proyectos/pry_1',
      'cotizaciones/cot_1',
      'contratistas/c_1',
      'registros_horario/ev_1',
      'verificaciones_sst/pry_1',
      'compras_proyecto/pry_1',
      'formularios/f_1',
      'obras/pry_1',
    ]) {
      expect(esRutaDeEscrituraPermitida(r), r).toBe(false)
    }
  })

  it('otros documentos de `configuracion`, que tienen otros dueños', () => {
    for (const r of [
      'configuracion/indicadores',
      'configuracion/horario',
      'configuracion/semaforo_versiones',
      'configuracion/plantilla_requisitos',
      'configuracion/censo_consecutivos',
    ]) {
      expect(esRutaDeEscrituraPermitida(r), r).toBe(false)
    }
  })

  it('CLAVE: el léxico se LEE, no se escribe — lo adopta una persona', () => {
    expect(RUTAS_LECTURA_RADAR).toContain(RUTA_VOCABULARIO_NEG)
    expect(esRutaDeEscrituraPermitida(RUTA_VOCABULARIO_NEG)).toBe(false)
  })

  it('las SUBCOLECCIONES de una licitación quedan fuera a propósito', () => {
    // El radar escribe el documento de la licitación, no sus requisitos ni sus
    // adjuntos, que tienen otros dueños (A.2a/A.2b).
    expect(esRutaDeEscrituraPermitida('licitaciones/lic_1/requisitos/r_1')).toBe(false)
    expect(esRutaDeEscrituraPermitida('licitaciones/lic_1/adjuntos/a_1')).toBe(false)
  })

  it('la colección suelta, las rutas raras y la basura', () => {
    for (const r of [
      'licitaciones',                 // una colección no es un documento
      '',
      '/licitaciones/x',
      'licitaciones//x',
      'licitaciones/',
      'licitaciones/..',
      'licitaciones/../users/x',
      '  licitaciones/x',
      'licitaciones/x y',
      'LICITACIONES/x',               // la colección es en minúsculas
    ]) {
      expect(esRutaDeEscrituraPermitida(r), JSON.stringify(r)).toBe(false)
    }
  })

  it('el validador LANZA, y el mensaje dice qué ruta y qué hacer', () => {
    expect(() => validarRutaEscritura('users/uid-1')).toThrow(/RUTA NO PERMITIDA/)
    expect(() => validarRutaEscritura('users/uid-1')).toThrow(/users\/uid-1/)
    expect(() => validarRutaEscritura('users/uid-1')).toThrow(/RUTAS_ESCRITURA_RADAR/)
    // Y devuelve la ruta cuando sí se puede, para usarlo en línea.
    expect(validarRutaEscritura(rutaLicitacion('x'))).toBe('licitaciones/x')
  })
})

// ── 2. La lista blanca no crece sin que se vea ──────────────────────────────

describe('la lista blanca', () => {
  it('tiene EXACTAMENTE dos entradas', () => {
    // Si este test cae, alguien amplió el alcance de escritura del radar. Eso
    // puede estar bien — pero es una decisión, y tiene que verse en el diff.
    expect(RUTAS_ESCRITURA_RADAR).toEqual([
      'licitaciones/{docId}',
      'configuracion/radar_secop',
    ])
  })

  it('la colección del radar es `licitaciones`', () => {
    expect(COL_LICITACIONES).toBe('licitaciones')
  })
})

// ── 3. El código fuente de la Cloud Function ───────────────────────────────

describe('la Cloud Function no construye referencias por fuera de los helpers', () => {
  it('existe el archivo que se está vigilando', () => {
    // Si la CF se mueve de lugar, este test tiene que caer: una guarda que
    // vigila un archivo que ya no existe es una guarda apagada.
    expect(fuenteCF.length).toBeGreaterThan(1000)
    expect(fuenteCF).toContain('ingerirRadarSecopManana')
  })

  it('CLAVE: `db.doc(` aparece SOLO en las dos puertas', () => {
    const lineas = fuenteCF.split('\n')
      .filter(l => /db\.doc\(/.test(l) && !l.trim().startsWith('*') && !l.trim().startsWith('//'))
    expect(lineas).toHaveLength(2)
    expect(lineas[0]).toContain('const refLectura')
    expect(lineas[1]).toContain('const refEscritura')
    // Y la de escritura valida.
    expect(lineas[1]).toContain('validarRutaEscritura(ruta)')
  })

  it('no usa `db.collection(` ni rutas armadas a mano', () => {
    expect(/db\.collection\(/.test(fuenteCF)).toBe(false)
    // Nada de `${algo}/${algo}` construyendo rutas fuera de radarRutas.ts.
    const plantillasDeRuta = fuenteCF.match(/`\$\{[^`]*\}\/\$\{[^`]*\}`/g) ?? []
    expect(plantillasDeRuta).toEqual([])
  })

  it('CLAVE: toda ESCRITURA pasa por `refEscritura`', () => {
    const verbos = /\.(set|create|update|delete)\(/
    const sospechosas = fuenteCF.split('\n').filter(l => {
      const t = l.trim()
      if (t.startsWith('*') || t.startsWith('//')) return false
      if (!verbos.test(l)) return false
      // Escrituras a Firestore: las que se hacen sobre una referencia o un lote.
      if (!/refEscritura\(|refLectura\(|lote\.(set|create|update|delete)\(/.test(l)) return false
      return !l.includes('refEscritura(')
    })
    expect(sospechosas, 'escrituras sin refEscritura: ' + sospechosas.join(' | ')).toEqual([])
  })

  it('las únicas rutas literales de la CF son las declaradas', () => {
    // Cualquier literal con forma `coleccion/documento` tiene que ser una de
    // las declaradas (de escritura o de lectura). Así una ruta nueva no entra
    // disfrazada de constante local.
    const permitidas = new Set<string>([...RUTAS_ESCRITURA_RADAR, ...RUTAS_LECTURA_RADAR])
    const literales = (fuenteCF.match(/'[a-z_]+\/[A-Za-z_0-9.-]+'/g) ?? [])
      .map(x => x.slice(1, -1))
      .filter(x => !permitidas.has(x))
    expect(literales, 'rutas literales no declaradas: ' + literales.join(', ')).toEqual([])
  })

  it('importa el guardarraíl, no una copia de sus constantes', () => {
    expect(fuenteCF).toContain("from '../../src/utils/sigp/radarRutas'")
    expect(fuenteCF).toContain('validarRutaEscritura')
    expect(fuenteCF).toContain('rutaLicitacion')
    // Y no redefine las rutas por su cuenta.
    expect(/const\s+(REF_ESTADO|REF_VOCABULARIO|COL)\s*=/.test(fuenteCF)).toBe(false)
  })
})
