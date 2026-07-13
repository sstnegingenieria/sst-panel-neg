import { describe, it, expect } from 'vitest'
import { evaluarExpresion, numeroATexto } from '../expresion'

const valor = (t: string): number => {
  const r = evaluarExpresion(t)
  if (r === null || 'error' in r) throw new Error(`esperaba valor para "${t}", obtuve ${JSON.stringify(r)}`)
  return r.valor
}
const esError = (t: string): boolean => {
  const r = evaluarExpresion(t)
  return r !== null && 'error' in r
}

describe('evaluarExpresion — casos válidos', () => {
  it('operaciones y paréntesis', () => {
    expect(valor('20.23*5')).toBeCloseTo(101.15)
    expect(valor('3,50*2,40')).toBeCloseTo(8.4)
    expect(valor('(15+3)*2')).toBe(36)
    expect(valor('1/54')).toBeCloseTo(0.018518518, 8)
    expect(valor('10-4-3')).toBe(3)
    expect(valor('-5+2')).toBe(-3)          // menos unario
  })
  it('números simples y decimales con coma o punto', () => {
    expect(valor('320')).toBe(320)
    expect(valor('3,5')).toBe(3.5)
    expect(valor('0.0909')).toBe(0.0909)
  })
  it('precisión COMPLETA (el recorte a 2 decimales es solo de render)', () => {
    expect(valor('1/3')).toBe(1 / 3)
    expect(valor('20.2345')).toBe(20.2345)
  })
  it('vacío → null (sin cambio, no fuerza 0)', () => {
    expect(evaluarExpresion('')).toBeNull()
    expect(evaluarExpresion('   ')).toBeNull()
  })
})

describe('evaluarExpresion — casos inválidos', () => {
  it('letras, funciones y símbolos raros', () => {
    expect(esError('abc')).toBe(true)
    expect(esError('sqrt(4)')).toBe(true)
    expect(esError('2^3')).toBe(true)
    expect(esError('50%')).toBe(true)
    expect(esError('1e400')).toBe(true)     // notación científica: letra → whitelist
  })
  it('sintaxis rota y no-finito', () => {
    expect(esError('3*')).toBe(true)
    expect(esError('(2+3')).toBe(true)
    expect(esError('1/0')).toBe(true)       // Infinity → error
    expect(esError('0/0')).toBe(true)       // NaN → error
  })
  it('separador de miles no se admite dentro de la expresión', () => {
    expect(esError('1.234,56')).toBe(true)
  })
})

describe('evaluarExpresion — no inyectable', () => {
  it.each([
    'constructor', 'this', 'window.alert(1)', 'process.exit()',
    '2;3', '2`3`', 'import("x")', '__proto__', 'a=1', 'x',
    'f(2)', '[1,2]', '{a:1}', '"texto"',
  ])('rechaza %s', (t) => {
    expect(esError(t)).toBe(true)
  })
  it('paréntesis adyacentes son multiplicación implícita (aritmética pura, no una llamada)', () => {
    expect(valor('((1))(2)')).toBe(2)
    expect(valor('2(3+1)')).toBe(8)
  })
})

describe('numeroATexto', () => {
  it('coma decimal, sin miles, precisión completa; 0/undefined → vacío', () => {
    expect(numeroATexto(16031.954)).toBe('16031,954')
    expect(numeroATexto(320)).toBe('320')
    expect(numeroATexto(0)).toBe('')
    expect(numeroATexto(undefined)).toBe('')
  })
})
