/**
 * Regresión de la SEMILLA del léxico de NEG (B.1b).
 *
 * Mismo defecto que vigila `semillaCriterio.test.ts`, en el documento nuevo:
 * el léxico vive en un JSON, lo consumen DOS constructores —el TS del panel y
 * el CJS del script de siembra, porque `functions/` no compila TypeScript— y
 * un campo que se agregue al JSON puede quedarse fuera de uno de los dos SIN
 * que nada avise. El documento se sembraría incompleto y, como la siembra
 * aborta si ya existe, el hueco quedaría.
 *
 * Este test mira a los tres: JSON, constructor TS y constructor del script.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import {
  construirSemillaVocabularioNeg, TERMINOS_NEG, VOCABULARIO_NEG_VERSION,
  CAMPOS_JSON_VOCABULARIO,
} from '../vocabularioNeg'

const require_ = createRequire(import.meta.url)
const RAIZ = resolve(__dirname, '../../../..')

// El script se importa SIN efectos: `main()` solo corre si se ejecuta
// directamente, y `initializeApp` vive dentro de `main`.
const script = require_(resolve(RAIZ, 'functions/scripts/sembrar-vocabulario-neg.js'))
const JSON_SEMILLA = require_(resolve(RAIZ, 'functions/scripts/vocabulario-neg-v1.1.json'))

const AHORA = { seconds: 1762704000, nanoseconds: 0 } as never

describe('semilla del léxico — el script y el TS no pueden divergir', () => {
  it('el script apunta al documento correcto', () => {
    expect(script.REF).toBe('configuracion/vocabulario_neg')
  })

  it('GUARDA ANTI-OMISIÓN: el script conoce todos los campos del JSON', () => {
    expect(script.camposNoEscritos()).toEqual([])
    expect([...script.CAMPOS_ESPERADOS].sort()).toEqual([...CAMPOS_JSON_VOCABULARIO].sort())
    expect([...script.CAMPOS_ESPERADOS].sort()).toEqual(Object.keys(JSON_SEMILLA).sort())
  })

  it('los dos constructores producen el MISMO documento', () => {
    const delTs = construirSemillaVocabularioNeg('uid-x', AHORA)
    const delScript = script.construirDocSemilla('uid-x', AHORA)
    expect(delScript).toEqual(delTs)
  })

  it('el documento lleva los 43 términos, no un subconjunto', () => {
    const v = script.construirDocSemilla('uid-x', AHORA).versiones[VOCABULARIO_NEG_VERSION]
    expect(v.terminos).toHaveLength(43)
    expect(v.terminos).toEqual([...TERMINOS_NEG])
    expect(v.terminos).toEqual(JSON_SEMILLA.terminos)
  })

  it('las frecuencias NO van al documento: son el respaldo, viven en el repo', () => {
    const v = script.construirDocSemilla('uid-x', AHORA).versiones[VOCABULARIO_NEG_VERSION]
    expect(v).not.toHaveProperty('frecuencias')
    // Pero el JSON sí las tiene, para poder rehacer la derivación.
    // 48, no 43: las frecuencias son el RESPALDO de la derivación original y
    // se conservan completas. Los cinco términos que v1.1 sacó por no
    // discriminar siguen teniendo su frecuencia acá — borrarla sería borrar la
    // evidencia de por qué alguna vez fueron candidatos.
    expect(Object.keys(JSON_SEMILLA.frecuencias)).toHaveLength(48)
  })

  it('el campo que cuenta las limitaciones viaja completo', () => {
    const v = script.construirDocSemilla('uid-x', AHORA).versiones[VOCABULARIO_NEG_VERSION]
    expect(v.limitaciones).toBe(JSON_SEMILLA.limitaciones)
    expect(v.limitaciones.length).toBeGreaterThan(200)
    expect(v.limitaciones).toMatch(/V1\.30171706/)
  })

  it('nace como la vigente y con autor real', () => {
    const v = script.construirDocSemilla('uid-diego', AHORA).versiones[VOCABULARIO_NEG_VERSION]
    expect(v.vigente_hasta).toBeNull()
    expect(v.vigente_desde).toBe(AHORA)
    expect(v.autor_uid).toBe('uid-diego')
  })
})
