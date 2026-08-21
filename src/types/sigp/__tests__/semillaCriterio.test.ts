/**
 * Regresión de la SEMILLA del criterio del semáforo.
 *
 * ORIGEN: el script `sembrar-semaforo-versiones.js` se escribió en el 1.2,
 * cuando el criterio tenía cuatro campos. En el 1.3b el criterio ganó
 * `limitaciones` — el texto que dice que v1.0 habría bloqueado tres
 * adjudicaciones reales de 2023 — y se agregó al JSON, a la constante TS y a
 * los tests… pero NO al script. El JSON lo tenía y el script lo descartaba.
 *
 * El defecto era INVISIBLE: el documento se habría sembrado sin `limitaciones`
 * y la pantalla del "rojo informado" habría mostrado VACÍA exactamente la
 * sección contra la que se diseñó. Y como la siembra aborta si el documento ya
 * existe, no había forma de corregirlo sin un script aparte.
 *
 * El test anterior (`semaforoVersiones.test.ts`) comparaba la constante TS
 * contra el JSON — los dos lados que SÍ estaban bien. Nadie miraba al script.
 * Este lo mira.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require_ = createRequire(import.meta.url)
const RAIZ = resolve(__dirname, '../../../..')

// El script se importa SIN efectos: `main()` solo corre si se ejecuta
// directamente, y `initializeApp` vive dentro de `main`.
const script = require_(resolve(RAIZ, 'functions/scripts/sembrar-semaforo-versiones.js'))
const JSON_SEMILLA = require_(resolve(RAIZ, 'functions/scripts/semaforo-v1.0.json'))

const { construirDocSemilla, camposNoEscritos, CAMPOS_ESPERADOS } = script

/** Campos de texto del criterio que el documento tiene que llevar. */
const CAMPOS_TEXTO = ['definicion', 'motivo', 'calibracion', 'limitaciones'] as const

const doc = () => construirDocSemilla('uid-de-prueba', 'TS-DE-PRUEBA')
const version = () => doc().versiones[JSON_SEMILLA.version]

describe('el documento sembrado lleva TODO el JSON, carácter por carácter', () => {
  it.each(CAMPOS_TEXTO)('%s coincide exactamente con el JSON', campo => {
    expect(version()[campo]).toBe(JSON_SEMILLA[campo])
  })

  it('CLAVE: `limitaciones` está presente y NO está vacío', () => {
    // El defecto exacto: el campo faltaba entero. Un `toBe(undefined)` en el
    // resto del suite no lo habría delatado — nadie lo miraba.
    const l = version().limitaciones
    expect(l).toBeDefined()
    expect(typeof l).toBe('string')
    expect(l.length).toBeGreaterThan(0)
  })

  it('`limitaciones` conserva el caso de 2023 — es lo que la UI muestra', () => {
    const l: string = version().limitaciones
    expect(l).toContain('NO está validado sobre 2023')
    expect(l).toContain('Selección Abreviada de Menor Cuantía')
    expect(l).toContain('las habría marcado en rojo')
  })
})

describe('el JSON no puede ganar campos que el script ignore', () => {
  it('hoy no hay ninguno sin escribir', () => {
    expect(camposNoEscritos()).toEqual([])
  })

  it('CADA clave del JSON, salvo `version`, viaja al documento', () => {
    // Ésta es la afirmación que faltaba: recorre el JSON, no una lista fija.
    // Si mañana el criterio gana un campo y nadie toca el script, cae aquí.
    const delJson = Object.keys(JSON_SEMILLA).filter(k => k !== 'version')
    const delDoc = Object.keys(version())
    for (const k of delJson) expect(delDoc, `falta "${k}" en el documento`).toContain(k)
  })

  it('CAMPOS_ESPERADOS cubre el JSON entero (la guarda del script sirve)', () => {
    for (const k of Object.keys(JSON_SEMILLA)) expect(CAMPOS_ESPERADOS).toContain(k)
  })

  it('un JSON con un campo nuevo sería DELATADO por la guarda', () => {
    // Simula el futuro: la guarda compara contra CAMPOS_ESPERADOS, así que un
    // campo desconocido sale en la lista y el script aborta antes de sembrar.
    const inventado = ['version', 'definicion', 'motivo', 'calibracion', 'limitaciones', 'revision_2027']
    expect(inventado.filter(k => !CAMPOS_ESPERADOS.includes(k))).toEqual(['revision_2027'])
  })
})

describe('forma del documento', () => {
  it('la versión del JSON es la clave y también `version_actual`', () => {
    expect(Object.keys(doc().versiones)).toEqual([JSON_SEMILLA.version])
    expect(doc().version_actual).toBe(JSON_SEMILLA.version)
  })

  it('nace vigente: `vigente_hasta` en null', () => {
    expect(version().vigente_hasta).toBeNull()
  })

  it('el autor y el reloj entran por parámetro — la función es pura', () => {
    expect(version().autor_uid).toBe('uid-de-prueba')
    expect(version().vigente_desde).toBe('TS-DE-PRUEBA')
    expect(construirDocSemilla('a', 't')).toEqual(construirDocSemilla('a', 't'))
  })
})
