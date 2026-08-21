import { describe, it, expect } from 'vitest'
import {
  calcularSemaforo, probabilidadSorteo, esTerritorioNeg,
  SEMAFORO_VERSION, DEPARTAMENTOS_NEG,
  type EntradaSemaforo,
} from '../semaforo'
import { MODALIDADES_LICITACION } from '../../../types/sigp/licitacion'

/** Mínima cuantía limpia en Bogotá — el caso base sobre el que se varía. */
const base = (extra?: Partial<EntradaSemaforo>): EntradaSemaforo => ({
  modalidad: 'minima_cuantia',
  tiene_sorteo: false,
  limitacion_mipyme: false,
  departamento: 'Distrito Capital de Bogotá',
  requiere_lectura: false,
  ...extra,
})

describe('calcularSemaforo — verde', () => {
  it('mínima cuantía sin ninguna bandera es VERDE sin motivos', () => {
    const r = calcularSemaforo(base())
    expect(r.semaforo).toBe('verde')
    expect(r.motivos).toEqual([])
    expect(r.version).toBe(SEMAFORO_VERSION)
  })

  it('sella la versión del criterio en cada cálculo', () => {
    expect(calcularSemaforo(base()).version).toBe('v1.0')
    expect(calcularSemaforo(base({ modalidad: 'otra' })).version).toBe('v1.0')
  })
})

describe('calcularSemaforo — rojo por modalidad', () => {
  it('menor cuantía es ROJO con MODALIDAD_SIN_HISTORIAL', () => {
    const r = calcularSemaforo(base({ modalidad: 'menor_cuantia' }))
    expect(r.semaforo).toBe('rojo')
    expect(r.motivos).toEqual(['MODALIDAD_SIN_HISTORIAL'])
  })

  it('TODA modalidad distinta de mínima cuantía es roja', () => {
    for (const m of MODALIDADES_LICITACION) {
      const r = calcularSemaforo(base({ modalidad: m }))
      if (m === 'minima_cuantia') {
        expect(r.semaforo).toBe('verde')
      } else {
        expect(r.semaforo).toBe('rojo')
        expect(r.motivos).toEqual(['MODALIDAD_SIN_HISTORIAL'])
      }
    }
  })

  it('el rojo CORTA SECO: no acumula motivos amarillos encima', () => {
    const r = calcularSemaforo(base({
      modalidad: 'licitacion_publica',
      tiene_sorteo: true,
      limitacion_mipyme: true,
      departamento: 'Antioquia',
      requiere_lectura: true,
    }))
    expect(r.semaforo).toBe('rojo')
    expect(r.motivos).toEqual(['MODALIDAD_SIN_HISTORIAL'])
  })
})

describe('calcularSemaforo — amarillo', () => {
  it('mínima cuantía con sorteo es AMARILLO por SORTEO', () => {
    const r = calcularSemaforo(base({ tiene_sorteo: true }))
    expect(r.semaforo).toBe('amarillo')
    expect(r.motivos).toEqual(['SORTEO'])
  })

  it('mínima cuantía que requiere lectura es AMARILLO por REQUIERE_LECTURA', () => {
    const r = calcularSemaforo(base({ requiere_lectura: true }))
    expect(r.semaforo).toBe('amarillo')
    expect(r.motivos).toEqual(['REQUIERE_LECTURA'])
  })

  it('acumula banderas en orden fijo: SORTEO, LIMITACION_MIPYME, REQUIERE_LECTURA', () => {
    const r = calcularSemaforo(base({
      tiene_sorteo: true,
      limitacion_mipyme: true,
      departamento: 'Antioquia',
      requiere_lectura: true,
    }))
    expect(r.semaforo).toBe('amarillo')
    expect(r.motivos).toEqual(['SORTEO', 'LIMITACION_MIPYME', 'REQUIERE_LECTURA'])
  })
})

describe('limitación MiPyme — solo pesa FUERA del territorio de NEG', () => {
  it('MiPyme en Bogotá NO aplica: sigue VERDE', () => {
    const r = calcularSemaforo(base({
      limitacion_mipyme: true,
      departamento: 'Distrito Capital de Bogotá',
    }))
    expect(r.semaforo).toBe('verde')
    expect(r.motivos).toEqual([])
  })

  it('MiPyme en Cundinamarca tampoco aplica', () => {
    const r = calcularSemaforo(base({
      limitacion_mipyme: true,
      departamento: 'Cundinamarca',
    }))
    expect(r.semaforo).toBe('verde')
  })

  it('MiPyme en Antioquia SÍ aplica: AMARILLO con LIMITACION_MIPYME', () => {
    const r = calcularSemaforo(base({
      limitacion_mipyme: true,
      departamento: 'Antioquia',
    }))
    expect(r.semaforo).toBe('amarillo')
    expect(r.motivos).toEqual(['LIMITACION_MIPYME'])
  })

  it('sin limitación MiPyme, el departamento es irrelevante', () => {
    expect(calcularSemaforo(base({ departamento: 'Antioquia' })).semaforo).toBe('verde')
    expect(calcularSemaforo(base({ departamento: 'Amazonas' })).semaforo).toBe('verde')
  })
})

