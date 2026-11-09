// Calendario laboral colombiano (08-nov) — oráculo doble: los festivos
// REALES de 2026 y 2027 (lista completa, por ley — si el cómputo se rompe,
// el test nombra el festivo exacto) y el pie del cronograma modelo del SENA
// ("domingos y festivos (2 y 16 de noviembre)… días hábiles efectivos en el
// plazo: 22" para el rango 19/10/2026 → 17/11/2026).
import { describe, it, expect } from 'vitest'
import {
  pascuaDe, festivosDe, festivosEnRango, festivosSetDe, tipoDia, JORNADA,
  diasHabilesEfectivos, sumarDias, diaSemanaDe, fechaIsoAUtc,
  nombrarFechas, fmtDiasHabiles, LETRA_DIA,
} from '../calendarioColombia'

describe('pascuaDe — cómputo de Meeus/Butcher', () => {
  it('años conocidos', () => {
    expect(pascuaDe(2024)).toBe('2024-03-31')
    expect(pascuaDe(2025)).toBe('2025-04-20')
    expect(pascuaDe(2026)).toBe('2026-04-05')
    expect(pascuaDe(2027)).toBe('2027-03-28')
  })
})

describe('festivosDe — Ley 51 de 1983, jamás una tabla por año', () => {
  it('2026 completo: los 18, trasladados donde corresponde', () => {
    expect(festivosDe(2026).map(f => f.fecha)).toEqual([
      '2026-01-01', // Año Nuevo
      '2026-01-12', // Reyes (6-ene martes → lunes)
      '2026-03-23', // San José (19-mar jueves → lunes)
      '2026-04-02', // Jueves Santo
      '2026-04-03', // Viernes Santo
      '2026-05-01', // Día del Trabajo
      '2026-05-18', // Ascensión (Pascua+39 → lunes)
      '2026-06-08', // Corpus Christi (Pascua+60 → lunes)
      '2026-06-15', // Sagrado Corazón (Pascua+68 → lunes)
      '2026-06-29', // San Pedro y San Pablo (cae lunes: NO se traslada)
      '2026-07-20', // Independencia
      '2026-08-07', // Batalla de Boyacá
      '2026-08-17', // Asunción (15-ago sábado → lunes)
      '2026-10-12', // Día de la Raza (cae lunes)
      '2026-11-02', // Todos los Santos (1-nov domingo → lunes)
      '2026-11-16', // Indep. de Cartagena (11-nov miércoles → lunes)
      '2026-12-08', // Inmaculada
      '2026-12-25', // Navidad
    ])
  })
  it('2027 completo (el año que un hardcode habría vencido en silencio)', () => {
    expect(festivosDe(2027).map(f => f.fecha)).toEqual([
      '2027-01-01', '2027-01-11', '2027-03-22', '2027-03-25', '2027-03-26',
      '2027-05-01', '2027-05-10', '2027-05-31', '2027-06-07', '2027-07-05',
      '2027-07-20', '2027-08-07', '2027-08-16', '2027-10-18', '2027-11-01',
      '2027-11-15', '2027-12-08', '2027-12-25',
    ])
  })
  it('la marca de traslado es honesta', () => {
    const f26 = new Map(festivosDe(2026).map(f => [f.fecha, f.trasladado]))
    expect(f26.get('2026-01-12')).toBe(true)   // Reyes corrido
    expect(f26.get('2026-06-29')).toBe(false)  // San Pedro cayó lunes
    expect(f26.get('2026-07-20')).toBe(false)  // fijo: jamás se traslada
    const f27 = new Map(festivosDe(2027).map(f => [f.fecha, f.trasladado]))
    expect(f27.get('2027-11-01')).toBe(false)  // Todos los Santos cayó lunes
  })
})

describe('tipo de día y jornada — la regla del pie del modelo', () => {
  it('festivo gana al sábado (día completo no laborable); domingo gana al festivo', () => {
    // 7-ago-2027 cae sábado y es fijo → festivo, no media jornada
    expect(tipoDia('2027-08-07', festivosSetDe('2027-08-01', 10))).toBe('festivo')
    // 20-jul-2025 cayó domingo → se rotula por el ritmo semanal
    expect(tipoDia('2025-07-20', festivosSetDe('2025-07-15', 10))).toBe('domingo')
  })
  it('semana corriente: L-V completos, sábado 0.5, domingo 0', () => {
    expect(JORNADA.habil).toBe(1)
    expect(JORNADA.sabado).toBe(0.5)
    // lunes 9-nov-2026 + 7 días = L a D sin festivos
    expect(diasHabilesEfectivos('2026-11-09', 7)).toBe(5.5)
  })
  it('EL CASO DEL MODELO SENA: 19/10/2026 + 30 días → 22 hábiles efectivos', () => {
    expect(sumarDias('2026-10-19', 29)).toBe('2026-11-17')      // "De 19/10/2026 a 17/11/2026"
    expect(diasHabilesEfectivos('2026-10-19', 30)).toBe(22)     // el pie declara 22
    expect(festivosEnRango('2026-10-19', 30).map(f => f.fecha))
      .toEqual(['2026-11-02', '2026-11-16'])                    // "(2 y 16 de noviembre)"
  })
  it('un rango que cruza de año junta los festivos de ambos', () => {
    const fechas = festivosEnRango('2026-12-20', 30).map(f => f.fecha)
    expect(fechas).toEqual(['2026-12-25', '2027-01-01', '2027-01-11'])
  })
})

describe('formato del pie', () => {
  it('nombrarFechas agrupa por mes como el modelo', () => {
    expect(nombrarFechas(['2026-11-02', '2026-11-16'])).toBe('2 y 16 de noviembre')
    expect(nombrarFechas(['2026-03-28'])).toBe('28 de marzo')
    expect(nombrarFechas(['2026-12-25', '2027-01-01', '2027-01-11'])).toBe('25 de diciembre y 1 y 11 de enero')
    expect(nombrarFechas([])).toBe('')
  })
  it('fmtDiasHabiles: entero limpio, medio día con coma es-CO', () => {
    expect(fmtDiasHabiles(22)).toBe('22')
    expect(fmtDiasHabiles(21.5)).toBe('21,5')
  })
})

describe('fechas UTC — inmunes a la zona del navegador', () => {
  it('valida de verdad (desbordes rechazados)', () => {
    expect(fechaIsoAUtc('2026-02-31')).toBeNull()
    expect(fechaIsoAUtc('no-fecha')).toBeNull()
    expect(fechaIsoAUtc('2026-10-19')).not.toBeNull()
  })
  it('suma y día de semana', () => {
    expect(sumarDias('2026-10-19', 0)).toBe('2026-10-19')
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(diaSemanaDe('2026-10-19')).toBe(1)   // lunes
    expect(LETRA_DIA[diaSemanaDe('2026-10-21')]).toBe('X') // miércoles
  })
})
