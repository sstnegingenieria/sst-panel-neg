import { describe, it, expect } from 'vitest'
import type { PDFFont } from 'pdf-lib'
import { partir, partirMax } from '../cotizacionPdf'

// Fuente determinística: ancho = caracteres × tamaño (1 char = `size` puntos).
// Con size 10 y maxAncho 100 caben exactamente 10 caracteres por línea.
const fuente = { widthOfTextAtSize: (t: string, s: number) => t.length * s } as PDFFont

describe('partir — word-wrap por palabra (contrato base de partirMax)', () => {
  it('parte por palabra sin cortar palabras que caben', () => {
    expect(partir('EIC ESTRUCTURAS DE COLOMBIA', fuente, 10, 100))
      .toEqual(['EIC', 'ESTRUCTURA', 'S DE', 'COLOMBIA'])
  })

  it('texto vacío devuelve una línea vacía', () => {
    expect(partir('', fuente, 10, 100)).toEqual([''])
  })
})

describe('partirMax — tope de líneas con "…" defensivo (tarjeta CLIENTE del PDF)', () => {
  it('sin desborde devuelve las líneas tal cual, sin "…" (trazado idéntico al histórico)', () => {
    expect(partirMax('IHS COL', fuente, 10, 100, 2)).toEqual(['IHS COL'])
    expect(partirMax('UNO DOS TRES', fuente, 10, 100, 2)).toEqual(['UNO DOS', 'TRES'])
  })

  it('con desborde recorta al tope exacto de líneas', () => {
    const lineas = partirMax('AAA BBB CCC DDD EEE FFF GGG HHH', fuente, 10, 100, 2)
    expect(lineas).toHaveLength(2)
  })

  it('la última línea termina en "…" y cabe en el ancho', () => {
    const lineas = partirMax('AAA BBB CCC DDD EEE FFF GGG HHH', fuente, 10, 100, 2)
    const ultima = lineas[1]
    expect(ultima.endsWith('…')).toBe(true)
    expect(fuente.widthOfTextAtSize(ultima, 10)).toBeLessThanOrEqual(100)
  })

  it('recorta caracteres de la última línea si el "…" no cabe de entrada', () => {
    // 'ABCDEFGHIJ' llena la línea exacta (10 chars) → agregar "…" obliga a recortar
    const lineas = partirMax('ABCDEFGHIJ KLMNOPQRST UVWXYZ', fuente, 10, 100, 1)
    expect(lineas).toEqual(['ABCDEFGHI…'])
    expect(fuente.widthOfTextAtSize(lineas[0], 10)).toBeLessThanOrEqual(100)
  })

  it('caso real: nombre largo de cliente a 2 líneas máximo', () => {
    // ~34 chars/línea a 9.5pt en la tarjeta — acá lo modelamos con la mock
    const nombre = 'CONSORCIO INTERVENTORIA Y CONSTRUCCIONES ELECTRICAS DEL ORIENTE'
    const lineas = partirMax(nombre, fuente, 10, 200, 2)
    expect(lineas).toHaveLength(2)
    expect(lineas[1].endsWith('…')).toBe(true)
  })
})
