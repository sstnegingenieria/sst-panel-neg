// El script de adopción del criterio: su planificador es PURO, así que se
// prueba acá sin red, igual que `construirDocSemilla`.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { RESUMEN_V1_1, ANTES_DE_DESCARTAR_V1_1, LIMITACIONES_V1_1 } from '../semaforoVersiones'

const req = createRequire(import.meta.url)
const { planAdopcion, CAMPOS_ESPERADOS } = req('../../../../functions/scripts/adoptar-semaforo-v1.1.js')
const FUENTE_SCRIPT = readFileSync(
  resolve(__dirname, '../../../../functions/scripts/adoptar-semaforo-v1.1.js'), 'utf8')
const NUEVA = req('../../../../functions/scripts/semaforo-v1.1.json')

const AHORA = { toMillis: () => 1_000 } as unknown as never
const actual = {
  version_actual: 'v1.0',
  versiones: {
    'v1.0': {
      vigente_desde: AHORA, vigente_hasta: null, autor_uid: 'u',
      definicion: 'la vieja', motivo: 'm', calibracion: 'c', limitaciones: 'l',
    },
  },
}

describe('el JSON que el script escribe viene de la fuente única', () => {
  it('no es una copia a mano: coincide con el TS carácter por carácter', () => {
    expect(NUEVA.resumen).toBe(RESUMEN_V1_1)
    expect(NUEVA.antes_de_descartar).toBe(ANTES_DE_DESCARTAR_V1_1)
    expect(NUEVA.limitaciones).toBe(LIMITACIONES_V1_1)
  })

  it('trae los seis campos que el script exige', () => {
    for (const c of CAMPOS_ESPERADOS) expect(String(NUEVA[c] ?? '').trim(), c).not.toBe('')
  })
})

describe('planAdopcion', () => {
  it('agrega v1.1, cierra v1.0 y mueve version_actual', () => {
    const p = planAdopcion(actual, 'uid-g', AHORA)
    expect(p.doc.version_actual).toBe('v1.1')
    expect(Object.keys(p.doc.versiones).sort()).toEqual(['v1.0', 'v1.1'])
    expect(p.doc.versiones['v1.0'].vigente_hasta).toBe(AHORA)
    expect(p.doc.versiones['v1.1'].vigente_hasta).toBeNull()
    expect(p.doc.versiones['v1.1'].autor_uid).toBe('uid-g')
  })

  it('CLAVE: el texto de la versión anterior NO se toca', () => {
    // Los documentos que llevan v1.0 sellada tienen que poder seguir
    // explicándose. La historia se cierra, no se reescribe.
    const p = planAdopcion(actual, 'uid-g', AHORA)
    expect(p.doc.versiones['v1.0'].definicion).toBe('la vieja')
    expect(p.doc.versiones['v1.0'].limitaciones).toBe('l')
  })

  it('y v1.0 NO gana los campos nuevos', () => {
    const p = planAdopcion(actual, 'uid-g', AHORA)
    expect(p.doc.versiones['v1.0'].resumen).toBeUndefined()
  })

  it('ABORTA si v1.1 ya está: adoptar dos veces movería su fecha', () => {
    const yaAdoptado = {
      version_actual: 'v1.1',
      versiones: { ...actual.versiones, 'v1.1': { definicion: 'x' } },
    }
    expect(planAdopcion(yaAdoptado, 'uid-g', AHORA).error).toMatch(/YA ESTÁ/)
  })

  it('ABORTA si version_actual apunta a algo que no está en el mapa', () => {
    const roto = { version_actual: 'v9.9', versiones: actual.versiones }
    expect(planAdopcion(roto, 'uid-g', AHORA).error).toMatch(/no está en el mapa/)
  })

  it('es pura: mismos argumentos, mismo plan', () => {
    expect(planAdopcion(actual, 'u', AHORA)).toEqual(planAdopcion(actual, 'u', AHORA))
  })
})

describe('el proyecto va EXPLÍCITO en initializeApp', () => {
  it('no se deja resolver solo', () => {
    // `getExplicitProjectId` del Admin SDK saca el proyecto de la credencial
    // SOLO cuando es una llave de cuenta de servicio. Con las credenciales por
    // defecto de un USUARIO —que es como corre este acto— la credencial es un
    // `RefreshTokenCredential` y ese paso no dispara: sin esto, el script
    // moriría con «Unable to detect a Project Id» a mitad del acto.
    expect(FUENTE_SCRIPT).toContain("const PROYECTO = 'neg-sst-app'")
    expect(FUENTE_SCRIPT).toContain('admin.initializeApp({ projectId: PROYECTO })')
    expect(FUENTE_SCRIPT).not.toContain('admin.initializeApp()')
  })

  it('escribe en un solo proyecto, y está nombrado', () => {
    // El accidente inverso: un GOOGLE_CLOUD_PROJECT olvidado apuntando a otro
    // lado. Con el proyecto declarado, esa variable no tiene voz.
    const nombrados = [...FUENTE_SCRIPT.matchAll(/'(neg-[a-z-]+)'/g)].map(m => m[1])
    expect([...new Set(nombrados)]).toEqual(['neg-sst-app'])
  })
})
