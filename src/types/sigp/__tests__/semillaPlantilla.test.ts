/**
 * Paridad TS ⟷ JS de la semilla de la plantilla de requisitos.
 *
 * Hay DOS constructores del mismo documento: `construirSemillaPlantillaRequisitos`
 * (TS, para la UI de A.2b) y `construirDocPlantilla` (JS, el script de siembra
 * del servidor). Este test fija que no divergen — y que la guarda anti-omisión
 * del script cubre el JSON entero.
 *
 * ORIGEN: en el despliegue del Bloque 1 el script de siembra del criterio
 * omitía `limitaciones` — el JSON lo tenía desde el 1.3b y el script nunca se
 * actualizó. El defecto era INVISIBLE: habría sembrado el documento incompleto
 * y, como la siembra aborta si el doc ya existe, no había arreglo sin otro
 * script. Se atrapó leyendo el dry-run. Esta vez la guarda nace con el script
 * y con su test.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import type { Timestamp } from 'firebase/firestore'
import {
  construirSemillaPlantillaRequisitos, plantillaVigente,
} from '../plantillaRequisitos'

const require_ = createRequire(import.meta.url)
const RAIZ = resolve(__dirname, '../../../..')

// El script se importa SIN efectos: `main()` solo corre si se ejecuta
// directamente, y `initializeApp` vive dentro de `main`.
const script = require_(resolve(RAIZ, 'functions/scripts/sembrar-plantilla-requisitos.js'))
const JSON_SEMILLA = require_(resolve(RAIZ, 'functions/scripts/plantilla-requisitos-v1.0.json'))

const {
  construirDocPlantilla, camposNoEscritos, camposDeItemNoEscritos,
  conteoPorCapitulo, CAMPOS_ESPERADOS, CAMPOS_ITEM_ESPERADOS, REF,
} = script

const ts = (ms: number) => ({ toMillis: () => ms } as unknown as Timestamp)
const AHORA = ts(7_000_000)

describe('el script apunta al documento correcto', () => {
  it('REF es `configuracion/plantilla_requisitos`', () => {
    expect(REF).toBe('configuracion/plantilla_requisitos')
  })
})

describe('PARIDAD: el constructor TS y el del script dan el MISMO documento', () => {
  it('estructura y contenido idénticos', () => {
    const js = construirDocPlantilla('uid-x', AHORA)
    const tsDoc = construirSemillaPlantillaRequisitos('uid-x', AHORA)
    expect(js).toEqual(tsDoc)
  })

  it('los 22 renglones, campo por campo, en el mismo orden', () => {
    const js = construirDocPlantilla('u', AHORA)
    const tsDoc = construirSemillaPlantillaRequisitos('u', AHORA)
    const a = js.versiones[JSON_SEMILLA.version].items
    const b = plantillaVigente(tsDoc)!.items
    expect(a).toHaveLength(b.length)
    a.forEach((item: unknown, i: number) => expect(item, `renglón ${i}`).toEqual(b[i]))
  })

  it('ambos son puros: mismas entradas, mismo resultado', () => {
    expect(construirDocPlantilla('a', AHORA)).toEqual(construirDocPlantilla('a', AHORA))
  })

  it('el autor y el reloj entran por parámetro en los dos', () => {
    const v = construirDocPlantilla('uid-pedro', AHORA).versiones[JSON_SEMILLA.version]
    expect(v.autor_uid).toBe('uid-pedro')
    expect(v.vigente_desde).toBe(AHORA)
    expect(v.vigente_hasta).toBeNull()
  })
})

describe('GUARDA ANTI-OMISIÓN — el JSON no puede ganar campos que el script ignore', () => {
  it('hoy no hay ninguno sin escribir, ni en la raíz ni en los renglones', () => {
    expect(camposNoEscritos()).toEqual([])
    expect(camposDeItemNoEscritos()).toEqual([])
  })

  it('CADA clave de la raíz del JSON está contemplada', () => {
    // Recorre el JSON, no una lista fija: si mañana la plantilla gana un
    // campo y nadie toca el script, cae aquí.
    for (const k of Object.keys(JSON_SEMILLA)) {
      expect(CAMPOS_ESPERADOS, `falta "${k}" en CAMPOS_ESPERADOS`).toContain(k)
    }
  })

  it('CADA clave de los renglones está contemplada', () => {
    for (const item of JSON_SEMILLA.items) {
      for (const k of Object.keys(item)) {
        expect(CAMPOS_ITEM_ESPERADOS, `falta "${k}" en CAMPOS_ITEM_ESPERADOS`).toContain(k)
      }
    }
  })

  it('un campo nuevo en la raíz sería DELATADO', () => {
    const inventado = [...Object.keys(JSON_SEMILLA), 'revision_2027']
    expect(inventado.filter(k => !CAMPOS_ESPERADOS.includes(k))).toEqual(['revision_2027'])
  })

  it('un campo nuevo en un renglón también', () => {
    const inventado = ['capitulo', 'categoria', 'descripcion', 'tipo_evidencia', 'obligatorio']
    expect(inventado.filter(k => !CAMPOS_ITEM_ESPERADOS.includes(k))).toEqual(['obligatorio'])
  })
})

describe('las NOTAS del JSON son documentación, no dato', () => {
  it('`nota_descripcion` y `nota_capitulo` NO viajan al documento', () => {
    // Están en CAMPOS_ESPERADOS para que la guarda no aborte, pero el
    // documento sembrado no las lleva: son para quien revise el JSON.
    const doc = construirDocPlantilla('u', AHORA)
    const serializado = JSON.stringify(doc)
    expect(JSON_SEMILLA.nota_descripcion).toBeTruthy()
    expect(JSON_SEMILLA.nota_capitulo).toBeTruthy()
    expect(serializado).not.toContain(JSON_SEMILLA.nota_descripcion)
    expect(serializado).not.toContain(JSON_SEMILLA.nota_capitulo)
  })

  it('el `origen` SÍ viaja — es la procedencia de la lista, auditable', () => {
    const v = construirDocPlantilla('u', AHORA).versiones[JSON_SEMILLA.version]
    expect(v.origen).toBe(JSON_SEMILLA.origen)
  })
})

describe('conteoPorCapitulo del script', () => {
  it('coincide con el reporte del área: 10 / 5 / 7', () => {
    expect(conteoPorCapitulo(JSON_SEMILLA.items))
      .toEqual({ juridicos: 10, tecnicos: 5, financieros: 7 })
  })
})
