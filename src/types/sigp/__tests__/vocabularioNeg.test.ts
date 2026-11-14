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
  esTerminoFuerte,
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

describe('v1.1 — el término que BLOQUEA', () => {
  it('SOFTWARE es el único: NEG no construye software', () => {
    // No se derivó de los datos — lo confirmó la gerencia dos veces. Es la
    // única forma honesta de sostener un bloqueo: el dato dice qué aparece,
    // no qué es imposible.
    expect([...NEGATIVOS_NEG]).toEqual(['SOFTWARE'])
  })

  it('un objeto con SOFTWARE y sin término fuerte no entra', () => {
    const r = coincideVocabulario(
      'MANTENIMIENTO PREVENTIVO Y CORRECTIVO DE HARDWARE Y SOFTWARE CON LA ADECUACION DE EQUIPOS')
    expect(r.coincide).toBe(false)
    expect(r.bloqueado_por).toBe('SOFTWARE')
    // ADECUACION es una palabra suelta: no le gana al bloqueo.
    expect(r.terminos).toContain('ADECUACION')
    expect(r.negativo_ignorado).toBeNull()
  })

  it('CLAVE: los términos hallados NO se borran al bloquear', () => {
    // El documento tiene que poder decir «coincidió en esto, y aun así no
    // entró por aquello». Vaciar la lista ahorraría una línea y borraría la
    // única evidencia de dónde se equivocó el léxico.
    const r = coincideVocabulario(
      'MANTENIMIENTO PREVENTIVO Y CORRECTIVO DE HARDWARE Y SOFTWARE CON LA ADECUACION DE EQUIPOS')
    expect(r.terminos.length).toBeGreaterThan(0)
  })

  it('sin negativo presente, los dos campos son null y no estorban', () => {
    const r = coincideVocabulario('MANTENIMIENTO CUBIERTAS PARA LA ESCUELA')
    expect(r.coincide).toBe(true)
    expect(r.bloqueado_por).toBeNull()
    expect(r.negativo_ignorado).toBeNull()
  })
})

describe('la regla: un negativo pierde contra un término FUERTE', () => {
  it('un término fuerte es de varias palabras', () => {
    expect(esTerminoFuerte('INFRAESTRUCTURA FISICA')).toBe(true)
    expect(esTerminoFuerte('ADECUACION')).toBe(false)
  })

  it('con una FRASE del oficio, el bloqueo no se aplica', () => {
    const r = coincideVocabulario(
      'MANTENIMIENTO DE LA INFRAESTRUCTURA FISICA Y DEL SOFTWARE DE LA SEDE')
    expect(r.coincide).toBe(true)
    expect(r.bloqueado_por).toBeNull()
    // Y queda REGISTRADO que el bloqueo estuvo ahí y perdió. Es el único
    // rastro: lo que un negativo tapa no llega a ninguna pantalla.
    expect(r.negativo_ignorado).toBe('SOFTWARE')
  })

  it('los dos campos JAMÁS van juntos: o bloqueó, o no bloqueó', () => {
    const casos = [
      'MANTENIMIENTO DE LA INFRAESTRUCTURA FISICA Y DEL SOFTWARE',
      'ADECUACION DE EQUIPOS DE SOFTWARE',
      'MANTENIMIENTO CUBIERTAS DEL COLISEO',
      'COMPRA DE SOFTWARE CONTABLE',
    ]
    for (const o of casos) {
      const r = coincideVocabulario(o)
      expect(r.bloqueado_por !== null && r.negativo_ignorado !== null, o).toBe(false)
    }
  })

  it('un negativo sobre un objeto sin NINGÚN término no inventa nada', () => {
    const r = coincideVocabulario('COMPRA DE LICENCIAS DE SOFTWARE CONTABLE')
    expect(r.coincide).toBe(false)
    expect(r.terminos).toEqual([])
    // No bloqueó nada: no había nada que bloquear. Y no se ignoró.
    expect(r.bloqueado_por).toBe('SOFTWARE')
    expect(r.negativo_ignorado).toBeNull()
  })
})

describe('DOTACION: estuvo un día y salió', () => {
  it('NO es un negativo', () => {
    // Midió 3 de 3 ruido sobre la cola de 128 — y esa medición de PRECISIÓN
    // no podía ver el daño. Al medir RECALL contra los 372 del registro
    // apareció un contrato real de NEG vetado por esta palabra, y la gerencia
    // confirmó otro: dotar mobiliario dentro de un contrato de INVIAS.
    expect(NEGATIVOS_NEG).not.toContain('DOTACION')
  })

  it('el caso REAL del registro vuelve a entrar', () => {
    const r = coincideVocabulario(
      'OBRAS DE ADECUACIÓN, MANTENIMIENTO Y DOTACION DE MOBILIARIO DE LA '
      + 'INFRAESTRUCTURA FÍSICA DE LOS PISOS 2, 3 Y 4')
    expect(r.coincide).toBe(true)
    expect(r.terminos).toContain('INFRAESTRUCTURA FISICA')
  })

  it('y DOTACION MOBILIARIO tampoco entra como POSITIVO', () => {
    // Medido con el método de la derivación: lift 28,56 — el bigrama SÍ
    // discrimina (la palabra suelta da 0,17, un salto de 168 veces). Pero
    // DF_pos = 1: UN documento. El corte exige 8. Agregarlo sobre una sola
    // observación sería el mismo error que bloquear sobre tres, al revés.
    // Y es innecesario: el caso ya entra por los términos de obra.
    expect(TERMINOS_NEG).not.toContain('DOTACION MOBILIARIO')
  })

  it('los otros negativos evaluados tampoco están', () => {
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
