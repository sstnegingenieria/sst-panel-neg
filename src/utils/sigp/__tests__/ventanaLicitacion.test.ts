import { describe, it, expect } from 'vitest'
import {
  HORAS_ARMADO, HORAS_UTILES_DIA_DEFAULT, horasUtilesValidas,
  BANDA_OFERTA_PCT, REFERENCIA_OFERTA,
  diasHabilesNecesarios, diasHabilesEntre, evaluarVentana, isoLocal,
  frasesSorteo, fueraDeBanda,
} from '../ventanaLicitacion'
import { MODALIDADES_LICITACION } from '../../../types/sigp/licitacion'
import { probabilidadSorteo } from '../semaforo'

describe('estimados de armado', () => {
  it('los dos datos del área: 4 h mínima, 6 h menor', () => {
    expect(HORAS_ARMADO.minima_cuantia).toBe(4)
    expect(HORAS_ARMADO.menor_cuantia).toBe(6)
  })

  it('las modalidades sin estimado propio usan el de menor como cota conservadora', () => {
    for (const m of MODALIDADES_LICITACION) {
      expect(HORAS_ARMADO[m], m).toBeGreaterThanOrEqual(HORAS_ARMADO.minima_cuantia)
    }
    expect(HORAS_ARMADO.licitacion_publica).toBe(6)
    expect(HORAS_ARMADO.otra).toBe(6)
  })

  it('el supuesto de horas útiles está NOMBRADO, no disperso', () => {
    expect(HORAS_UTILES_DIA_DEFAULT).toBe(4)
  })

  it('una mínima cabe en un día hábil; una menor necesita dos', () => {
    expect(diasHabilesNecesarios('minima_cuantia')).toBe(1)
    expect(diasHabilesNecesarios('menor_cuantia')).toBe(2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// El supuesto es CONFIGURABLE (1.5) — `configuracion/licitaciones
// .horas_utiles_dia`. Se ajusta sin desplegar; el default solo aplica cuando
// no hay dato o el dato no sirve.
// ═════════════════════════════════════════════════════════════════════════════

describe('horasUtilesValidas — el saneador de la configuración', () => {
  it('un número positivo pasa tal cual, entero o decimal', () => {
    expect(horasUtilesValidas(6)).toBe(6)
    expect(horasUtilesValidas(2.5)).toBe(2.5)
  })

  it('CLAVE: el cero cae al default — si no, TODA ventana sería insuficiente', () => {
    // 4 h / 0 = Infinity días necesarios. Un cero tecleado por error apagaría
    // el reloj entero y dejaría todo en rojo.
    expect(horasUtilesValidas(0)).toBe(HORAS_UTILES_DIA_DEFAULT)
    expect(diasHabilesNecesarios('minima_cuantia', 0)).toBe(1)
  })

  it('negativos, texto, null y NaN caen al default', () => {
    for (const v of [-3, '8', null, undefined, NaN, Infinity, {}, true]) {
      expect(horasUtilesValidas(v), `${String(v)}`).toBe(HORAS_UTILES_DIA_DEFAULT)
    }
  })

  it('sin argumento (documento sin el campo) vale el default', () => {
    expect(diasHabilesNecesarios('menor_cuantia')).toBe(2)
  })
})

describe('la configuración MUEVE el juicio de la ventana', () => {
  const LUN = '2026-08-24'

  it('con 8 h útiles una menor cabe en un día: deja de ser insuficiente', () => {
    // Con el default (4 h) esta misma ventana es insuficiente — lo fija el
    // test "CLAVE" de arriba.
    expect(diasHabilesNecesarios('menor_cuantia', 8)).toBe(1)
    expect(evaluarVentana('2026-08-25', 'menor_cuantia', LUN, 8).insuficiente).toBe(false)
  })

  it('con 2 h útiles la misma mínima ya NO cabe: el chip se vuelve alarmista', () => {
    expect(evaluarVentana('2026-08-25', 'minima_cuantia', LUN).insuficiente).toBe(false)
    expect(evaluarVentana('2026-08-25', 'minima_cuantia', LUN, 2).insuficiente).toBe(true)
  })

  it('las HORAS DE ARMADO no se tocan: lo configurable es el ritmo del día', () => {
    // La etiqueta sigue diciendo las horas de la modalidad — el dato del
    // área — aunque el reparto por día cambie.
    expect(evaluarVentana('2026-08-25', 'menor_cuantia', LUN, 8).horas_estimadas).toBe(6)
  })

  it('un valor basura en configuración NO rompe: se comporta como el default', () => {
    const basura = evaluarVentana('2026-08-25', 'menor_cuantia', LUN, 0)
    const porDefecto = evaluarVentana('2026-08-25', 'menor_cuantia', LUN)
    expect(basura).toEqual(porDefecto)
  })
})

describe('diasHabilesEntre', () => {
  it('cuenta de lunes a viernes, sin el día de inicio', () => {
    // 2026-08-24 es lunes; 2026-08-28 es viernes.
    expect(diasHabilesEntre('2026-08-24', '2026-08-28')).toBe(4)
  })

  it('salta el fin de semana', () => {
    // viernes 28-ago → lunes 31-ago: un solo día hábil.
    expect(diasHabilesEntre('2026-08-28', '2026-08-31')).toBe(1)
  })

  it('el mismo día son 0', () => {
    expect(diasHabilesEntre('2026-08-24', '2026-08-24')).toBe(0)
  })

  it('una fecha anterior son 0, no un negativo', () => {
    expect(diasHabilesEntre('2026-08-28', '2026-08-24')).toBe(0)
  })

  it('null con fechas inválidas — nunca lanza', () => {
    expect(diasHabilesEntre('', '2026-08-24')).toBeNull()
    expect(diasHabilesEntre('2026-13-45', '2026-08-24')).toBeNull()
    expect(diasHabilesEntre('2026-02-30', '2026-08-24')).toBeNull()
  })

  it('cruza meses y años sin perder la cuenta', () => {
    expect(diasHabilesEntre('2026-12-28', '2027-01-04')).toBe(5)
  })
})

describe('evaluarVentana', () => {
  const LUN = '2026-08-24'

  it('con holgura no marca insuficiente', () => {
    const v = evaluarVentana('2026-09-15', 'minima_cuantia', LUN)
    expect(v.insuficiente).toBe(false)
    expect(v.vencida).toBe(false)
    expect(v.dias_habiles).toBeGreaterThan(1)
  })

  it('CLAVE: una menor con un solo día hábil es insuficiente', () => {
    // Necesita 2 días hábiles; del lunes al martes hay 1.
    const v = evaluarVentana('2026-08-25', 'menor_cuantia', LUN)
    expect(v.necesarios).toBe(2)
    expect(v.dias_habiles).toBe(1)
    expect(v.insuficiente).toBe(true)
    expect(v.etiqueta).toContain('ventana insuficiente')
  })

  it('la misma ventana ALCANZA para una mínima', () => {
    const v = evaluarVentana('2026-08-25', 'minima_cuantia', LUN)
    expect(v.insuficiente).toBe(false)
  })

  it('cerrar hoy es insuficiente para cualquier modalidad', () => {
    for (const m of MODALIDADES_LICITACION) {
      expect(evaluarVentana(LUN, m, LUN).insuficiente, m).toBe(true)
    }
  })

  it('un cierre pasado se marca vencido', () => {
    const v = evaluarVentana('2026-08-01', 'minima_cuantia', LUN)
    expect(v.vencida).toBe(true)
    expect(v.insuficiente).toBe(true)
    expect(v.etiqueta).toBe('cierre vencido')
  })

  it('SIN fecha de cierre NO dice que alcanza: dice que no hay con qué juzgar', () => {
    const v = evaluarVentana(null, 'menor_cuantia', LUN)
    expect(v.insuficiente).toBe(false)
    expect(v.dias_habiles).toBeNull()
    expect(v.etiqueta).toBe('sin fecha de cierre')
  })

  it('una fecha basura degrada sin lanzar', () => {
    const v = evaluarVentana('no-es-fecha', 'minima_cuantia', LUN)
    expect(v.insuficiente).toBe(false)
    expect(v.etiqueta).toContain('inválida')
  })

  it('la etiqueta concuerda en singular y plural', () => {
    expect(evaluarVentana('2026-08-25', 'minima_cuantia', LUN).etiqueta).toContain('1 día hábil')
    expect(evaluarVentana('2026-08-26', 'minima_cuantia', LUN).etiqueta).toContain('2 días hábiles')
  })
})

describe('isoLocal', () => {
  it('usa la fecha LOCAL, no la UTC (Colombia es UTC−5)', () => {
    // 23:30 local del 24-ago sigue siendo 24-ago aunque en UTC ya sea 25.
    const d = new Date(2026, 7, 24, 23, 30)
    expect(isoLocal(d)).toBe('2026-08-24')
  })

  it('rellena mes y día a dos dígitos', () => {
    expect(isoLocal(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('frasesSorteo — el número se dice en palabras', () => {
  it('el caso del enunciado: 22 manifestaciones → 45 %', () => {
    expect(frasesSorteo(22, probabilidadSorteo(22)))
      .toBe('22 manifestaciones → 45 % de que te evalúen')
  })

  it('con 10 o menos entran todos: 100 %', () => {
    expect(frasesSorteo(5, probabilidadSorteo(5)))
      .toBe('5 manifestaciones → 100 % de que te evalúen')
  })

  it('singular con una sola manifestación', () => {
    expect(frasesSorteo(1, probabilidadSorteo(1))).toContain('1 manifestacion →')
  })

  it('CLAVE: sin dato lo DICE — no muestra 0 % ni se calla', () => {
    expect(frasesSorteo(null, null)).toBe('sorteo, sin dato de manifestaciones')
    expect(frasesSorteo(null, probabilidadSorteo(null))).toBe('sorteo, sin dato de manifestaciones')
  })

  it('un dato sin sentido (0 manifestaciones) también cae al mensaje honesto', () => {
    expect(frasesSorteo(0, probabilidadSorteo(0))).toBe('sorteo, sin dato de manifestaciones')
  })
})

describe('banda histórica de la oferta', () => {
  it('la referencia dice el rango del área', () => {
    expect(BANDA_OFERTA_PCT).toEqual({ min: 74, max: 80 })
    expect(REFERENCIA_OFERTA).toContain('74 %')
    expect(REFERENCIA_OFERTA).toContain('80 %')
  })

  it('dentro de la banda no marca nada', () => {
    for (const p of [74, 77, 80]) expect(fueraDeBanda(p), `${p}`).toBe(false)
  })

  it('fuera de la banda marca, por arriba y por abajo', () => {
    expect(fueraDeBanda(73.9)).toBe(true)
    expect(fueraDeBanda(85)).toBe(true)
  })

  it('sin dato NO marca — la ausencia no es una anomalía', () => {
    expect(fueraDeBanda(null)).toBe(false)
  })
})