describe('esTerritorioNeg — tolerante a cómo escriba SECOP', () => {
  it('reconoce los dos departamentos declarados', () => {
    for (const d of DEPARTAMENTOS_NEG) expect(esTerritorioNeg(d)).toBe(true)
  })

  it('ignora tildes, mayúsculas y espacios de sobra', () => {
    expect(esTerritorioNeg('  DISTRITO CAPITAL DE BOGOTA  ')).toBe(true)
    expect(esTerritorioNeg('distrito capital de bogotá')).toBe(true)
    expect(esTerritorioNeg('CUNDINAMARCA')).toBe(true)
  })

  it('no confunde otros departamentos', () => {
    expect(esTerritorioNeg('Antioquia')).toBe(false)
    expect(esTerritorioNeg('Boyacá')).toBe(false)
    expect(esTerritorioNeg('')).toBe(false)
  })
})

describe('REGRESIÓN — sin filtro por banda de presupuesto', () => {
  /**
   * La adjudicación real de 2025 por $6.011.508. Una banda de monto mínimo
   * la habría descartado y NEG habría perdido una de sus tres adjudicaciones.
   * Si alguien reintroduce el filtro de presupuesto, este test cae.
   */
  it('una mínima cuantía de $6.011.508 da VERDE', () => {
    const r = calcularSemaforo(base())
    expect(r.semaforo).toBe('verde')
    expect(r.motivos).toEqual([])
  })

  it('el presupuesto NO es una entrada del motor: agregarlo no cambia nada', () => {
    const limpio = calcularSemaforo(base())
    // Se cuela el campo a propósito: si algún día el motor lo consultara,
    // estos dos resultados dejarían de ser iguales.
    const conPresupuesto = calcularSemaforo({
      ...base(), presupuesto_oficial: 6_011_508,
    } as EntradaSemaforo)
    expect(conPresupuesto).toEqual(limpio)

    const conPresupuestoAlto = calcularSemaforo({
      ...base(), presupuesto_oficial: 900_000_000,
    } as EntradaSemaforo)
    expect(conPresupuestoAlto).toEqual(limpio)
  })

  it('ningún motivo del vocabulario alude a presupuesto', () => {
    const todos = [
      calcularSemaforo(base()),
      calcularSemaforo(base({ tiene_sorteo: true })),
      calcularSemaforo(base({ modalidad: 'seleccion_abreviada' })),
    ].flatMap(r => r.motivos)
    expect(todos.some(m => /PRESUPUESTO|CUANTIA|MONTO|VALOR/i.test(m))).toBe(false)
  })
})

describe('probabilidadSorteo', () => {
  it('22 manifestaciones dan ~0,4545', () => {
    expect(probabilidadSorteo(22)).toBeCloseTo(0.4545, 4)
  })

  it('con 10 o menos entran todos: techo en 1', () => {
    expect(probabilidadSorteo(5)).toBe(1)
    expect(probabilidadSorteo(10)).toBe(1)
    expect(probabilidadSorteo(1)).toBe(1)
  })

  it('null cuando no hay dato', () => {
    expect(probabilidadSorteo(null)).toBeNull()
  })

  it('null cuando el dato no tiene sentido (0 o negativo)', () => {
    expect(probabilidadSorteo(0)).toBeNull()
    expect(probabilidadSorteo(-3)).toBeNull()
  })

  it('es monótona decreciente: más manifestantes, menos probabilidad', () => {
    const p20 = probabilidadSorteo(20)!
    const p40 = probabilidadSorteo(40)!
    const p80 = probabilidadSorteo(80)!
    expect(p20).toBeGreaterThan(p40)
    expect(p40).toBeGreaterThan(p80)
  })
})

describe('pureza del motor', () => {
  it('mismas entradas, mismo resultado', () => {
    const e = base({ tiene_sorteo: true, requiere_lectura: true })
    expect(calcularSemaforo(e)).toEqual(calcularSemaforo(e))
  })

  it('no muta la entrada', () => {
    const e = base({ tiene_sorteo: true })
    const copia = { ...e }
    calcularSemaforo(e)
    expect(e).toEqual(copia)
  })
})
