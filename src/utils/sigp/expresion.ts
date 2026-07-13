// src/utils/sigp/expresion.ts
//
// F1.5 punto 1 — evaluador de expresiones matemáticas para campos numéricos
// (cantidades, rendimientos, factores, consumos, costos): "20.23*5", "1/54",
// "(15+3)*2".
//
// Implementado con PARSER PROPIO recursivo-descendente (sin dependencias:
// mathjs se descartó por peso de bundle, ~+93KB gzip). SEGURIDAD — NO se usa
// eval, en dos capas:
//  1. Whitelist estricta de caracteres (solo dígitos, espacios, . , ( ) + - * /).
//  2. La gramática solo conoce números, + - * / (con menos unario), paréntesis
//     y multiplicación implícita por adyacencia ("2(3+1)"). No existen
//     variables, funciones ni constantes: nada que invocar ni inyectar.
//
// El resultado conserva PRECISIÓN COMPLETA (el recorte a 2 decimales es del
// punto 4 y ocurre solo al renderizar).

/** Solo dígitos, espacios, separador decimal (coma o punto), paréntesis y + - * /. */
const RE_WHITELIST = /^[\d\s.,()+\-*/]+$/

export type ResultadoExpresion = { valor: number } | { error: string }

/**
 * Gramática (precedencia estándar, asociatividad izquierda):
 *   expr    := term (('+'|'-') term)*
 *   term    := unary (('*'|'/') unary | ⟨adyacencia⟩ unary)*   — "2(3+1)" ≡ 2*(3+1)
 *   unary   := '-' unary | primary
 *   primary := número | '(' expr ')'
 * Números: dígitos con punto decimal opcional (sin punto inicial, sin miles).
 * Lanza en cualquier sintaxis inválida o texto sobrante.
 */
function parsear(src: string): number {
  let i = 0
  const saltar = () => { while (i < src.length && (src[i] === ' ' || src[i] === '\t')) i++ }
  const mirar = (): string => { saltar(); return src[i] ?? '' }

  const primary = (): number => {
    const c = mirar()
    if (c === '(') {
      i++
      const v = expr()
      if (mirar() !== ')') throw new Error('falta )')
      i++
      return v
    }
    const m = /^\d+(\.\d+)?/.exec(src.slice(i))
    if (!m) throw new Error('se esperaba un número')
    i += m[0].length
    return Number(m[0])
  }

  const unary = (): number => {
    if (mirar() === '-') { i++; return -unary() }
    return primary()
  }

  const term = (): number => {
    let v = unary()
    for (;;) {
      const c = mirar()
      if (c === '*') { i++; v *= unary() }
      else if (c === '/') { i++; v /= unary() }
      else if (c === '(' || (c >= '0' && c <= '9')) v *= unary()   // multiplicación implícita
      else break
    }
    return v
  }

  const expr = (): number => {
    let v = term()
    for (;;) {
      const c = mirar()
      if (c === '+') { i++; v += term() }
      else if (c === '-') { i++; v -= term() }
      else break
    }
    return v
  }

  const v = expr()
  saltar()
  if (i < src.length) throw new Error('texto sobrante')   // p. ej. el ".56" de "1.234.56"
  return v
}

/**
 * Evalúa una expresión aritmética acotada.
 * - `null` si el texto está vacío (el caller NO debe cambiar el valor).
 * - `{ valor }` con precisión completa si es válida.
 * - `{ error }` si es inválida, insegura o no finita (p. ej. división por cero).
 *
 * Decimales: acepta coma Y punto ("3,50*2,40" ≡ "3.50*2.40"). NO se admite
 * separador de miles dentro de la expresión ("1.234,56" es inválida).
 */
export function evaluarExpresion(texto: string): ResultadoExpresion | null {
  const t = texto.trim()
  if (!t) return null

  if (!RE_WHITELIST.test(t)) return { error: 'Solo números, ( ) y + - * /' }

  // Coma → punto (decimal). Un "1.234,56" queda "1.234.56" y el parser lo rechaza.
  const normalizado = t.replace(/,/g, '.')

  let v: number
  try {
    v = parsear(normalizado)
  } catch {
    return { error: 'Expresión inválida' }
  }
  if (!Number.isFinite(v)) {
    return { error: 'Resultado no válido (¿división por cero?)' }
  }
  return { valor: v }
}

/** Texto de edición desde un número (coma decimal, sin miles, precisión completa). */
export function numeroATexto(v: number | undefined): string {
  return v ? String(v).replace('.', ',') : ''
}
