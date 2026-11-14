/**
 * El léxico v1.1: los términos que no discriminaban, y los que BLOQUEAN.
 *
 * El defecto que vigila este archivo no es un error de código: es un léxico
 * que trae mucho y acierta poco. Un término como `REPARACION` entra por
 * «reparación de equipos de laboratorio» y pone en la cola de Karen ocho
 * procesos que no son trabajo de NEG. Nadie rompe nada — simplemente la cola
 * deja de ser creíble, y una cola que no se cree no se lee.
 *
 * Todo lo que se afirma acá se midió sobre los 128 procesos reales que el
 * radar había traído al 13-nov-2026. Los números viven en el JSON del léxico,
 * en `metricas.precision_medida_13nov2026`.
 */
import { describe, it, expect } from 'vitest'
import {
  TERMINOS_NEG,
  NEGATIVOS_NEG,
  coincideVocabulario,
  negativosVigentes,
} from '../vocabularioNeg'

// ── v1.1: los cinco sin poder discriminante, y los negativos ────────────────

describe('v1.1 — los términos que acertaban cero', () => {
  it('los cinco salieron del léxico', () => {
    // Medidos sobre los 128 de la cola, contando solo los casos en que cada
    // uno fue el ÚNICO responsable de la entrada. Los cinco: cero aciertos.
    for (const t of ['FISICA', 'FISICAS', 'REPARACION', 'REALIZAR ACTIVIDADES', 'CIVILES']) {
      expect(TERMINOS_NEG, t).not.toContain(t)
    }
  })

  it('pero los BIGRAMAS que los contienen se conservan', () => {
    // El ruido estaba en la palabra suelta, no en la frase. `REPARACION` entra
    // por «reparación de equipos»; `REPARACIONES LOCATIVAS` no.
    for (const t of ['INFRAESTRUCTURA FISICA', 'REPARACIONES LOCATIVAS']) {
      expect(TERMINOS_NEG, t).toContain(t)
    }
  })

  it('los casos REALES que ya no entran', () => {
    // Textos verbatim de la cola del 13-nov.
    const fuera = [
      'PRESTAR LOS SERVICIOS PARA REALIZAR LA TOMA FÍSICA DE INVENTARIOS DE LOS BIENES MUEBLES',
      'PRESTACIÓN DE SERVICIOS PARA LA CALIBRACIÓN Y REPARACION DE EQUIPOS DE LABORATORIO',
      'PRESTACIÓN DEL SERVICIO DE CAPACITACIÓN EN FUNDAMENTOS DE INTELIGENCIA ARTIFICIAL IA',
    ]
    for (const o of fuera) expect(coincideVocabulario(o).coincide, o.slice(0, 40)).toBe(false)
  })

  it('y los que SÍ son trabajo de NEG siguen entrando', () => {
    const dentro = [
      'MEJORAMIENTO Y MANTENIMIENTO DEL COLISEO FRAY IGNACIO MARIÑO DEL MUNICIPIO DE NEMOCÓN',
      'ADECUACION Y REMODELACION DE LAS AREAS DE SERVICIOS BAÑOS HOMBRES MUJERES',
      'MANTENIMIENTO CUBIERTAS PARA LA ESCUELA DE COMUNICACIONES MILITARES',
    ]
    for (const o of dentro) expect(coincideVocabulario(o).coincide, o.slice(0, 40)).toBe(true)
  })
})

describe('v1.1 — los términos que BLOQUEAN', () => {
  it('un objeto con SOFTWARE no entra aunque coincida otro término', () => {
    // El ejemplo de Giovanny. Tiene MANTENIMIENTO INTEGRAL, pero NEG no hace
    // software.
    const o = 'BRINDAR SOPORTE, MANTENIMIENTO INTEGRAL Y REALIZAR ACTIVIDADES DE DESARROLLO EN EL SOFTWARE SIAF'
    const r = coincideVocabulario(o)
    expect(r.coincide).toBe(false)
    expect(r.bloqueado_por).toBe('SOFTWARE')
  })

  it('CLAVE: los términos hallados NO se borran al bloquear', () => {
    // El documento tiene que poder decir «coincidió en esto, y aun así no
    // entró por aquello». Vaciar la lista ahorraría una línea y borraría la
    // única evidencia de dónde se equivocó el léxico.
    const r = coincideVocabulario(
      'MANTENIMIENTO PREVENTIVO Y CORRECTIVO DE HARDWARE Y SOFTWARE CON LA ADECUACION DE EQUIPOS')
    expect(r.coincide).toBe(false)
    expect(r.bloqueado_por).toBe('SOFTWARE')
    expect(r.terminos.length).toBeGreaterThan(0)
  })

  it('sin negativo presente, bloqueado_por es null y no estorba', () => {
    const r = coincideVocabulario('MANTENIMIENTO CUBIERTAS PARA LA ESCUELA')
    expect(r.coincide).toBe(true)
    expect(r.bloqueado_por).toBeNull()
  })

  it('los negativos descartados NO están: se midieron y hacían daño', () => {
    // DESARROLLO vive en «actividades a desarrollar»; MOBILIARIO aparece en
    // «reparaciones locativas de los predios y del mobiliario distrital».
    for (const n of ['DESARROLLO', 'MOBILIARIO', 'ALIMENTOS', 'LICENCIA']) {
      expect(NEGATIVOS_NEG, n).not.toContain(n)
    }
  })

  it('y una adecuación locativa con mobiliario SIGUE entrando', () => {
    const r = coincideVocabulario(
      'Contratar el mantenimiento integral y/o reparaciones locativas de los predios y del mobiliario distrital')
    expect(r.coincide).toBe(true)
  })
})

describe('negativosVigentes', () => {
  it('una lista VACÍA es una respuesta, no un hueco', () => {
    // Con el criterio de `terminosVigentes` (que cae al empaquetado si está
    // vacío), una versión que quiso quedarse sin negativos los recuperaría
    // sin que nadie lo pidiera.
    const reg = {
      version_actual: 'vX',
      versiones: { vX: { terminos: ['ALGO'], negativos: [] } },
    } as never
    expect(negativosVigentes(reg)).toEqual([])
  })

  it('sin el campo, cae a los empaquetados — v1.0 no los tenía', () => {
    const reg = { version_actual: 'vX', versiones: { vX: { terminos: ['ALGO'] } } } as never
    expect(negativosVigentes(reg)).toEqual(NEGATIVOS_NEG)
  })
})
