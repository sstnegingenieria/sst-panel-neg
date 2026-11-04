// DV del NIT (algoritmo DIAN) — 04-nov, caso IHS/Vertis: meses con el
// placeholder 900.123.456-8 del alta. Desde hoy un DV errado no se guarda.
import { describe, it, expect } from 'vitest'
import { dvNit, validarDvNit } from '../cliente'

describe('dvNit — pesos DIAN, NITs reales como oráculo', () => {
  it('NITs conocidos del sistema', () => {
    expect(dvNit('900.616.308')).toBe(2)   // IHS/Vertis (el real, confirmado 04-nov)
    expect(dvNit('900.975.870')).toBe(1)   // NEG Ingeniería
    expect(dvNit('800.153.993')).toBe(7)   // Claro
    expect(dvNit('890.900.608')).toBe(9)   // Grupo Éxito
    expect(dvNit('860.528.320')).toBe(1)   // Microlink
    expect(dvNit('899.999.063')).toBe(3)   // Universidad Nacional
  })
  it('el placeholder del alta TAMBIÉN era DV-válido — el DV atrapa typos, no inventos', () => {
    expect(dvNit('900.123.456')).toBe(8)
    expect(dvNit('000.000.000')).toBe(0)
  })
  it('no numérico o más largo que los pesos → null', () => {
    expect(dvNit('abc')).toBeNull()
    expect(dvNit('9'.repeat(16))).toBeNull()
    expect(dvNit('')).toBeNull()
  })
})

describe('validarDvNit — la forma del form (NNN.NNN.NNN-D)', () => {
  it('DV correcto pasa; errado no, y dice el correcto', () => {
    expect(validarDvNit('900.616.308-2').ok).toBe(true)
    const r = validarDvNit('900.616.308-5')
    expect(r.ok).toBe(false)
    expect(r.dv).toBe(2)
  })
  it('un typo en la base cambia el DV y se atrapa', () => {
    // 900.616.380 (transposición) tiene otro DV que 2 → no se guarda con -2
    expect(validarDvNit('900.616.380-2').ok).toBe(false)
  })
  it('sin forma de NIT con DV → no valida (ok=false, dv null)', () => {
    expect(validarDvNit('no-es-nit')).toEqual({ ok: false, dv: null })
  })
})
