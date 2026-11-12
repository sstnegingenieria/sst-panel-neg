// El verificador de la marca (`scripts/sigp/verifica-marca-radar.mjs`) NO
// importa nada del árbol: es un script de Node sin dependencias, a propósito —
// lo corre una persona justo después de un acto, y cada pieza que haya que
// instalar antes es una forma de fallar.
//
// El precio son DOS LITERALES repetidos: la ruta del documento de estado y el
// tope de la guarda de ventana. Un literal repetido es una segunda fuente de
// verdad que envejece en silencio. Así que no se deja a la buena voluntad:
// este test LEE EL SCRIPT y compara sus literales contra las constantes reales.
//
// Y fija lo más importante: que el script SOLO LEE. Un verificador que un día
// pudiera escribir sería una llave de escritura entrando por la puerta de
// atrás, que es exactamente lo que este diseño decidió no tener.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { RUTA_ESTADO_RADAR } from '../radarRutas'
import { GUARDA_VOLUMEN } from '../radarCorrida'

const RUTA_SCRIPT = resolve(__dirname, '../../../../scripts/sigp/verifica-marca-radar.mjs')
const fuente = readFileSync(RUTA_SCRIPT, 'utf8')

/** Saca el valor de una constante de nivel superior del script. */
function constanteDelScript(nombre: string): string {
  const m = fuente.match(new RegExp(`^const ${nombre} = (.+)$`, 'm'))
  if (!m) throw new Error(`El script ya no declara \`const ${nombre}\` — revisa ${RUTA_SCRIPT}`)
  return m[1].trim()
}

describe('verifica-marca-radar.mjs — los literales copiados', () => {
  it('la ruta del documento es la MISMA que manda radarRutas.ts', () => {
    expect(constanteDelScript('RUTA_ESTADO')).toBe(`'${RUTA_ESTADO_RADAR}'`)
  })

  it('el tope de días de ventana es el MISMO que aplica la guarda', () => {
    expect(constanteDelScript('MAX_DIAS_VENTANA')).toBe(String(GUARDA_VOLUMEN.MAX_DIAS_VENTANA))
  })
})

describe('verifica-marca-radar.mjs — solo lectura, y en serio', () => {
  it('no hay ningún verbo que escriba en Firestore', () => {
    // La marca se escribe A MANO en la consola. Este script jamás escribe: si
    // un día lo hiciera, sería una llave de escritura entrando por la puerta
    // de atrás. `POST` NO está en esta lista a propósito — existe uno, y el
    // test de abajo fija que va contra Google y no contra Firestore.
    for (const verbo of ["method: 'PATCH'", "method: 'PUT'", "method: 'DELETE'", 'updateMask', ':commit']) {
      expect(fuente, verbo).not.toContain(verbo)
    }
  })

  it('el único POST es el del token, contra Google y no contra Firestore', () => {
    const posts = [...fuente.matchAll(/method: '(\w+)'/g)].map(m => m[1])
    expect(posts).toEqual(['POST'])
    expect(fuente).toContain("fetch('https://oauth2.googleapis.com/token'")
  })

  it('pide el TIPO de cada campo, no solo el valor', () => {
    // Es la verificación que justifica el script: un Timestamp en vez de una
    // cadena deja al radar callado, y callado es indistinguible de "el acto
    // nunca se hizo".
    expect(fuente).toContain("!('stringValue' in vMarca)")
    expect(fuente).toContain("!('integerValue' in vSolape)")
  })

  it('sale con código distinto de cero cuando algo está mal', () => {
    expect(fuente).toContain('process.exit(1)')
  })
})
