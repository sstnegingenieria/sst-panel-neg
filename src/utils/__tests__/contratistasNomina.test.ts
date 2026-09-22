import { describe, it, expect } from 'vitest'
import { Timestamp, deleteField } from 'firebase/firestore'
import {
  normalizarCedula, parsearPegado, clasificarFilas,
  patchCargarNomina, patchRetiro,
} from '../contratistasNomina'
import type { FilaParseada, NominaContratista } from '../contratistasNomina'

const ts = Timestamp.fromMillis(1758585600000)

describe('normalizarCedula — solo cédulas numéricas plausibles', () => {
  it('quita puntos, espacios y guiones', () => {
    expect(normalizarCedula('52.123.456')).toBe('52123456')
    expect(normalizarCedula(' 1 020 345 678 ')).toBe('1020345678')
    expect(normalizarCedula('79-456-123')).toBe('79456123')
  })

  it('umbral 6–12 dígitos (supuesto nombrado del diseño)', () => {
    expect(normalizarCedula('123456')).toBe('123456')
    expect(normalizarCedula('123456789012')).toBe('123456789012')
    expect(normalizarCedula('12345')).toBeNull()
    expect(normalizarCedula('1234567890123')).toBeNull()
  })

  it('⚠ SALVEDAD EXTRANJEROS (pregunta abierta): un pasaporte "AB123456" JAMÁS se normaliza a los dígitos sueltos', () => {
    expect(normalizarCedula('AB123456')).toBeNull()
    expect(normalizarCedula('PPT-1234567')).toBeNull()
  })

  it('vacío / null → null', () => {
    expect(normalizarCedula('')).toBeNull()
    expect(normalizarCedula(null)).toBeNull()
    expect(normalizarCedula(undefined)).toBeNull()
  })
})

describe('parsearPegado — TSV de Excel, CSV y columnas en cualquier orden', () => {
  it('TSV nombre→cédula y cédula→nombre dan lo mismo', () => {
    const a = parsearPegado('Juan Pérez Gómez\t1.020.345.678')
    const b = parsearPegado('1.020.345.678\tJuan Pérez Gómez')
    for (const f of [a[0], b[0]]) {
      expect(f.estado).toBe('nueva')
      expect(f.nombre).toBe('Juan Pérez Gómez')
      expect(f.cedula_norm).toBe('1020345678')
      expect(f.cedula_original).toBe('1.020.345.678')
      expect(f.incluir).toBe(true)
    }
  })

  it('sin delimitador: tokens por espacios, la cédula es el token numérico', () => {
    const [f] = parsearPegado('María Ruiz 52123456')
    expect(f.estado).toBe('nueva')
    expect(f.nombre).toBe('María Ruiz')
    expect(f.cedula_norm).toBe('52123456')
  })

  it('encabezados caen solos (sin cédula válida) y las vacías se saltan', () => {
    const filas = parsearPegado('NOMBRE\tCÉDULA\n\nAna López\t900123456\n')
    expect(filas).toHaveLength(2)
    expect(filas[0].estado).toBe('sin_cedula')
    expect(filas[0].incluir).toBe(false)
    expect(filas[1].estado).toBe('nueva')
  })

  it('DOS candidatos a cédula en la fila → ambigua, sin_cedula (honesto, no adivina)', () => {
    const [f] = parsearPegado('Pedro\t123456\t7891011')
    expect(f.estado).toBe('sin_cedula')
  })

  it('cédula sin nombre → sin_nombre, excluida', () => {
    const [f] = parsearPegado('52123456')
    expect(f.estado).toBe('sin_nombre')
    expect(f.incluir).toBe(false)
  })

  it('pasaporte con letras en la columna de cédula → sin_cedula (salvedad extranjeros)', () => {
    const [f] = parsearPegado('John Smith\tAB123456')
    expect(f.estado).toBe('sin_cedula')
  })
})

const nominaCon = (entries: Record<string, { retirado?: true }>): NominaContratista => ({
  trabajadores: Object.fromEntries(Object.entries(entries).map(([ced, e]) => [ced, {
    nombre: 'X', cedula_original: ced, cargado_por: 'u', cargado_por_nombre: '', fecha_carga: ts, ...e,
  }])),
})

describe('clasificarFilas — contra la nómina propia y las de los demás', () => {
  const filas = () => parsearPegado('Ana\t111111\nBeto\t222222\nCarla\t333333\nAna Bis\t111111')

  it('duplicada en el pegado → excluida; ya_en_nomina → excluida; retirado → reincorporar incluida', () => {
    const r = clasificarFilas(filas(), nominaCon({ '222222': {}, '333333': { retirado: true } }), {})
    expect(r[0].estado).toBe('nueva')
    expect(r[1].estado).toBe('ya_en_nomina')
    expect(r[1].incluir).toBe(false)
    expect(r[2].estado).toBe('reincorporar')
    expect(r[2].incluir).toBe(true)
    expect(r[3].estado).toBe('duplicada_pegado')
    expect(r[3].incluir).toBe(false)
  })

  it('guard "en OTRA nómina" (viva) → advertida y excluida; la retirada del otro NO cuenta', () => {
    const r = clasificarFilas(filas().slice(0, 2), null, { otro: new Set(['111111']) })
    expect(r[0].estado).toBe('en_otra_nomina')
    expect(r[0].incluir).toBe(false)
    expect(r[1].estado).toBe('nueva')
  })
})

describe('builders de writes — la UI no improvisa', () => {
  it('patchCargarNomina: solo incluidas, nodo COMPLETO por dot-path (reincorporar pierde `retirado` por reemplazo)', () => {
    const filas: FilaParseada[] = clasificarFilas(
      parsearPegado('Ana\t111111\nBeto\t222222'),
      nominaCon({ '222222': { retirado: true } }), {})
    const patch = patchCargarNomina(filas, { uid: 'gi-uid', nombre: 'Ingrid' }, ts)!
    expect(Object.keys(patch).sort()).toEqual(['fecha_actualizacion', 'trabajadores.111111', 'trabajadores.222222'])
    const beto = patch['trabajadores.222222'] as Record<string, unknown>
    expect(beto.nombre).toBe('Beto')
    expect(beto.cargado_por).toBe('gi-uid')
    expect('retirado' in beto).toBe(false)
  })

  it('sin filas incluidas → null (nada que escribir)', () => {
    const soloAdvertidas = clasificarFilas(parsearPegado('NOMBRE\tCEDULA'), null, {})
    expect(patchCargarNomina(soloAdvertidas, { uid: 'u' }, ts)).toBeNull()
  })

  it('patchRetiro: retirar marca true; reincorporar borra el campo (deleteField)', () => {
    const r = patchRetiro('111111', true, ts)
    expect(r['trabajadores.111111.retirado']).toBe(true)
    const v = patchRetiro('111111', false, ts)
    expect(v['trabajadores.111111.retirado']).toEqual(deleteField())
  })
})
